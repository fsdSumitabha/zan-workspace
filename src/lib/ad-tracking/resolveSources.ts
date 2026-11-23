import { Types, type Model } from "mongoose"
import {
    LEAD_IMPORT_ROW_RESULT,
    isImportedResult,
    type AdModelName,
    type AdPlatform,
    type AdSourceCounts,
} from "@/constants/adTracking"
import Ad from "@/models/Ad"
import AdCampaign from "@/models/AdCampaign"
import AdSet from "@/models/AdSet"
import LeadForm from "@/models/LeadForm"
import type { ILeadImportBreakdownRow } from "@/models/LeadImport"
import type { CheckedLeadRow, RowRef } from "./checkRows"

/**
 * Turns the ad ids named on the rows into ad records, without repeats.
 *
 * ## Why it is fast
 *
 * A sheet of 250 leads from one campaign names that campaign 250 times. The
 * slow way is to look it up 250 times. Here the rows are first folded into
 * one entry per id (planSources), then each level is written with ONE
 * bulkWrite of upserts and read back with ONE find. Four levels, so about
 * eight round trips to the database, whatever the number of rows.
 *
 * ## Why it never makes a copy
 *
 * Every write is an upsert on { platform, externalId }, and that pair has a
 * unique index. Two imports of the same file at the same moment still end
 * with one record: MongoDB retries an upsert that loses that race.
 *
 * ## Which name wins
 *
 * A campaign can be renamed in Meta. The name kept is the one from the
 * newest lead (by created_time) that named it, across every import. So an
 * old export imported late does not bring back an old name. Every name
 * ever seen is kept in `aliases`, so search finds the old name too.
 */

export type SourceLevel = "campaigns" | "adSets" | "ads" | "forms"

export const SOURCE_LEVELS: SourceLevel[] = ["campaigns", "adSets", "ads", "forms"]

interface PlannedSource {
    externalId: string
    /** The name from the newest row that gave one. */
    name: string
    names: Set<string>
    /** The newest created_time of the rows that named it. Null when no row had one. */
    seenAt: Date | null
    /** Parent ids, for ad sets and ads. Platform ids, not ObjectIds yet. */
    campaign?: string
    adSet?: string
    form?: string
    /** Questions answered on rows of this form. Forms only. */
    questions?: Map<string, string>
}

export type SourcePlan = Record<SourceLevel, Map<string, PlannedSource>>

export type SourceIds = Record<SourceLevel, Map<string, Types.ObjectId>>

export function planSources(rows: CheckedLeadRow[]): SourcePlan {
    const plan: SourcePlan = { campaigns: new Map(), adSets: new Map(), ads: new Map(), forms: new Map() }

    for (const row of rows) {
        const { campaign, adSet, ad, form } = row.refs
        const at = row.submittedAt

        if (campaign) note(plan.campaigns, campaign, at, {})
        if (adSet) note(plan.adSets, adSet, at, { campaign: campaign?.id })
        if (ad) note(plan.ads, ad, at, { campaign: campaign?.id, adSet: adSet?.id, form: form?.id })
        if (form) {
            const entry = note(plan.forms, form, at, {})
            entry.questions ??= new Map()
            for (const answer of row.answers) {
                if (!entry.questions.has(answer.key)) entry.questions.set(answer.key, answer.question)
            }
        }
    }

    return plan
}

function note(
    map: Map<string, PlannedSource>,
    ref: RowRef,
    at: Date | null,
    parents: { campaign?: string; adSet?: string; form?: string }
): PlannedSource {
    let entry = map.get(ref.id)
    if (!entry) {
        entry = { externalId: ref.id, name: "", names: new Set(), seenAt: null }
        map.set(ref.id, entry)
    }

    if (ref.name) entry.names.add(ref.name)

    // Newer when it has a later time, or when neither has a time (then the
    // later row in the file wins).
    const newer = at ? !entry.seenAt || at >= entry.seenAt : !entry.seenAt
    if (newer) {
        if (ref.name) entry.name = ref.name
        if (at) entry.seenAt = at
    }

    // A parent from the newest row wins. An older row only fills a gap.
    for (const key of ["campaign", "adSet", "form"] as const) {
        const value = parents[key]
        if (value && (newer || !entry[key])) entry[key] = value
    }

    return entry
}

