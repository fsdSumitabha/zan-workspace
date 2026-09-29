import { LEAD_SOURCE_COLUMNS } from "@/config/leadSourceSheet"
import type { LeadSourceRow } from "@/types/leadSource"

/**
 * Turns a lead source from the database into the row the list page draws.
 * The list, the status routes and the details route all answer with this
 * shape, so the page can swap a row in place after a change.
 */

/** Column keys shown next to the name on the list, in order. From leadSourceSheet.ts. */
export const LIST_INFO_KEYS = LEAD_SOURCE_COLUMNS.filter((c) => c.inList !== undefined)
    .sort((a, b) => (a.inList ?? 0) - (b.inList ?? 0))
    .map((c) => c.key)

type Id = { toString(): string }

interface RawAssignee {
    _id: Id
    name?: string
    avatar?: string
}

export interface RawSourceRow {
    _id: Id
    name: string
    company?: string
    email?: string
    phone: string
    status: number
    region: string
    allottedDay?: string | null
    callbackAt?: Date | null
    lastNote?: string
    lastNoteAt?: Date
    uploadId?: Id
    rowNumber?: number
    convertedLeadId?: Id
    assignedTo?: Id | RawAssignee | null
    /** From the list pipeline's lookup. */
    assignee?: RawAssignee | null
    /** From the list pipeline. 0 due callback, 1 today, 2 earlier day. */
    section?: number
    data?: Record<string, string> | Map<string, string>
}

function readData(data: RawSourceRow["data"], key: string): string {
    if (!data) return ""
    if (data instanceof Map) return data.get(key) ?? ""
    return data[key] ?? ""
}

function isAssignee(value: unknown): value is RawAssignee {
    return !!value && typeof value === "object" && "name" in value
}

export function serializeRow(doc: RawSourceRow): LeadSourceRow {
    const assignee = doc.assignee ?? (isAssignee(doc.assignedTo) ? doc.assignedTo : null)

    const listInfo = LIST_INFO_KEYS.map((key) =>
        key === "company" ? doc.company || readData(doc.data, key) : readData(doc.data, key)
    ).filter(Boolean)

    return {
        _id: doc._id.toString(),
        name: doc.name,
        company: doc.company || "",
        email: doc.email || "",
        phone: doc.phone,
        status: doc.status,
        region: doc.region,
        allottedDay: doc.allottedDay ?? null,
        callbackAt: doc.callbackAt ? new Date(doc.callbackAt).toISOString() : null,
        lastNote: doc.lastNote || "",
        lastNoteAt: doc.lastNoteAt ? new Date(doc.lastNoteAt).toISOString() : null,
        uploadId: doc.uploadId ? doc.uploadId.toString() : null,
        rowNumber: doc.rowNumber ?? null,
        convertedLeadId: doc.convertedLeadId ? doc.convertedLeadId.toString() : null,
        assignee: assignee
            ? { _id: assignee._id.toString(), name: assignee.name || "", avatar: assignee.avatar?.trim() || "" }
            : null,
        listInfo: [...new Set(listInfo)],
        ...(doc.section !== undefined ? { section: doc.section } : {}),
    }
}
