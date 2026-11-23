import { Types } from "mongoose"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import { REGIONS, type RegionCode } from "@/lib/region"
import { getRegionContext } from "@/lib/region-scope"
import { zoneForRegion } from "@/lib/time/zone"
import { LEAD_IMPORT_RULES, META_DEFAULT_SOURCE } from "@/config/leadImportSheet"
import {
    AD_PLATFORM,
    LEAD_IMPORT_ROW_RESULT,
    LEAD_IMPORT_STATUS,
    isImportedResult,
    type AdPlatform,
    type AdSourceCounts,
    type LeadImportCounts,
} from "@/constants/adTracking"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { EVENT_CODE } from "@/constants/eventTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { LEAD_STATUS } from "@/constants/leadStatus"
import { auditedCreate } from "@/lib/activity-log"
import { ACTION_CREATE } from "@/lib/activity-log/logEntityChanges"
import { LeadSourceError } from "@/lib/lead-sources/http"
import { readSheetFile, sheetFileType, type SheetGrid } from "@/lib/lead-sources/sheet/readSheet"
import { emitNotification } from "@/lib/notifications/emit"
import { invalidateStatsSnapshot } from "@/lib/stats/invalidateStats"
import ActivityLog from "@/models/ActivityLog"
import Interaction from "@/models/Interaction"
import Lead from "@/models/Lead"
import LeadImport from "@/models/LeadImport"
import { checkImportRows, type CheckedLeadRow } from "./checkRows"
import { markExistingLeads } from "./duplicates"
import { buildImportNote } from "./note"
import {
    buildBreakdown,
    formIdOf,
    pickReference,
    planSources,
    previewSources,
    saveSources,
    type SourceIds,
} from "./resolveSources"
import { findImportHeaderRow, type ImportHeaderMatch } from "./sheet"

/**
 * The bulk lead import, from the file to the saved report.
 *
 *   1. Read the file. Find the header row. Refuse the file if it has no
 *      name or no phone column.
 *   2. Check every row (checkRows.ts) and mark the leads already in the CRM
 *      (duplicates.ts).
 *   3. Fold the ad ids of all rows into one entry each (resolveSources.ts).
 *
 * With `check: true` it stops here and returns what would happen. Nothing
 * is written. The import page shows this before the person confirms.
 *
 *   4. Save the import record, then the ad records: one bulk upsert per
 *      level, so each campaign, ad set, ad and form exists once.
 *   5. Insert the leads, each pointing at its most specific ad record.
 *   6. Insert one note per lead, with the form answers.
 *   7. Link duplicates that have no ad yet (for example, leads that came in
 *      through the Facebook webhook) to the ad of their row.
 *   8. Write the activity log rows, clear the stats cache, save the report.
 *   9. Send ONE notification for the whole sheet, in the importer's name.
 *
 * Every step works on the whole file at once. The number of database round
 * trips does not grow with the number of rows.
 *
 * If a step from 4 on fails, the leads and notes already saved are removed
 * and the import is marked failed. Ad records stay: they are real, and the
 * next import reuses them. Ad links already added to existing leads (step
 * 7) stay too, for the same reason.
 */

export interface LeadImportInput {
    file: File
    region: RegionCode
    platform: AdPlatform
    /** Lead.source for a non-Meta list. A Meta row reads its own platform column. */
    source: string
    user: AuthUser
    check: boolean
}

export interface ImportReportColumn {
    key: string
    header: string
    label: string
    known: boolean
}

export interface ImportReportRow {
    n: number
    values: string[]
    result: number
    messages: string[]
    leadId?: string
}

export interface LeadImportCheckResult {
    check: true
    fileName: string
    sheetName: string
    headerRow: number
    platform: AdPlatform
    columns: ImportReportColumn[]
    fileNotes: string[]
    rows: ImportReportRow[]
    counts: LeadImportCounts
    newSources: AdSourceCounts
}

