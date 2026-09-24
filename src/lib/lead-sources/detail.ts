import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import Lead from "@/models/Lead"
import LeadSource from "@/models/LeadSource"
import LeadSourceUpload from "@/models/LeadSourceUpload"
import type { LeadSourceDetail } from "@/types/leadSource"
import { accessFilter, parseObjectId } from "./access"
import { LeadSourceError } from "./http"
import { serializeRow, type RawSourceRow } from "./serialize"

type Id = { toString(): string }

interface RawDetail extends RawSourceRow {
    data?: Record<string, string>
    importNotes?: string[]
    activity?: Array<{
        _id: Id
        type: number
        text?: string
        from?: unknown
        to?: unknown
        callbackAt?: Date | null
        byName?: string
        at: Date
    }>
    createdAt: Date
    updatedAt: Date
}

/** Everything the details page shows about one lead source. */
export async function loadSourceDetail(id: string, user: AuthUser): Promise<LeadSourceDetail> {
    const _id = parseObjectId(id, "lead source id")

    const source = await LeadSource.findOne({ _id, ...accessFilter(user) })
        .populate("assignedTo", "name")
        .lean<RawDetail>()

    if (!source) throw new LeadSourceError("Lead source not found.", 404)

    const [upload, lead] = await Promise.all([
        source.uploadId
            ? LeadSourceUpload.findById(source.uploadId)
                  .select("fileName createdAt")
                  .lean<{ _id: Id; fileName: string; createdAt: Date }>()
            : null,
        source.convertedLeadId
            ? Lead.findById(source.convertedLeadId).select("name").lean<{ _id: Id; name: string }>()
            : null,
    ])

    return {
        ...serializeRow(source),
        data: source.data ?? {},
        importNotes: source.importNotes ?? [],
        activity: [...(source.activity ?? [])].reverse().map((a) => ({
            _id: a._id.toString(),
            type: a.type,
            ...(a.text ? { text: a.text } : {}),
            ...(a.from !== undefined ? { from: a.from } : {}),
            ...(a.to !== undefined ? { to: a.to } : {}),
            ...(a.callbackAt !== undefined ? { callbackAt: a.callbackAt ? new Date(a.callbackAt).toISOString() : null } : {}),
            byName: a.byName ?? "",
            at: new Date(a.at).toISOString(),
        })),
        upload: upload
            ? { _id: upload._id.toString(), fileName: upload.fileName, createdAt: new Date(upload.createdAt).toISOString() }
            : null,
        convertedLead: lead ? { _id: lead._id.toString(), name: lead.name } : null,
        createdAt: new Date(source.createdAt).toISOString(),
        updatedAt: new Date(source.updatedAt).toISOString(),
    }
}
