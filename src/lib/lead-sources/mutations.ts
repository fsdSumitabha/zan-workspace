import { Types } from "mongoose"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import type { RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { canManageLeadSources } from "@/constants/leadSourceRoles"
import {
    LEAD_SOURCE_ACTIVITY,
    LEAD_SOURCE_STATUS,
    LEAD_SOURCE_STATUS_META,
    LEAD_SOURCE_PICKABLE_STATUSES,
    type LeadSourceStatus,
} from "@/constants/leadSourceStatus"
import { logEntityChanges } from "@/lib/activity-log"
import { resolveTrackedFields } from "@/lib/activity-log/fieldResolution"
import { toAuditPlain } from "@/lib/activity-log/normalize"
import LeadSource, { type ILeadSource } from "@/models/LeadSource"
import User from "@/models/User"
import type { LeadSourceRow } from "@/types/leadSource"
import { accessFilter, findVisibleSource, parseObjectId } from "./access"
import { activityEntry, parseCallback, parseNote } from "./activity"
import { resolveAssignee } from "./assignee"
import { logBulkChanges, logBulkDeletes } from "./audit"
import { addDays, isDayString, resolveClientToday } from "./day"
import { LeadSourceError } from "./http"
import { serializeRow, type RawSourceRow } from "./serialize"

/**
 * Every change to a lead source after the upload.
 *
 * Rules that decide the day a source shows up on:
 *
 *   - Changing the status moves the source to today, the day it was worked.
 *     A source left over from yesterday and tried again today counts as
 *     today's work.
 *   - Call Back needs a time. The source moves to the day of that time, and
 *     its callback reminder is set.
 *   - Any other status clears the callback. The call it was for happened.
 *   - A manager moving sources to another day clears their callbacks. The
 *     manager is rescheduling them.
 */

function assertPickable(raw: unknown): LeadSourceStatus {
    const status = Number(raw) as LeadSourceStatus
    if (!LEAD_SOURCE_PICKABLE_STATUSES.includes(status)) {
        throw new LeadSourceError("Pick a valid status.", 400, { field: "status" })
    }
    return status
}

function assertNotConverted(source: { status: number }): void {
    if (source.status === LEAD_SOURCE_STATUS.CONVERTED) {
        throw new LeadSourceError("This lead source is already a lead. Open the lead to continue.", 409)
    }
}

/**
 * Saves a change to one source, but only while it still matches what was
 * read: still visible to the caller, and still matching `guard`.
 *
 * Without the guard, a status an agent saves a moment after a manager
 * converted the source would write over Converted. A source reassigned a
 * moment ago would still take a change from its old assignee. The request
 * gets a 409 instead, and the person reloads.
 *
 * findOneAndUpdate also runs the region and soft-delete filters, like find.
 */
async function updateOne(
    source: ILeadSource,
    update: Record<string, unknown>,
    user: AuthUser,
    guard: Record<string, unknown>
): Promise<LeadSourceRow> {
    const before = toAuditPlain(source.toObject({ flattenMaps: true }))

    const after = await LeadSource.findOneAndUpdate(
        { _id: source._id, ...accessFilter(user), ...guard },
        update,
        { returnDocument: "after", runValidators: true }
    )

    if (!after) {
        throw new LeadSourceError("This lead source changed while you were saving. Reload it and try again.", 409)
    }

    await logEntityChanges({
        entityType: ENTITY_TYPE.LEAD_SOURCE,
        entityId: String(after._id),
        userId: user.id,
        before,
        after: toAuditPlain(after.toObject({ flattenMaps: true })),
        fields: resolveTrackedFields(LeadSource.schema, ENTITY_TYPE.LEAD_SOURCE),
    })

    await after.populate("assignedTo", "name")
    return serializeRow(after.toObject({ flattenMaps: true }) as unknown as RawSourceRow)
}

export async function changeStatus(
    id: string,
    user: AuthUser,
    body: Record<string, unknown>
): Promise<LeadSourceRow> {
    const status = assertPickable(body.status)
    const note = parseNote(body.note)
    const today = resolveClientToday(body.today)

    let callbackAt: Date | null = null
    let allottedDay = today
    if (status === LEAD_SOURCE_STATUS.CALL_BACK) {
        const callback = parseCallback(body.callbackAt, body.callbackDay)
        callbackAt = callback.at
        allottedDay = callback.day
    }

    const source = await findVisibleSource(id, user)
    assertNotConverted(source)

    const now = new Date()

    return updateOne(
        source,
        {
            $set: {
                status,
                callbackAt,
                allottedDay,
                lastActivityAt: now,
                ...(note ? { lastNote: note, lastNoteAt: now } : {}),
            },
            $push: {
                activity: activityEntry(
                    user,
                    LEAD_SOURCE_ACTIVITY.STATUS,
                    { from: source.status, to: status, text: note, ...(callbackAt ? { callbackAt } : {}) },
                    now
                ),
            },
        },
        user,
        { status: source.status }
    )
}

export async function addNote(
    id: string,
    user: AuthUser,
    body: Record<string, unknown>
): Promise<LeadSourceRow> {
    const text = parseNote(body.text)
    if (!text) throw new LeadSourceError("Write a note first.", 400, { field: "text" })

    const source = await findVisibleSource(id, user)
    const now = new Date()

    return updateOne(
        source,
        {
            $set: { lastNote: text, lastNoteAt: now, lastActivityAt: now },
            $push: { activity: activityEntry(user, LEAD_SOURCE_ACTIVITY.NOTE, { text }, now) },
        },
        user,
        // A note does not depend on the status, so only visibility is checked.
        {}
    )
}

/**
 * Sets or clears the callback time without picking a status.
 *
 * A New source that gets a callback has clearly been spoken to, so it
 * becomes Call Back. So does a closed one: "not now, call me in two weeks"
 * reopens it. Any other open status is kept. An Interested source can have a
 * follow-up call.
 */
export async function setCallback(
    id: string,
    user: AuthUser,
    body: Record<string, unknown>
): Promise<LeadSourceRow> {
    const note = parseNote(body.note)
    const source = await findVisibleSource(id, user)
    assertNotConverted(source)

    const now = new Date()

    if (body.callbackAt === null) {
        return updateOne(
            source,
            {
                $set: { callbackAt: null, lastActivityAt: now },
                $push: {
                    activity: activityEntry(user, LEAD_SOURCE_ACTIVITY.CALLBACK, { callbackAt: null, text: note }, now),
                },
            },
            user,
            { status: source.status }
        )
    }

    const callback = parseCallback(body.callbackAt, body.callbackDay)
    const reopen =
        source.status === LEAD_SOURCE_STATUS.NEW ||
        LEAD_SOURCE_STATUS_META[source.status as LeadSourceStatus]?.closed
    const status = reopen ? LEAD_SOURCE_STATUS.CALL_BACK : source.status

    return updateOne(
        source,
        {
            $set: {
                callbackAt: callback.at,
                allottedDay: callback.day,
                status,
                lastActivityAt: now,
                ...(note ? { lastNote: note, lastNoteAt: now } : {}),
            },
            $push: {
                activity: activityEntry(
                    user,
                    LEAD_SOURCE_ACTIVITY.CALLBACK,
                    {
                        callbackAt: callback.at,
                        text: note,
                        ...(status !== source.status ? { from: source.status, to: status } : {}),
                    },
                    now
                ),
            },
        },
        user,
        { status: source.status }
    )
}

/* -------------------------------------------------------------------------- */
/*                                    Bulk                                    */
/* -------------------------------------------------------------------------- */

export const BULK_MAX = 200

export type BulkAction = "assign" | "day" | "status" | "delete"

interface BulkDoc {
    _id: Types.ObjectId
    region: RegionCode
    status: number
    assignedTo?: Types.ObjectId | null
    allottedDay?: string | null
    callbackAt?: Date | null
}

export interface BulkResult {
    /** Rows that changed. */
    updated: number
    /** Rows that were sent but already had that value. */
    unchanged: number
    /** Ids the caller cannot see, deleted, or not allowed for this action. */
    skipped: number
}

function parseIds(raw: unknown): Types.ObjectId[] {
    if (!Array.isArray(raw) || raw.length === 0) {
        throw new LeadSourceError("Select at least one lead source.", 400)
    }
    if (raw.length > BULK_MAX) {
        throw new LeadSourceError(`Select at most ${BULK_MAX} lead sources at a time.`, 400)
    }
    const unique = [...new Set(raw.map(String))]
    return unique.map((id) => parseObjectId(id, "lead source id"))
}

/** Groups docs by a key, so one updateMany per group can record the old value. */
function groupBy<T>(docs: T[], key: (doc: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>()
    for (const doc of docs) {
        const k = key(doc)
        map.set(k, [...(map.get(k) ?? []), doc])
    }
    return map
}

export async function bulkAction(user: AuthUser, body: Record<string, unknown>): Promise<BulkResult> {
    const action = body.action as BulkAction
    if (!["assign", "day", "status", "delete"].includes(action)) {
        throw new LeadSourceError("Unknown action.", 400)
    }

    if (action !== "status" && !canManageLeadSources(user.role)) {
        throw new LeadSourceError("Only a manager can do this.", 403)
    }

    const ids = parseIds(body.ids)

    // Only what the caller can see: region scope from the plugin, and the
    // assignee rule from accessFilter. Every write below uses these ids and
    // nothing from the request.
    const docs = await LeadSource.find({ _id: { $in: ids }, ...accessFilter(user) })
        .select("-activity")
        .lean<Array<BulkDoc & Record<string, unknown>>>()

    const skipped = ids.length - docs.length
    if (docs.length === 0) {
        throw new LeadSourceError("None of the selected lead sources can be changed.", 404)
    }

    const now = new Date()

    // Every write repeats the conditions of the read above, so a row that
    // changed in between is left alone instead of overwritten. softDeletePlugin
    // does not hook updateMany, so `deletedAt: null` is written out here.
    const base = { deletedAt: null, ...accessFilter(user) }

    if (action === "delete") {
        const targetIds = docs.map((d) => d._id)
        const actor = new Types.ObjectId(user.id)
        const result = await LeadSource.updateMany(
            { _id: { $in: targetIds }, ...base },
            { $set: { deletedAt: now, deletedBy: actor } }
        )

        // Log only the rows this request deleted. The raw read is safe here:
        // the ids already passed the region-scoped read above.
        const deleted = await LeadSource.collection
            .find({ _id: { $in: targetIds }, deletedAt: now, deletedBy: actor }, { projection: { _id: 1 } })
            .toArray()
        await logBulkDeletes(ENTITY_TYPE.LEAD_SOURCE, deleted.map((d) => d._id as Types.ObjectId), user.id)

        return { updated: result.modifiedCount, unchanged: 0, skipped: ids.length - result.modifiedCount }
    }

    const result =
        action === "assign"
            ? await bulkAssign(docs, body.assignedTo, user, now, base)
            : action === "day"
              ? await bulkDay(docs, body.day, body.today, user, now, base)
              : await bulkStatus(docs, body, user, now, base)

    const after = await readAfter(result.candidates)
    await logBulkChanges(LeadSource, ENTITY_TYPE.LEAD_SOURCE, docs, after, user.id)

    // Candidates that did not change were changed by someone else between the
    // read and the write. They count as skipped.
    const lost = result.candidates.length - result.modified

    return {
        updated: result.modified,
        unchanged: docs.length - result.candidates.length - result.notApplicable,
        skipped: skipped + result.notApplicable + lost,
    }
}

interface GroupResult {
    /** Rows the action tried to change. */
    candidates: BulkDoc[]
    /** Rows it did change. */
    modified: number
    /** Rows it does not apply to, such as converted ones for a status change. */
    notApplicable: number
}

async function readAfter(docs: BulkDoc[]): Promise<Array<Record<string, unknown>>> {
    if (docs.length === 0) return []
    return LeadSource.find({ _id: { $in: docs.map((d) => d._id) } })
        .select("-activity")
        .lean<Array<Record<string, unknown>>>()
}

async function bulkAssign(
    docs: BulkDoc[],
    rawAssignee: unknown,
    user: AuthUser,
    now: Date,
    base: Record<string, unknown>
): Promise<GroupResult> {
    const regions = [...new Set(docs.map((d) => d.region))]
    const target = rawAssignee === null || rawAssignee === "" ? null : await resolveAssignee(rawAssignee, regions)
    const targetKey = target ? target._id.toString() : ""

    const toChange = docs.filter((d) => (d.assignedTo ? d.assignedTo.toString() : "") !== targetKey)
    if (toChange.length === 0) return { candidates: [], modified: 0, notApplicable: 0 }

    // Names of the people the sources move away from, for the timeline.
    const previousIds = [...new Set(toChange.map((d) => d.assignedTo?.toString()).filter(Boolean))] as string[]
    const previous = previousIds.length
        ? await User.find({ _id: { $in: previousIds } }).select("name").lean<Array<{ _id: Types.ObjectId; name: string }>>()
        : []
    const nameOf = new Map(previous.map((u) => [u._id.toString(), u.name]))

    let modified = 0
    for (const [fromId, group] of groupBy(toChange, (d) => d.assignedTo?.toString() ?? "")) {
        const result = await LeadSource.updateMany(
            {
                _id: { $in: group.map((d) => d._id) },
                ...base,
                assignedTo: fromId ? new Types.ObjectId(fromId) : null,
            },
            {
                $set: { assignedTo: target?._id ?? null, lastActivityAt: now },
                $push: {
                    activity: activityEntry(
                        user,
                        LEAD_SOURCE_ACTIVITY.ASSIGNED,
                        { from: fromId ? nameOf.get(fromId) ?? "someone" : null, to: target?.name ?? null },
                        now
                    ),
                },
            }
        )
        modified += result.modifiedCount
    }

    return { candidates: toChange, modified, notApplicable: 0 }
}

async function bulkDay(
    docs: BulkDoc[],
    rawDay: unknown,
    rawToday: unknown,
    user: AuthUser,
    now: Date,
    base: Record<string, unknown>
): Promise<GroupResult> {
    let day: string | null = null

    if (rawDay !== null && rawDay !== "") {
        if (!isDayString(rawDay)) throw new LeadSourceError("Pick a valid day.", 400, { field: "day" })
        const today = resolveClientToday(rawToday)
        if (rawDay < today) throw new LeadSourceError("Pick today or a later day.", 400, { field: "day" })
        if (rawDay > addDays(today, 366)) throw new LeadSourceError("Pick a day within the next year.", 400, { field: "day" })
        day = rawDay
    }

    const toChange = docs.filter((d) => (d.allottedDay ?? null) !== day || d.callbackAt)
    if (toChange.length === 0) return { candidates: [], modified: 0, notApplicable: 0 }

    let modified = 0
    for (const group of groupBy(toChange, (d) => `${d.allottedDay ?? ""}|${d.callbackAt ? 1 : 0}`).values()) {
        const first = group[0]
        const result = await LeadSource.updateMany(
            {
                _id: { $in: group.map((d) => d._id) },
                ...base,
                allottedDay: first.allottedDay ?? null,
                callbackAt: first.callbackAt ? { $ne: null } : null,
            },
            {
                $set: { allottedDay: day, callbackAt: null, lastActivityAt: now },
                $push: {
                    activity: activityEntry(
                        user,
                        LEAD_SOURCE_ACTIVITY.DAY,
                        {
                            from: first.allottedDay ?? null,
                            to: day,
                            ...(first.callbackAt ? { text: "The callback time was cleared." } : {}),
                        },
                        now
                    ),
                },
            }
        )
        modified += result.modifiedCount
    }

    return { candidates: toChange, modified, notApplicable: 0 }
}

async function bulkStatus(
    docs: BulkDoc[],
    body: Record<string, unknown>,
    user: AuthUser,
    now: Date,
    base: Record<string, unknown>
): Promise<GroupResult> {
    const status = assertPickable(body.status)
    if (status === LEAD_SOURCE_STATUS.CALL_BACK) {
        throw new LeadSourceError("Set Call Back one source at a time, so each one gets its own time.", 400, {
            field: "status",
        })
    }

    const note = parseNote(body.note)
    const today = resolveClientToday(body.today)

    const open = docs.filter((d) => d.status !== LEAD_SOURCE_STATUS.CONVERTED)

    let modified = 0
    for (const group of groupBy(open, (d) => String(d.status)).values()) {
        const result = await LeadSource.updateMany(
            // `status` again: a source converted since the read is not matched.
            { _id: { $in: group.map((d) => d._id) }, ...base, status: group[0].status },
            {
                $set: {
                    status,
                    callbackAt: null,
                    allottedDay: today,
                    lastActivityAt: now,
                    ...(note ? { lastNote: note, lastNoteAt: now } : {}),
                },
                $push: {
                    activity: activityEntry(user, LEAD_SOURCE_ACTIVITY.STATUS, { from: group[0].status, to: status, text: note }, now),
                },
            },
            { runValidators: true }
        )
        modified += result.modifiedCount
    }

    return { candidates: open, modified, notApplicable: docs.length - open.length }
}