export interface LeadImportDoneResult {
    check: false
    importId: string
    counts: LeadImportCounts
    newSources: AdSourceCounts
}

/** Longest cell kept in the report copy. */
const REPORT_CELL_MAX = 500

/** The report is one document, capped at 16 MB by MongoDB. Refuse well before. */
const REPORT_MAX_BYTES = 10_000_000

export async function runLeadImport(input: LeadImportInput): Promise<LeadImportCheckResult | LeadImportDoneResult> {
    const { file, region, platform, user } = input

    const type = sheetFileType(file.name)
    if (file.size > LEAD_IMPORT_RULES.maxFileMb * 1024 * 1024) {
        throw new LeadSourceError(`The file is larger than ${LEAD_IMPORT_RULES.maxFileMb} MB. Split it into smaller files.`, 413)
    }
    if (file.size === 0) throw new LeadSourceError("The file is empty.", 400)

    const sheets = await readSheetFile(await file.arrayBuffer(), type)
    const { sheet, headerIndex, match } = pickSheet(sheets)

    const zone = zoneForRegion(region)
    const source = platform === AD_PLATFORM.META ? META_DEFAULT_SOURCE : input.source

    const rows = checkImportRows(sheet.rows, headerIndex, match, {
        platform,
        source,
        fallbackCountry: REGIONS[region].phoneCountry,
        zone,
    })

    const fileNotes = describeFile(sheets, sheet, headerIndex, match, platform)

    await markExistingLeads(rows)
    const plan = planSources(rows)

    const columns: ImportReportColumn[] = match.columns.map((c) => ({
        key: c.key,
        header: c.header,
        label: c.label,
        known: c.known,
    }))

    if (input.check) {
        for (const { row, existing, first } of reachableDuplicates(rows)) {
            if (!first || existing.hasSource || !hasAnyRef(row)) continue
            row.linked = true
            row.messages = [...row.messages, "It has no ad yet. Importing links it to the ad on this row."]
        }
        return {
            check: true,
            fileName: file.name,
            sheetName: sheet.name,
            headerRow: headerIndex + 1,
            platform,
            columns,
            fileNotes,
            rows: rows.map(reportRow),
            counts: countRows(rows),
            newSources: await previewSources(platform, plan),
        }
    }

    refuseOversizedReport(rows)

    const record = await auditedCreate(
        LeadImport,
        ENTITY_TYPE.LEAD_IMPORT,
        {
            region,
            platform,
            source,
            fileName: file.name.slice(0, 200),
            fileSize: file.size,
            sheetName: sheet.name,
            headerRow: headerIndex + 1,
            uploadedBy: new Types.ObjectId(user.id),
            status: LEAD_IMPORT_STATUS.PROCESSING,
        },
        user.id
    )
    const importId = record._id as Types.ObjectId

    const saved: SavedIds = { leads: new Map(), notes: [] }
    let created: AdSourceCounts
    let counts: LeadImportCounts

    try {
        const sources = await saveSources(platform, plan, { userId: user.id, importId })
        created = sources.created

        await insertLeads(rows, sources.ids, saved, { region, platform, importId, user, fileName: file.name, zone })
        const linked = await linkDuplicates(rows, sources.ids, platform)

        await writeActivityLog(saved, linked, user.id)
        await invalidateStatsSnapshot().catch((error) => console.error("[ad-tracking] stats reset failed:", error))

        counts = countRows(rows)

        // A plain update. The audited helpers read the whole document before
        // and after, and `rows` can be a megabyte. The create above is the
        // audit row for the import.
        await LeadImport.updateOne(
            { _id: importId },
            {
                $set: {
                    columns,
                    fileNotes,
                    rows: rows.map((row) => {
                        const report = reportRow(row)
                        const leadId = saved.leads.get(row.n) ?? linked.leadOf.get(row.n)
                        return leadId ? { ...report, leadId } : report
                    }),
                    counts,
                    newSources: created,
                    breakdown: buildBreakdown(rows, plan, sources.ids),
                    status: LEAD_IMPORT_STATUS.DONE,
                },
            }
        )
    } catch (error) {
        console.error("[ad-tracking] import failed, rolling back", importId, error)
        await rollBack(importId, saved)
        throw new LeadSourceError("Saving the leads failed. Nothing was imported. Try again.", 500)
    }

    if (counts.imported > 0) {
        const sources = [...new Set(rows.filter((r) => isImportedResult(r.result)).map((r) => r.source))]
        await emitNotification({
            type: EVENT_CODE.LEADS_IMPORTED,
            entityType: ENTITY_TYPE.LEAD_IMPORT,
            entityId: importId,
            actor: { id: user.id, name: user.name, role: user.role },
            payload: {
                import: { _id: importId, fileName: file.name },
                imported: counts.imported,
                duplicates: counts.duplicates,
                failed: counts.failed,
                sources,
            },
        })
    }

    return { check: false, importId: importId.toString(), counts, newSources: created }
}

