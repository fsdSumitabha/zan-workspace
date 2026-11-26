import LeadImport from "@/models/LeadImport"
import { EMPTY_IMPORT_COUNTS, EMPTY_SOURCE_COUNTS } from "@/constants/adTracking"
import { parseObjectId } from "@/lib/lead-sources/access"
import { LeadSourceError } from "@/lib/lead-sources/http"
import type { LeadImportReport, LeadImportSummary } from "@/types/adTracking"

type Id = { toString(): string }
type Named = { _id: Id; name?: string } | Id | null | undefined

export interface RawLeadImport {
    _id: Id
    region: string
    platform: string
    source: string
    fileName: string
    status: number
    error?: string
    uploadedBy?: Named
    counts?: LeadImportSummary["counts"]
    newSources?: LeadImportSummary["newSources"]
    createdAt: Date
    sheetName?: string
    headerRow?: number
    columns?: LeadImportReport["columns"]
    fileNotes?: string[]
    rows?: Array<{ n: number; values: string[]; result: number; messages: string[]; leadId?: Id }>
    breakdown?: Record<string, Array<{ ref: Id; externalId: string; name: string; imported: number; duplicates: number; failed: number }>>
}

function named(value: Named): { _id: string; name: string } | null {
    if (!value) return null
    if (typeof value === "object" && "name" in value) return { _id: value._id.toString(), name: value.name ?? "" }
    return { _id: value.toString(), name: "" }
}

export function serializeImportSummary(doc: RawLeadImport): LeadImportSummary {
    return {
        _id: doc._id.toString(),
        region: doc.region,
        platform: doc.platform as LeadImportSummary["platform"],
        source: doc.source,
        fileName: doc.fileName,
        status: doc.status,
        ...(doc.error ? { error: doc.error } : {}),
        uploadedBy: named(doc.uploadedBy),
        counts: { ...EMPTY_IMPORT_COUNTS, ...(doc.counts ?? {}) },
        newSources: { ...EMPTY_SOURCE_COUNTS, ...(doc.newSources ?? {}) },
        createdAt: new Date(doc.createdAt).toISOString(),
    }
}

export function serializeImportReport(doc: RawLeadImport): LeadImportReport {
    const breakdown = (key: string) =>
        (doc.breakdown?.[key] ?? []).map((b) => ({
            _id: b.ref.toString(),
            externalId: b.externalId,
            name: b.name,
            imported: b.imported,
            duplicates: b.duplicates,
            failed: b.failed,
        }))

    return {
        ...serializeImportSummary(doc),
        sheetName: doc.sheetName,
        headerRow: doc.headerRow,
        columns: doc.columns ?? [],
        fileNotes: doc.fileNotes ?? [],
        rows: (doc.rows ?? []).map((r) => ({
            n: r.n,
            values: r.values,
            result: r.result,
            messages: r.messages,
            ...(r.leadId ? { leadId: r.leadId.toString() } : {}),
        })),
        breakdown: {
            campaigns: breakdown("campaigns"),
            adSets: breakdown("adSets"),
            ads: breakdown("ads"),
            forms: breakdown("forms"),
        },
    }
}

/** One import with its rows, or a 404. Region-scoped like every other read. */
export async function loadImportReport(id: string): Promise<RawLeadImport> {
    const _id = parseObjectId(id, "import id")
    const doc = await LeadImport.findById(_id).populate("uploadedBy", "name").lean<RawLeadImport>()
    if (!doc) throw new LeadSourceError("Import not found.", 404)
    return doc
}