const MODELS: Record<SourceLevel, Model<any>> = { // eslint-disable-line @typescript-eslint/no-explicit-any
    campaigns: AdCampaign,
    adSets: AdSet,
    ads: Ad,
    forms: LeadForm,
}

/** How many records each level would create. Reads only. For the check before an import. */
export async function previewSources(platform: AdPlatform, plan: SourcePlan): Promise<AdSourceCounts> {
    const counts = await Promise.all(
        SOURCE_LEVELS.map(async (level) => {
            const ids = [...plan[level].keys()]
            if (ids.length === 0) return 0
            const found = await MODELS[level]
                .find({ platform, externalId: { $in: ids } })
                .select("externalId")
                .lean<Array<{ externalId: string }>>()
            return ids.length - found.length
        })
    )
    return { campaigns: counts[0], adSets: counts[1], ads: counts[2], forms: counts[3] }
}

/**
 * Writes every planned record and returns the ObjectId of each platform id.
 *
 * Campaigns and forms first, since nothing they hold points elsewhere.
 * Then ad sets, which point at campaigns. Then ads, which point at all
 * three.
 */
export async function saveSources(
    platform: AdPlatform,
    plan: SourcePlan,
    by: { userId: string; importId: Types.ObjectId }
): Promise<{ ids: SourceIds; created: AdSourceCounts }> {
    const ids: SourceIds = { campaigns: new Map(), adSets: new Map(), ads: new Map(), forms: new Map() }
    const created: AdSourceCounts = { campaigns: 0, adSets: 0, ads: 0, forms: 0 }
    const ctx = { platform, userId: new Types.ObjectId(by.userId), importId: by.importId, now: new Date() }

    const save = async (level: SourceLevel, parents: (e: PlannedSource) => Record<string, unknown>) => {
        created[level] = await upsertLevel(MODELS[level], [...plan[level].values()], ctx, parents)
        ids[level] = await readIds(MODELS[level], platform, [...plan[level].keys()])
    }

    await Promise.all([
        save("campaigns", () => ({})),
        save("forms", () => ({})),
    ])

    await save("adSets", (e) => ({
        ...(e.campaign && ids.campaigns.has(e.campaign) ? { campaign: ids.campaigns.get(e.campaign) } : {}),
    }))

    await save("ads", (e) => ({
        ...(e.campaign && ids.campaigns.has(e.campaign) ? { campaign: ids.campaigns.get(e.campaign) } : {}),
        ...(e.adSet && ids.adSets.has(e.adSet) ? { adSet: ids.adSets.get(e.adSet) } : {}),
        ...(e.form && ids.forms.has(e.form) ? { leadForm: ids.forms.get(e.form) } : {}),
    }))

    return { ids, created }
}

/** One bulkWrite for a whole level. Returns how many records it created. */
async function upsertLevel(
    model: Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    entries: PlannedSource[],
    ctx: { platform: AdPlatform; userId: Types.ObjectId; importId: Types.ObjectId; now: Date },
    parents: (e: PlannedSource) => Record<string, unknown>
): Promise<number> {
    if (entries.length === 0) return 0

    const ops: Array<Record<string, unknown>> = []

    for (const e of entries) {
        const seen = e.seenAt ?? ctx.now
        const key = { platform: ctx.platform, externalId: e.externalId }

        const set = parents(e)
        const addToSet: Record<string, unknown> = {}
        if (e.names.size > 0) addToSet.aliases = { $each: [...e.names] }
        if (e.questions && e.questions.size > 0) {
            addToSet.questions = { $each: [...e.questions].map(([k, label]) => ({ key: k, label })) }
        }

        // 1. Create it if it is new. Always add its names and parents.
        ops.push({
            updateOne: {
                filter: key,
                update: {
                    $setOnInsert: { name: e.name, lastSeenAt: seen, createdBy: ctx.userId, importId: ctx.importId },
                    ...(Object.keys(set).length > 0 ? { $set: set } : {}),
                    ...(Object.keys(addToSet).length > 0 ? { $addToSet: addToSet } : {}),
                },
                upsert: true,
            },
        })

        // 2. Take this name only if no newer lead has named it before.
        if (e.name) {
            ops.push({
                updateOne: {
                    filter: { ...key, $or: [{ lastSeenAt: null }, { lastSeenAt: { $lte: seen } }] },
                    update: { $set: { name: e.name, lastSeenAt: seen } },
                },
            })
        }
    }

    try {
        const result = await model.bulkWrite(ops as never, { ordered: true })
        return result.upsertedCount ?? 0
    } catch (error) {
        // Two imports created the same record at the same moment, and the
        // server did not retry it. Every op is safe to run again.
        if ((error as { code?: number })?.code === 11000) {
            const result = await model.bulkWrite(ops as never, { ordered: true })
            return result.upsertedCount ?? 0
        }
        throw error
    }
}