interface SavedIds {
    /** Row number to the lead it created. */
    leads: Map<number, Types.ObjectId>
    notes: Types.ObjectId[]
}

async function insertLeads(
    rows: CheckedLeadRow[],
    ids: SourceIds,
    saved: SavedIds,
    ctx: {
        region: RegionCode
        platform: AdPlatform
        importId: Types.ObjectId
        user: AuthUser
        fileName: string
        zone: string
    }
): Promise<void> {
    const toInsert = rows.filter((r) => isImportedResult(r.result))
    if (toInsert.length === 0) return

    const now = new Date()
    const userId = new Types.ObjectId(ctx.user.id)
    const planned = toInsert.map((row) => ({ row, leadId: new Types.ObjectId(), noteId: new Types.ObjectId() }))

    const leadDocs = planned.map(({ row, leadId, noteId }) => {
        const ref = pickReference(row, ids)
        const form = formIdOf(row, ids)
        return {
            _id: leadId,
            name: row.name,
            ...(row.email ? { email: row.email } : {}),
            phone: row.phone,
            source: row.source,
            region: ctx.region,
            status: LEAD_STATUS.NEW,
            platform: ctx.platform,
            ...(ref ? { sourceReference: ref.id, sourceReferenceModel: ref.model } : {}),
            ...(form ? { leadForm: form } : {}),
            ...(row.externalLeadId ? { externalLeadId: row.externalLeadId } : {}),
            ...(row.submittedAt ? { submittedAt: row.submittedAt } : {}),
            importId: ctx.importId,
            createdBy: userId,
            lastInteractionAt: now,
            lastInteractionId: noteId,
        }
    })

    // insertMany skips the save hooks, so the audit plugin writes nothing
    // here. writeActivityLog adds the same CREATE rows afterwards. It does
    // validate, so regionScopePlugin still checks the region of every lead.
    //
    // Unordered: when another import saves the same phone at the same
    // moment, only that lead is refused by the unique index, not the rest.
    //
    // throwOnValidationError: without it, Mongoose skips an invalid lead in
    // silence, and the row would be reported as a duplicate. With it, the
    // import fails and is rolled back, which is the honest result.
    try {
        await Lead.insertMany(leadDocs, { ordered: false, throwOnValidationError: true })
    } catch (error) {
        if (!onlyDuplicateKeyErrors(error)) throw error
    }

    // Which ones went in. One read, by the ids made above.
    const present = await Lead.collection
        .find({ _id: { $in: planned.map((p) => p.leadId) } }, { projection: { _id: 1 } })
        .toArray()
    const inserted = new Set(present.map((d) => String(d._id)))

    const notes: Array<Record<string, unknown>> = []
    for (const { row, leadId, noteId } of planned) {
        if (!inserted.has(String(leadId))) {
            row.result = LEAD_IMPORT_ROW_RESULT.DUPLICATE
            row.messages = ["Another import saved this lead at the same moment."]
            continue
        }

        saved.leads.set(row.n, leadId)
        const note = buildImportNote(row, {
            fileName: ctx.fileName,
            userName: ctx.user.name || ctx.user.email || "a user",
            zone: ctx.zone,
        })
        notes.push({
            _id: noteId,
            region: ctx.region,
            entityType: ENTITY_TYPE.LEAD,
            entityId: leadId,
            type: INTERACTION_TYPE.NOTE_ADDED,
            title: note.title,
            description: note.description,
            createdBy: userId,
            editHistory: [],
            createdAt: now,
            updatedAt: now,
            __v: 0,
        })
    }

    if (notes.length === 0) return

    // Straight to the collection, past Mongoose. Interaction's region plugin
    // reads the parent lead once per note to copy its region, which would be
    // one query per row. The region is set here instead, and it is the same
    // region the leads above were checked and saved in. No notification is
    // sent for these notes: the import sends one for the whole sheet.
    await Interaction.collection.insertMany(notes, { ordered: true })
    saved.notes = notes.map((n) => n._id as Types.ObjectId)
}

