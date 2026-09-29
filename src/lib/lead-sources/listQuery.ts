import { Types, type PipelineStage } from "mongoose"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import { LEAD_SOURCE_COLUMNS } from "@/config/leadSourceSheet"
import { canManageLeadSources } from "@/constants/leadSourceRoles"
import {
    LEAD_SOURCE_CLOSED_STATUSES,
    LEAD_SOURCE_OPEN_STATUSES,
    LEAD_SOURCE_STATUS,
    isLeadSourceStatus,
} from "@/constants/leadSourceStatus"
import { escapeRegex } from "@/lib/search/escapeRegex"
import type { LeadSourceView } from "@/types/leadSource"
import { accessFilter } from "./access"
import { isDayString, resolveClientToday } from "./day"
import { LIST_INFO_KEYS } from "./serialize"

/**
 * The list page's query: which rows each view holds, and in what order.
 *
 * Views, all limited to what the caller may see:
 *
 *   today        Open sources whose day is today or earlier. Due callbacks
 *                first, then today's, then the ones left over from earlier
 *                days ("pending").
 *   upcoming     Open sources with a later day.
 *   unscheduled  Open sources with no day.
 *   closed       Not Interested and Converted.
 *   all          Everything.
 *   day          One exact day, any status. Managers use it to plan.
 *
 * "Today" is the browser's local day, sent as `today`. See day.ts.
 */

export const VIEWS: LeadSourceView[] = ["today", "upcoming", "unscheduled", "closed", "all", "day"]

export interface ListParams {
    view: LeadSourceView
    today: string
    day: string | null
    status: number | null
    /** A user id, "me", "none" for unassigned, or null for everyone. */
    assignee: string | null
    upload: Types.ObjectId | null
    search: string
    page: number
    limit: number
}

const OBJECT_ID = /^[a-f0-9]{24}$/i
const MAX_LIMIT = 100

/** A page number from the URL: a whole number from 1 to 100,000. "1e400" is Infinity, and Mongo refuses $skip: Infinity. */
export function parsePage(raw: string | null): number {
    const n = Math.floor(Number(raw))
    return Number.isFinite(n) ? Math.min(100_000, Math.max(1, n)) : 1
}

export function parseListParams(searchParams: URLSearchParams, user: AuthUser): ListParams {
    const rawView = searchParams.get("view") as LeadSourceView | null
    const day = searchParams.get("day")
    const rawStatus = Number(searchParams.get("status"))
    const rawAssignee = searchParams.get("assignee")
    const rawUpload = searchParams.get("upload")

    const manager = canManageLeadSources(user.role)
    const dayOk = manager && isDayString(day)

    let assignee: string | null = null
    if (manager && rawAssignee) {
        if (rawAssignee === "me" || rawAssignee === "none" || OBJECT_ID.test(rawAssignee)) {
            assignee = rawAssignee
        }
    }

    return {
        view: dayOk ? "day" : rawView && VIEWS.includes(rawView) && rawView !== "day" ? rawView : "today",
        today: resolveClientToday(searchParams.get("today")),
        day: dayOk ? day : null,
        status: isLeadSourceStatus(rawStatus) ? rawStatus : null,
        assignee,
        upload: rawUpload && OBJECT_ID.test(rawUpload) ? new Types.ObjectId(rawUpload) : null,
        search: (searchParams.get("search") ?? "").trim().slice(0, 100),
        page: parsePage(searchParams.get("page")),
        limit: Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(searchParams.get("limit"))) || 50)),
    }
}

const SEARCH_KEYS = LEAD_SOURCE_COLUMNS.filter((c) => c.searchable).map((c) => c.key)

/** Everything except the view: who can see it, and the filters. */
export function baseFilter(params: ListParams, user: AuthUser): Record<string, unknown> {
    const and: Record<string, unknown>[] = [accessFilter(user)]

    if (params.assignee === "me") and.push({ assignedTo: new Types.ObjectId(user.id) })
    else if (params.assignee === "none") and.push({ assignedTo: null })
    else if (params.assignee) and.push({ assignedTo: new Types.ObjectId(params.assignee) })

    if (params.upload) and.push({ uploadId: params.upload })
    if (params.status !== null) and.push({ status: params.status })

    if (params.search) {
        const re = { $regex: escapeRegex(params.search), $options: "i" }
        const or: Record<string, unknown>[] = [
            { name: re },
            { company: re },
            { email: re },
            // The newest note, so "the one where the owner is Mike" is found.
            { lastNote: re },
            ...SEARCH_KEYS.map((key) => ({ [`data.${key}`]: re })),
        ]
        // Phones are saved as "+14155550123". "(415) 555-0123" only matches
        // by its digits. Same rule as the leads list.
        const digits = params.search.replace(/\D/g, "")
        if (digits.length >= 4) or.push({ phone: { $regex: escapeRegex(digits) } })
        and.push({ $or: or })
    }

    return { $and: and }
}