async function readIds(
    model: Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    platform: AdPlatform,
    externalIds: string[]
): Promise<Map<string, Types.ObjectId>> {
    if (externalIds.length === 0) return new Map()
    const docs = await model
        .find({ platform, externalId: { $in: externalIds } })
        .select("_id externalId")
        .lean<Array<{ _id: Types.ObjectId; externalId: string }>>()
    return new Map(docs.map((d) => [d.externalId, d._id]))
}

/**
 * The record a lead points at: the Ad, else the Ad set, else the Campaign.
 * Only a lead with none of the three points at its Lead form.
 *
 * The form is not used when an ad is known, because one form is shared by
 * many ads. A lead that pointed at the form could not be traced back to
 * the ad that brought it. The form is still saved, in Lead.leadForm.
 */
export function pickReference(
    row: CheckedLeadRow,
    ids: SourceIds
): { model: AdModelName; id: Types.ObjectId } | null {
    const { ad, adSet, campaign, form } = row.refs
    const adId = ad && ids.ads.get(ad.id)
    if (adId) return { model: "Ad", id: adId }
    const adSetId = adSet && ids.adSets.get(adSet.id)
    if (adSetId) return { model: "AdSet", id: adSetId }
    const campaignId = campaign && ids.campaigns.get(campaign.id)
    if (campaignId) return { model: "AdCampaign", id: campaignId }
    const formId = form && ids.forms.get(form.id)
    if (formId) return { model: "LeadForm", id: formId }
    return null
}

export function formIdOf(row: CheckedLeadRow, ids: SourceIds): Types.ObjectId | undefined {
    return row.refs.form ? ids.forms.get(row.refs.form.id) : undefined
}

/**
 * How many rows of this import came from each campaign, ad set, ad and
 * form, by result. Counted from the final rows, after duplicates are known.
 */
export function buildBreakdown(
    rows: CheckedLeadRow[],
    plan: SourcePlan,
    ids: SourceIds
): Record<SourceLevel, ILeadImportBreakdownRow[]> {
    const refKey: Record<SourceLevel, keyof CheckedLeadRow["refs"]> = {
        campaigns: "campaign",
        adSets: "adSet",
        ads: "ad",
        forms: "form",
    }

    const out = {} as Record<SourceLevel, ILeadImportBreakdownRow[]>

    for (const level of SOURCE_LEVELS) {
        const tally = new Map<string, ILeadImportBreakdownRow>()

        for (const row of rows) {
            const ref = row.refs[refKey[level]]
            const oid = ref && ids[level].get(ref.id)
            if (!ref || !oid) continue

            let entry = tally.get(ref.id)
            if (!entry) {
                entry = {
                    ref: oid,
                    externalId: ref.id,
                    name: plan[level].get(ref.id)?.name ?? ref.name,
                    imported: 0,
                    duplicates: 0,
                    failed: 0,
                }
                tally.set(ref.id, entry)
            }

            if (isImportedResult(row.result)) entry.imported++
            else if (row.result === LEAD_IMPORT_ROW_RESULT.DUPLICATE) entry.duplicates++
            else entry.failed++
        }

        out[level] = [...tally.values()].sort((a, b) => b.imported - a.imported || b.duplicates - a.duplicates)
    }

    return out
}