function onlyDuplicateKeyErrors(error: unknown): boolean {
    const e = error as { code?: number; writeErrors?: Array<{ code?: number; err?: { code?: number } }> }
    const writeErrors = e?.writeErrors ?? []
    if (writeErrors.length === 0) return e?.code === 11000
    return writeErrors.every((w) => (w.code ?? w.err?.code) === 11000)
}

/**
 * A duplicate row names the ad its lead came from. When the lead already in
 * the CRM has no ad yet, the row's ad is added to it, and its Meta lead id
 * if it has none. Nothing that is already set is changed.
 *
 * This is what makes a Meta export useful after the webhook: the webhook
 * saves the lead within seconds but knows nothing of the ad set or the
 * campaign. Importing the export afterwards fills that in.
 *
 * Only leads in a region the importer can read are touched. Deleted leads
 * are left alone.
 */
async function linkDuplicates(
    rows: CheckedLeadRow[],
    ids: SourceIds,
    platform: AdPlatform
): Promise<{ fields: Array<{ leadId: Types.ObjectId; field: string; value: unknown }>; leadOf: Map<number, Types.ObjectId> }> {
    const ops: Array<Record<string, unknown>> = []
    const fields: Array<{ leadId: Types.ObjectId; field: string; value: unknown }> = []
    const leadOf = new Map<number, Types.ObjectId>()
    const now = new Date()

    for (const { row, existing, first } of reachableDuplicates(rows)) {
        const leadId = existing._id as Types.ObjectId
        leadOf.set(row.n, leadId)

        // Two rows of one file can point at the same lead. The first wins.
        if (!first) continue

        const ref = existing.hasSource ? null : pickReference(row, ids)
        if (ref) {
            const set: Record<string, unknown> = {
                platform,
                sourceReference: ref.id,
                sourceReferenceModel: ref.model,
                updatedAt: now,
            }
            const form = formIdOf(row, ids)
            if (form) set.leadForm = form
            if (row.submittedAt) set.submittedAt = row.submittedAt

            ops.push({ updateOne: { filter: { _id: leadId, deletedAt: null, sourceReference: null }, update: { $set: set } } })
            for (const [field, value] of Object.entries(set)) {
                if (field !== "updatedAt") fields.push({ leadId, field, value })
            }
            row.linked = true
            row.messages = [...row.messages, "It had no ad yet, so it was linked to the ad on this row."]
        }

        if (!existing.hasExternalId && row.externalLeadId) {
            ops.push({
                updateOne: {
                    filter: { _id: leadId, deletedAt: null, externalLeadId: null },
                    update: { $set: { externalLeadId: row.externalLeadId, updatedAt: now } },
                },
            })
            fields.push({ leadId, field: "externalLeadId", value: row.externalLeadId })
        }
    }

    if (ops.length > 0) {
        // Raw driver, so the region filter of the Lead model is not added.
        // The region was checked above, against the importer's own regions.
        try {
            await Lead.collection.bulkWrite(ops as never, { ordered: false })
        } catch (error) {
            // A Meta lead id another lead already holds. Rare, and harmless
            // to skip: the rest of the links are written.
            if (!onlyDuplicateKeyErrors(error)) throw error
        }
    }

    return { fields, leadOf }
}

