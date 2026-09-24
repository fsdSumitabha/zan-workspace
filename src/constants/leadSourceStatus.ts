/**
 * Status of one lead source, the result of cold calling it.
 *
 * Simpler than LEAD_STATUS on purpose. There is no pipeline and no order.
 * Any status can follow any other, except CONVERTED. Only the convert route
 * sets CONVERTED, and nothing changes it afterwards.
 *
 * `closed` statuses drop out of the working views (Today, Upcoming, No day).
 * They stay in Closed and All.
 */
export const LEAD_SOURCE_STATUS = {
    NEW: 10,
    NO_ANSWER: 20,
    CALL_BACK: 30,
    INTERESTED: 40,
    NOT_INTERESTED: 50,
    WRONG_NUMBER: 60,
    CONVERTED: 70,
} as const

export type LeadSourceStatus =
    (typeof LEAD_SOURCE_STATUS)[keyof typeof LEAD_SOURCE_STATUS]

export const LEAD_SOURCE_STATUS_META: Record<
    LeadSourceStatus,
    { label: string; color: string; dot: string; closed: boolean }
> = {
    10: { label: "New", color: "bg-slate-500 text-white", dot: "bg-slate-400", closed: false },
    20: { label: "No Answer", color: "bg-amber-500 text-amber-950", dot: "bg-amber-500", closed: false },
    30: { label: "Call Back", color: "bg-violet-600 text-white", dot: "bg-violet-500", closed: false },
    40: { label: "Interested", color: "bg-emerald-600 text-white", dot: "bg-emerald-500", closed: false },
    50: { label: "Not Interested", color: "bg-rose-600 text-white", dot: "bg-rose-500", closed: true },
    60: { label: "Wrong Number", color: "bg-stone-600 text-white", dot: "bg-stone-500", closed: true },
    70: { label: "Converted", color: "bg-blue-600 text-white", dot: "bg-blue-500", closed: true },
}

export const LEAD_SOURCE_STATUSES = Object.values(LEAD_SOURCE_STATUS) as LeadSourceStatus[]

export const LEAD_SOURCE_OPEN_STATUSES: LeadSourceStatus[] = LEAD_SOURCE_STATUSES.filter(
    (s) => !LEAD_SOURCE_STATUS_META[s].closed
)

export const LEAD_SOURCE_CLOSED_STATUSES: LeadSourceStatus[] = LEAD_SOURCE_STATUSES.filter(
    (s) => LEAD_SOURCE_STATUS_META[s].closed
)

/** Statuses a person can pick. CONVERTED comes from the convert route only. */
export const LEAD_SOURCE_PICKABLE_STATUSES: LeadSourceStatus[] = LEAD_SOURCE_STATUSES.filter(
    (s) => s !== LEAD_SOURCE_STATUS.CONVERTED
)

export function isLeadSourceStatus(value: unknown): value is LeadSourceStatus {
    return LEAD_SOURCE_STATUSES.includes(value as LeadSourceStatus)
}

/** What each timeline entry on a lead source records. */
export const LEAD_SOURCE_ACTIVITY = {
    UPLOADED: 10,
    NOTE: 20,
    STATUS: 30,
    CALLBACK: 40,
    ASSIGNED: 50,
    DAY: 60,
    CONVERTED: 70,
} as const

export type LeadSourceActivityType =
    (typeof LEAD_SOURCE_ACTIVITY)[keyof typeof LEAD_SOURCE_ACTIVITY]

/** The result of one sheet row in an upload report. */
export const UPLOAD_ROW_RESULT = {
    IMPORTED: 10,
    WARNED: 20,
    SKIPPED: 30,
} as const

export type UploadRowResult =
    (typeof UPLOAD_ROW_RESULT)[keyof typeof UPLOAD_ROW_RESULT]

export const UPLOAD_ROW_RESULT_META: Record<
    UploadRowResult,
    { label: string; chip: string; row: string; excelFill: string }
> = {
    10: {
        label: "Imported",
        chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
        row: "",
        excelFill: "#E2F5EA",
    },
    20: {
        label: "Imported with warnings",
        chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
        row: "bg-amber-50/60 dark:bg-amber-500/5",
        excelFill: "#FFF4D6",
    },
    30: {
        label: "Skipped",
        chip: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
        row: "bg-rose-50/70 dark:bg-rose-500/5",
        excelFill: "#FDE2E2",
    },
}

export const UPLOAD_STATUS = {
    PROCESSING: 10,
    DONE: 20,
    FAILED: 30,
} as const

export type UploadStatus = (typeof UPLOAD_STATUS)[keyof typeof UPLOAD_STATUS]
