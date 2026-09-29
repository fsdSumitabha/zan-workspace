import { Types } from "mongoose"
import LeadSourceUpload from "@/models/LeadSourceUpload"
import type { LeadSourceUploadReport, LeadSourceUploadSummary } from "@/types/leadSource"
import { parseObjectId } from "./access"
import { LeadSourceError } from "./http"

type Id = { toString(): string }
type Named = { _id: Id; name?: string } | Id | null | undefined

export interface RawUpload {
    _id: Id
    region: string
    fileName: string
    status: number
    error?: string
    uploadedBy?: Named
    assignedTo?: Named
    allottedDay?: string | null
    counts?: { read: number; imported: number; warned: number; skipped: number }
    createdAt: Date
    sheetName?: string
    headerRow?: number
    columns?: Array<{ key: string; header: string; label: string; known: boolean }>
    missingColumns?: string[]
    fileNotes?: string[]
    rows?: Array<{ n: number; values: string[]; result: number; messages: string[]; sourceId?: Id }>
}

function named(value: Named): { _id: string; name: string } | null {
    if (!value) return null
    if (typeof value === "object" && "name" in value) {
        return { _id: value._id.toString(), name: value.name ?? "" }
    }
    // Not populated: the person is outside the caller's regions, or deleted.
    return { _id: value.toString(), name: "" }
}

export function serializeUploadSummary(doc: RawUpload): LeadSourceUploadSummary {
    return {
        _id: doc._id.toString(),
        region: doc.region,
        fileName: doc.fileName,
        status: doc.status,
        ...(doc.error ? { error: doc.error } : {}),
        uploadedBy: named(doc.uploadedBy),
        assignedTo: named(doc.assignedTo),
        allottedDay: doc.allottedDay ?? null,
        counts: doc.counts ?? { read: 0, imported: 0, warned: 0, skipped: 0 },
        createdAt: new Date(doc.createdAt).toISOString(),
    }
}

export function serializeUploadReport(doc: RawUpload): LeadSourceUploadReport {
    return {
        ...serializeUploadSummary(doc),
        sheetName: doc.sheetName,
        headerRow: doc.headerRow,
        columns: doc.columns ?? [],
        missingColumns: doc.missingColumns ?? [],
        fileNotes: doc.fileNotes ?? [],
        rows: (doc.rows ?? []).map((r) => ({
            n: r.n,
            values: r.values,
            result: r.result,
            messages: r.messages,
            ...(r.sourceId ? { sourceId: r.sourceId.toString() } : {}),
        })),
    }
}

/** One upload with its rows, or a 404. Region-scoped like every other read. */
export async function loadUploadReport(id: string): Promise<RawUpload> {
    const _id: Types.ObjectId = parseObjectId(id, "upload id")

    const doc = await LeadSourceUpload.findById(_id)
        .populate("uploadedBy", "name")
        .populate("assignedTo", "name")
        .lean<RawUpload>()

    if (!doc) throw new LeadSourceError("Upload not found.", 404)
    return doc
}