/**
 * Duplicate rows whose lead the importer may change: not deleted, and in a
 * region the importer can read. `first` is false for a second row that
 * points at the same lead.
 */
function reachableDuplicates(
    rows: CheckedLeadRow[]
): Array<{ row: CheckedLeadRow; existing: NonNullable<CheckedLeadRow["existing"]>; first: boolean }> {
    const ctx = getRegionContext()
    const allowed: readonly string[] | null = ctx && !ctx.bypass ? ctx.regions : null
    const seen = new Set<string>()
    const out: Array<{ row: CheckedLeadRow; existing: NonNullable<CheckedLeadRow["existing"]>; first: boolean }> = []

    for (const row of rows) {
        const existing = row.existing
        if (row.result !== LEAD_IMPORT_ROW_RESULT.DUPLICATE || !existing || existing.deleted) continue
        if (allowed && (!existing.region || !allowed.includes(existing.region))) continue
        const key = String(existing._id)
        out.push({ row, existing, first: !seen.has(key) })
        seen.add(key)
    }

    return out
}

function hasAnyRef(row: CheckedLeadRow): boolean {
    const { campaign, adSet, ad, form } = row.refs
    return !!(campaign || adSet || ad || form)
}

/**
 * The same activity log rows the audit plugin writes for one lead created
 * by hand: one CREATE row per lead and per note, in the importer's name.
 * Plus one row per field set on an existing lead by linkDuplicates.
 */
async function writeActivityLog(
    saved: SavedIds,
    linked: { fields: Array<{ leadId: Types.ObjectId; field: string; value: unknown }> },
    actorId: string
): Promise<void> {
    const userId = new Types.ObjectId(actorId)
    const create = (entityType: number, id: Types.ObjectId) => ({
        entityType,
        entityId: id,
        action: ACTION_CREATE,
        oldData: null,
        newData: id.toString(),
        userId,
    })

    const ops = [
        ...[...saved.leads.values()].map((id) => create(ENTITY_TYPE.LEAD, id)),
        ...saved.notes.map((id) => create(ENTITY_TYPE.INTERACTION, id)),
        ...linked.fields.map((f) => ({
            entityType: ENTITY_TYPE.LEAD,
            entityId: f.leadId,
            action: f.field,
            oldData: null,
            newData: f.value instanceof Types.ObjectId ? f.value.toString() : f.value,
            userId,
        })),
    ]
    if (ops.length === 0) return

    try {
        await ActivityLog.insertMany(ops, { ordered: false })
    } catch (error) {
        // The leads are saved. A lost log row is logged, never thrown, the
        // same rule as src/lib/activity-log.
        console.error("[ad-tracking] activity log insert failed:", error)
    }
}

async function rollBack(importId: Types.ObjectId, saved: SavedIds): Promise<void> {
    const leadIds = [...saved.leads.values()]
    await Promise.all([
        Lead.collection.deleteMany({ importId }).catch(() => undefined),
        saved.notes.length > 0
            ? Interaction.collection.deleteMany({ _id: { $in: saved.notes } }).catch(() => undefined)
            : undefined,
        leadIds.length + saved.notes.length > 0
            ? ActivityLog.collection
                  .deleteMany({ entityId: { $in: [...leadIds, ...saved.notes] }, action: ACTION_CREATE })
                  .catch(() => undefined)
            : undefined,
    ])
    await LeadImport.updateOne(
        { _id: importId },
        { $set: { status: LEAD_IMPORT_STATUS.FAILED, error: "Saving the leads failed. Nothing was imported." } }
    ).catch(() => undefined)
}

