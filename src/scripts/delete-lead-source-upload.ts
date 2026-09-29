// Hard-deletes one lead source upload and everything made from it.
//
//   npx tsx src/scripts/delete-lead-source-upload.ts <uploadId>            dry run
//   npx tsx src/scripts/delete-lead-source-upload.ts <uploadId> --apply    deletes
//
// For a dev database, to test an upload again from a clean start. There is
// no soft delete and no undo. Run it from the project root. It reads
// MONGODB_URI from .env.local only.
//
// What it deletes:
//   1. The upload, with its report.
//   2. Every lead source from the upload, soft-deleted ones too. The notes,
//      status changes and callbacks live inside each source, so they go too.
//   3. Every Lead converted from those sources, and the interactions, calls,
//      meetings and quotations on it. A Lead left behind makes the next
//      upload of the same sheet skip that row as "already a lead".
//   4. The activity log rows and notifications of all of the above.
//   5. The cached dashboard counts, when a Lead is deleted. The app counts
//      again on the next dashboard load.
//
// It deletes nothing, and says why, when:
//   - a converted Lead became a client. A client has projects and documents
//     of its own. That is more than test data from one upload.
//   - a meeting on a converted Lead has a calendar event. Deleting the row
//     would leave the event in the calendar.
//   - the report points at a lead source of another upload.
//
// The same rules as src/scripts/region-migration: a dry run by default, the
// raw driver only, and the database name printed before any write. Through
// Mongoose, softDeletePlugin would hide deleted sources, regionScopePlugin
// would filter by a region a script does not have, and the audit plugin
// would log each delete.
//
// Children go first and the upload goes last. Every id is found again from
// the upload and its sources, so a run that stops half way can run again.

import { config } from "dotenv"

// .env.local only, and over any MONGODB_URI already set in the shell. A
// script that deletes must reach the database the person named.
config({ path: ".env.local", override: true })

import mongoose from "mongoose"
import type { Db, Document, Filter, ObjectId } from "mongodb"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import {
    LEAD_SOURCE_ACTIVITY,
    LEAD_SOURCE_STATUS_META,
    type LeadSourceStatus,
} from "@/constants/leadSourceStatus"

const UPLOADS = "leadsourceuploads"
const SOURCES = "leadsources"
const LEADS = "leads"
const CLIENTS = "clients"
const USERS = "users"
const ACTIVITY_LOGS = "activity_logs"
const NOTIFICATIONS = "notifications"
const STATS = "stats_snapshots"

/** Rows that hang off a Lead or a lead source through entityType and entityId. */
const CHILDREN = [
    { collection: "interactions", entityType: ENTITY_TYPE.INTERACTION },
    { collection: "calls", entityType: ENTITY_TYPE.CALL },
    { collection: "meetings", entityType: ENTITY_TYPE.MEETING },
    { collection: "quotations", entityType: ENTITY_TYPE.QUOTATION },
] as const

/** Fields that hold the id of another row. The last check looks in all of them. */
const REF_FIELDS = [
    "_id",
    "entityId",
    "refId",
    "uploadId",
    "sourceId",
    "rows.sourceId",
    "leadId",
    "convertedLeadId",
    "lastInteractionId",
]

const ACTIVITY_NAME: Record<number, string> = Object.fromEntries(
    Object.entries(LEAD_SOURCE_ACTIVITY).map(([name, code]) => [code, name.toLowerCase()])
)

interface Found {
    uploadId: ObjectId
    upload: Document | null
    sources: Document[]
    sourceIds: ObjectId[]
    leads: Document[]
    leadIds: ObjectId[]
    childIds: Map<string, ObjectId[]>
    /** Reasons to delete nothing. */
    problems: string[]
}

