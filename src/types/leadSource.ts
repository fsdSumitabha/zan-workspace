import type { UserRole } from "@/constants/userRoles"

/** One row of the lead source list, as the API sends it. */
export interface LeadSourceRow {
    _id: string
    name: string
    company: string
    email: string
    /** E.164. */
    phone: string
    status: number
    region: string
    /** "YYYY-MM-DD", or null when no day is set. */
    allottedDay: string | null
    /** ISO time, or null. */
    callbackAt: string | null
    lastNote: string
    lastNoteAt: string | null
    uploadId: string | null
    rowNumber: number | null
    convertedLeadId: string | null
    /** `avatar` is an ImageKit URL, or "" when the person has none. */
    assignee: { _id: string; name: string; avatar: string } | null
    /** Values of the sheet columns marked `inList` in leadSourceSheet.ts. */
    listInfo: string[]
    /** Today view only. 0 callback due, 1 today, 2 pending from an earlier day. */
    section?: number
}

export type LeadSourceView = "today" | "upcoming" | "unscheduled" | "closed" | "all" | "day"

export interface LeadSourceCounts {
    today: number
    upcoming: number
    unscheduled: number
    closed: number
    all: number
    callbacksDue: number
}

export interface LeadSourceListResponse {
    success: boolean
    message?: string
    data: LeadSourceRow[]
    pagination: { page: number; limit: number; total: number; pages: number }
    counts: LeadSourceCounts
    /** Sources allotted to today, and how many of them are no longer New. */
    progress: { total: number; worked: number }
}

export interface LeadSourceActivityItem {
    _id: string
    type: number
    text?: string
    from?: unknown
    to?: unknown
    callbackAt?: string | null
    byName?: string
    at: string
}

export interface LeadSourceDetail extends LeadSourceRow {
    /** Every sheet cell by column key. */
    data: Record<string, string>
    importNotes: string[]
    activity: LeadSourceActivityItem[]
    upload: { _id: string; fileName: string; createdAt: string } | null
    convertedLead: { _id: string; name: string } | null
    createdAt: string
    updatedAt: string
}

export interface LeadSourceAssignee {
    _id: string
    name: string
    role: UserRole
    regions: string[]
}

export interface LeadSourceUploadSummary {
    _id: string
    region: string
    fileName: string
    status: number
    error?: string
    uploadedBy: { _id: string; name: string } | null
    assignedTo: { _id: string; name: string } | null
    allottedDay: string | null
    counts: { read: number; imported: number; warned: number; skipped: number }
    createdAt: string
}

export interface LeadSourceUploadReport extends LeadSourceUploadSummary {
    sheetName?: string
    headerRow?: number
    columns: Array<{ key: string; header: string; label: string; known: boolean }>
    missingColumns: string[]
    fileNotes: string[]
    rows: Array<{ n: number; values: string[]; result: number; messages: string[]; sourceId?: string }>
}