export function countRows(rows: CheckedLeadRow[]): LeadImportCounts {
    const counts: LeadImportCounts = { read: rows.length, imported: 0, warned: 0, duplicates: 0, failed: 0, linked: 0 }
    for (const row of rows) {
        if (row.linked) counts.linked++
        if (isImportedResult(row.result)) counts.imported++
        if (row.result === LEAD_IMPORT_ROW_RESULT.WARNED) counts.warned++
        if (row.result === LEAD_IMPORT_ROW_RESULT.DUPLICATE) counts.duplicates++
        if (row.result === LEAD_IMPORT_ROW_RESULT.FAILED) counts.failed++
    }
    return counts
}

function reportRow(row: CheckedLeadRow): ImportReportRow {
    return {
        n: row.n,
        values: row.values.map((v) => (v.length > REPORT_CELL_MAX ? `${v.slice(0, REPORT_CELL_MAX)}…` : v)),
        result: row.result,
        messages: row.messages,
    }
}

function refuseOversizedReport(rows: CheckedLeadRow[]): void {
    let total = 0
    for (const row of rows) {
        for (const v of row.values) total += Math.min(Buffer.byteLength(v, "utf8"), REPORT_CELL_MAX * 4) + 8
        for (const m of row.messages) total += Buffer.byteLength(m, "utf8") + 8
    }
    if (total > REPORT_MAX_BYTES) {
        throw new LeadSourceError("This file holds too much text for one import. Split it into smaller files.", 413)
    }
}

/** The first sheet with a complete header row. */
function pickSheet(sheets: SheetGrid[]): { sheet: SheetGrid; headerIndex: number; match: ImportHeaderMatch } {
    let closest: { match: ImportHeaderMatch; score: number } | null = null

    for (const sheet of sheets) {
        const found = findImportHeaderRow(sheet.rows)
        if (!found) continue
        if (found.complete) return { sheet, headerIndex: found.index, match: found.match }
        const score = found.match.columns.filter((c) => c.known).length
        if (!closest || score > closest.score) closest = { match: found.match, score }
    }

    if (!closest) throw new LeadSourceError("The file has no rows.", 400)

    const missing = closest.match.missingRequired
    throw new LeadSourceError(
        `The header row needs a name column (full_name) and a phone column (phone_number or work_phone_number). ` +
            `Missing: ${missing.join(", ")}.`,
        400,
        { field: "file", details: { missing, found: closest.match.columns.map((c) => c.header) } }
    )
}

const META_ID_KEYS = new Set(["adId", "adSetId", "campaignId", "formId"])

function describeFile(
    sheets: SheetGrid[],
    sheet: SheetGrid,
    headerIndex: number,
    match: ImportHeaderMatch,
    platform: AdPlatform
): string[] {
    const notes: string[] = []

    if (sheets.length > 1) notes.push(`The file has ${sheets.length} sheets. Read the sheet "${sheet.name}".`)
    if (headerIndex > 0) notes.push(`The header row is row ${headerIndex + 1}. The rows above it were not read.`)

    for (const shared of match.shared) {
        notes.push(`${shared.headers.join(" and ")} both mean ${shared.label}. Each row uses the first one with a value.`)
    }

    if (match.questions.length > 0) {
        notes.push(
            `Read as form questions. Their answers go into each lead's first note: ` +
                `${match.questions.map((q) => q.label).join(" · ")}`
        )
    }

    if (match.blankHeaders.length > 0) {
        notes.push(`Column ${match.blankHeaders.join(", ")} has values but no header. It was not read.`)
    }

    const hasIds = match.columns.some((c) => META_ID_KEYS.has(c.key))
    if (platform === AD_PLATFORM.META && !hasIds) {
        notes.push("The file has no ad_id, adset_id, campaign_id or form_id column. The leads are imported without an ad.")
    }
    if (platform !== AD_PLATFORM.META && hasIds) {
        notes.push("The file has Meta columns (ad_id, campaign_id ...). They were not read. Choose Meta to link the leads to their ads.")
    }

    return notes
}