export function viewFilter(view: LeadSourceView, today: string, day: string | null): Record<string, unknown> {
    switch (view) {
        case "today":
            return { status: { $in: LEAD_SOURCE_OPEN_STATUSES }, allottedDay: { $ne: null, $lte: today } }
        case "upcoming":
            return { status: { $in: LEAD_SOURCE_OPEN_STATUSES }, allottedDay: { $gt: today } }
        case "unscheduled":
            return { status: { $in: LEAD_SOURCE_OPEN_STATUSES }, allottedDay: null }
        case "closed":
            return { status: { $in: LEAD_SOURCE_CLOSED_STATUSES } }
        case "day":
            return { allottedDay: day }
        case "all":
        default:
            return {}
    }
}

/** Sorts rows without a callback after every row with one. */
const NO_CALLBACK = new Date("9999-12-31T00:00:00Z")

function sortStages(view: LeadSourceView, today: string, now: Date): PipelineStage[] {
    const callbackKey = { $ifNull: ["$callbackAt", NO_CALLBACK] }

    switch (view) {
        case "today":
            return [
                {
                    $addFields: {
                        _cb: callbackKey,
                        section: {
                            $switch: {
                                branches: [
                                    { case: { $lte: [callbackKey, now] }, then: 0 },
                                    { case: { $eq: ["$allottedDay", today] }, then: 1 },
                                ],
                                default: 2,
                            },
                        },
                    },
                },
                // Due callbacks, oldest first. Then today's: timed callbacks
                // first, then New before the ones already tried. Then earlier
                // days, the most recent first.
                { $sort: { section: 1, _cb: 1, allottedDay: -1, status: 1, rowNumber: 1, _id: 1 } },
            ]
        case "upcoming":
            return [
                { $addFields: { _cb: callbackKey } },
                { $sort: { allottedDay: 1, _cb: 1, status: 1, rowNumber: 1, _id: 1 } },
            ]
        case "day":
            return [
                { $addFields: { _cb: callbackKey } },
                { $sort: { _cb: 1, status: 1, rowNumber: 1, _id: 1 } },
            ]
        case "closed":
            return [{ $sort: { updatedAt: -1, _id: 1 } }]
        case "unscheduled":
        case "all":
        default:
            // Newest upload first, then in the order of the sheet.
            return [{ $sort: { uploadId: -1, rowNumber: 1, _id: 1 } }]
    }
}

const ROW_FIELDS = [
    "name", "company", "email", "phone", "status", "region", "allottedDay",
    "callbackAt", "lastNote", "lastNoteAt", "uploadId", "rowNumber",
    "convertedLeadId", "assignedTo",
]

/** The list page's rows for one page of one view. */
export function listPipeline(
    params: ListParams,
    user: AuthUser,
    usersCollection: string,
    now: Date
): PipelineStage[] {
    const project: Record<string, unknown> = { assignee: { $first: "$assigneeDocs" } }
    for (const field of ROW_FIELDS) project[field] = 1
    for (const key of LIST_INFO_KEYS) project[`data.${key}`] = 1
    if (params.view === "today") project.section = 1

    return [
        { $match: { $and: [baseFilter(params, user), viewFilter(params.view, params.today, params.day)] } },
        ...sortStages(params.view, params.today, now),
        { $skip: (params.page - 1) * params.limit },
        { $limit: params.limit },
        // The raw lookup is fine here: it copies one name and avatar for rows
        // the caller may already see, and the assignee holds their region.
        {
            $lookup: {
                from: usersCollection,
                localField: "assignedTo",
                foreignField: "_id",
                as: "assigneeDocs",
                pipeline: [{ $project: { name: 1, avatar: 1 } }],
            },
        },
        { $project: project },
    ]
}

/** Filters for the tab counts, the callback banner and today's progress. */
export function countFilters(params: ListParams, user: AuthUser, now: Date) {
    const base = baseFilter(params, user)
    const withBase = (extra: Record<string, unknown>) => ({ $and: [base, extra] })

    return {
        today: withBase(viewFilter("today", params.today, null)),
        upcoming: withBase(viewFilter("upcoming", params.today, null)),
        unscheduled: withBase(viewFilter("unscheduled", params.today, null)),
        closed: withBase(viewFilter("closed", params.today, null)),
        all: base,
        callbacksDue: withBase({ status: { $in: LEAD_SOURCE_OPEN_STATUSES }, callbackAt: { $ne: null, $lte: now } }),
        progressTotal: withBase({ allottedDay: params.today }),
        progressWorked: withBase({ allottedDay: params.today, status: { $ne: LEAD_SOURCE_STATUS.NEW } }),
    }
}