interface Step {
    collection: string
    filter: Filter<Document>
    what: string
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2)
    const apply = argv.includes("--apply")
    // Takes the bare id, or the shell form ObjectId('...').
    const hex = argv.find((a) => !a.startsWith("--"))?.match(/[0-9a-f]{24}/i)?.[0]

    if (!hex) {
        console.error("Usage: npx tsx src/scripts/delete-lead-source-upload.ts <uploadId> [--apply]")
        process.exitCode = 1
        return
    }

    const uri = process.env.MONGODB_URI
    if (!uri) {
        console.error("MONGODB_URI is not set in .env.local.")
        process.exitCode = 1
        return
    }

    await mongoose.connect(uri)
    const db = mongoose.connection.db
    if (!db) throw new Error("Connected, but there is no database handle. Check the URI.")

    console.log("")
    console.log(`  database : ${db.databaseName}`)
    console.log(`  host     : ${mongoose.connection.host}`)
    console.log(`  upload   : ${hex}`)
    console.log(`  mode     : ${apply ? "APPLY. This deletes." : "DRY RUN. Nothing is deleted."}`)

    const found = await collect(db, new mongoose.Types.ObjectId(hex))
    await describe(db, found)

    const steps = plan(found)
    const counts = await Promise.all(steps.map((s) => db.collection(s.collection).countDocuments(s.filter)))

    console.log("")
    console.log(apply ? "To delete" : "Would delete")
    steps.forEach((s, i) => console.log(`  ${s.collection.padEnd(18)} ${String(counts[i]).padStart(6)}  ${s.what}`))

    if (found.problems.length > 0) {
        console.log("")
        console.log("Stopped before deleting anything, because:")
        for (const problem of found.problems) console.log(`  - ${problem}`)
        process.exitCode = 1
        return
    }

    const allIds = [found.uploadId, ...found.sourceIds, ...found.leadIds, ...[...found.childIds.values()].flat()]

    if (!apply) {
        await printWhereIdsAppear(db, allIds, "Where these ids appear now")
        console.log("")
        console.log("Dry run. Nothing was deleted. Run again with --apply to delete the rows above.")
        return
    }

    if (counts.every((n) => n === 0)) {
        console.log("")
        console.log("Nothing to delete.")
        return
    }

    process.stdout.write("\nDeleting in ")
    for (let i = 5; i > 0; i--) {
        process.stdout.write(`${i}… `)
        await new Promise((r) => setTimeout(r, 1000))
    }
    console.log("go.\n")

    console.log("Deleted")
    for (const step of steps) {
        const result = await db.collection(step.collection).deleteMany(step.filter)
        console.log(`  ${step.collection.padEnd(18)} ${String(result.deletedCount).padStart(6)}`)
    }

    await printWhereIdsAppear(db, allIds, "Left in the database")
}

async function collect(db: Db, uploadId: ObjectId): Promise<Found> {
    const problems: string[] = []

    const upload = await db.collection(UPLOADS).findOne(
        { _id: uploadId },
        // `rows` can be megabytes. Only the source id of each row is needed.
        {
            projection: {
                fileName: 1,
                region: 1,
                counts: 1,
                createdAt: 1,
                uploadedBy: 1,
                "rows.sourceId": 1,
            },
        }
    )

    const reportIds = ((upload?.rows ?? []) as Array<{ sourceId?: ObjectId }>)
        .map((row) => row.sourceId)

    const sources = await db
        .collection(SOURCES)
        .find(
            { $or: [{ uploadId }, { _id: { $in: uniqueIds(reportIds) } }] },
            {
                projection: {
                    uploadId: 1,
                    status: 1,
                    deletedAt: 1,
                    callbackAt: 1,
                    convertedLeadId: 1,
                    "activity.type": 1,
                },
            }
        )
        .toArray()

    for (const source of sources) {
        if (!uploadId.equals(source.uploadId)) {
            problems.push(`Lead source ${source._id} is in the report, but belongs to upload ${source.uploadId}.`)
        }
    }

    // The report's ids as well, in case a source row is already gone.
    const sourceIds = uniqueIds([...reportIds, ...sources.map((s) => s._id)])
    const leadIds = uniqueIds(sources.map((s) => s.convertedLeadId as ObjectId | undefined))

    const leads = leadIds.length
        ? await db
              .collection(LEADS)
              .find(
                  { _id: { $in: leadIds } },
                  { projection: { name: 1, phone: 1, convertedClientId: 1, deletedAt: 1, createdAt: 1 } }
              )
              .toArray()
        : []

    if (leadIds.length > 0) {
        const clientIds = uniqueIds(leads.map((l) => l.convertedClientId as ObjectId | undefined))
        const clients = await db
            .collection(CLIENTS)
            .find(
                { $or: [{ leadId: { $in: leadIds } }, { _id: { $in: clientIds } }] },
                { projection: { name: 1, company: 1 } }
            )
            .toArray()
        for (const client of clients) {
            problems.push(`Client ${client._id} (${client.company ?? client.name}) was made from a converted lead.`)
        }
    }

    const parents = [
        { entityType: ENTITY_TYPE.LEAD_SOURCE, entityId: { $in: sourceIds } },
        { entityType: ENTITY_TYPE.LEAD, entityId: { $in: leadIds } },
    ]
    const childIds = new Map<string, ObjectId[]>()
    for (const child of CHILDREN) {
        const rows = await db
            .collection(child.collection)
            .find({ $or: parents }, { projection: { "external.eventId": 1 } })
            .toArray()
        childIds.set(child.collection, rows.map((r) => r._id))
        for (const row of rows) {
            if (row.external?.eventId) {
                problems.push(`Meeting ${row._id} has calendar event ${row.external.eventId}. Remove it from the calendar first.`)
            }
        }
    }

    return { uploadId, upload, sources, sourceIds, leads, leadIds, childIds, problems }
}

async function describe(db: Db, found: Found): Promise<void> {
    const { upload, sources, leads } = found

    console.log("")
    if (upload) {
        const by = upload.uploadedBy
            ? await db.collection(USERS).findOne({ _id: upload.uploadedBy }, { projection: { name: 1 } })
            : null
        const c = upload.counts ?? {}
        console.log("The upload")
        console.log(`  file      : ${upload.fileName}`)
        console.log(`  region    : ${upload.region}`)
        console.log(`  uploaded  : ${stamp(upload.createdAt)}${by?.name ? ` by ${by.name}` : ""}`)
        console.log(
            `  report    : ${c.read ?? 0} rows read, ${c.imported ?? 0} imported ` +
                `(${c.warned ?? 0} with warnings), ${c.skipped ?? 0} skipped`
        )
    } else {
        console.log("The upload is not in the database.")
    }

    console.log("")
    console.log(`Lead sources from it: ${sources.length}`)
    if (sources.length > 0) {
        const entries = sources.flatMap((s) => (s.activity ?? []) as Array<{ type: number }>)
        console.log(
            `  status    : ${tally(sources.map((s) => LEAD_SOURCE_STATUS_META[s.status as LeadSourceStatus]?.label ?? `code ${s.status}`))}`
        )
        console.log(`  deleted   : ${sources.filter((s) => s.deletedAt).length} soft-deleted`)
        console.log(`  callbacks : ${sources.filter((s) => s.callbackAt).length} with a callback time set`)
        console.log(`  timeline  : ${entries.length} entries. ${tally(entries.map((a) => ACTIVITY_NAME[a.type] ?? `code ${a.type}`))}`)
    }

    console.log("")
    console.log(`Leads converted from them: ${leads.length}`)
    for (const lead of leads) {
        console.log(
            `  ${lead._id}  ${lead.name}  ${lead.phone}  created ${stamp(lead.createdAt)}` +
                (lead.deletedAt ? "  (soft-deleted)" : "")
        )
    }
}

function plan(found: Found): Step[] {
    const targets = [
        { entityType: ENTITY_TYPE.LEAD_SOURCE_UPLOAD, ids: [found.uploadId] },
        { entityType: ENTITY_TYPE.LEAD_SOURCE, ids: found.sourceIds },
        { entityType: ENTITY_TYPE.LEAD, ids: found.leadIds },
        ...CHILDREN.map((c) => ({ entityType: c.entityType, ids: found.childIds.get(c.collection) ?? [] })),
    ]
    // Never empty: the upload's own id is always in it.
    const aboutThem: Filter<Document> = {
        $or: targets
            .filter((t) => t.ids.length > 0)
            .map((t) => ({ entityType: t.entityType, entityId: { $in: t.ids } })),
    }

    return [
        { collection: NOTIFICATIONS, filter: aboutThem, what: "about the rows below" },
        { collection: ACTIVITY_LOGS, filter: aboutThem, what: "about the rows below" },
        ...CHILDREN.map((c) => ({
            collection: c.collection,
            filter: { _id: { $in: found.childIds.get(c.collection) ?? [] } },
            what: "on the lead sources or the converted leads",
        })),
        { collection: LEADS, filter: { _id: { $in: found.leadIds } }, what: "converted from the lead sources" },
        { collection: SOURCES, filter: { _id: { $in: found.sourceIds } }, what: "with their notes, callbacks and timeline" },
        { collection: UPLOADS, filter: { _id: found.uploadId }, what: "the upload and its report" },
        // A cache. The app also clears all of it after any Lead write.
        ...(found.leadIds.length > 0 ? [{ collection: STATS, filter: {}, what: "cached dashboard counts" }] : []),
    ]
}

/**
 * Looks for the ids in every id field of every collection. After a delete
 * this must find nothing. A hit means a collection this script does not
 * know about still points at a deleted row.
 */
async function printWhereIdsAppear(db: Db, ids: ObjectId[], title: string): Promise<void> {
    const names = (await db.listCollections({ type: "collection" }, { nameOnly: true }).toArray())
        .map((c) => c.name)
        .filter((name) => !name.startsWith("system."))
        .sort()

    const filter: Filter<Document> = { $or: REF_FIELDS.map((field) => ({ [field]: { $in: ids } })) }

    console.log("")
    console.log(`${title}. Checked ${REF_FIELDS.length} id fields in ${names.length} collections.`)
    let any = false
    for (const name of names) {
        const rows = await db.collection(name).countDocuments(filter)
        if (rows > 0) {
            console.log(`  ${name.padEnd(18)} ${String(rows).padStart(6)}`)
            any = true
        }
    }
    if (!any) console.log("  nothing")
}

function uniqueIds(ids: Array<ObjectId | null | undefined>): ObjectId[] {
    const byHex = new Map<string, ObjectId>()
    for (const id of ids) if (id) byHex.set(id.toString(), id)
    return [...byHex.values()]
}

function tally(values: string[]): string {
    const counts = new Map<string, number>()
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
    return [...counts].map(([v, n]) => `${v} ${n}`).join(", ") || "none"
}

function stamp(date: unknown): string {
    return date instanceof Date ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC` : "unknown"
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => mongoose.disconnect())
