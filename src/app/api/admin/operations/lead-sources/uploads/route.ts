import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_MANAGE_ROLES } from "@/constants/leadSourceRoles"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import LeadSourceUpload from "@/models/LeadSourceUpload"
import { resolveAssignee } from "@/lib/lead-sources/assignee"
import { addDays, isDayString, resolveClientToday } from "@/lib/lead-sources/day"
import { errorResponse, LeadSourceError } from "@/lib/lead-sources/http"
import { parsePage } from "@/lib/lead-sources/listQuery"
import { processUpload } from "@/lib/lead-sources/upload"
import { serializeUploadSummary, type RawUpload } from "@/lib/lead-sources/uploadView"

/**
 * GET /api/admin/operations/lead-sources/uploads
 *
 * Past uploads, newest first, without their rows.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, LEAD_SOURCE_MANAGE_ROLES)
        await dbConnect()

        const { searchParams } = new URL(req.url)
        const page = parsePage(searchParams.get("page"))
        const limit = Math.min(50, Math.max(1, Math.floor(Number(searchParams.get("limit"))) || 20))

        const [uploads, total] = await Promise.all([
            LeadSourceUpload.find({})
                .select("-rows -columns")
                .populate("uploadedBy", "name")
                .populate("assignedTo", "name")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<RawUpload[]>(),
            LeadSourceUpload.countDocuments({}),
        ])

        return NextResponse.json({
            success: true,
            data: uploads.map(serializeUploadSummary),
            pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load uploads")
    }
}

/**
 * POST /api/admin/operations/lead-sources/uploads
 *
 * multipart/form-data:
 *   file         .xlsx or .csv
 *   region       needed only when the uploader is viewing several regions
 *   assignedTo   optional user id
 *   allottedDay  optional "YYYY-MM-DD", today or later
 *   today        the uploader's local day
 *
 * A problem with the file as a whole refuses it and saves nothing. Problems
 * with single rows skip those rows, and the report says why.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, LEAD_SOURCE_MANAGE_ROLES)
        await dbConnect()

        let form: FormData
        try {
            form = await req.formData()
        } catch {
            throw new LeadSourceError("Send the file as form data.", 400)
        }

        const file = form.get("file")
        if (!(file instanceof File)) {
            throw new LeadSourceError("Choose a file to upload.", 400, { field: "file" })
        }

        const region = resolveWriteRegion(form.get("region")?.toString(), user)

        const rawAssignee = form.get("assignedTo")?.toString() ?? ""
        const assignee = rawAssignee ? await resolveAssignee(rawAssignee, [region]) : null

        const rawDay = form.get("allottedDay")?.toString() ?? ""
        let allottedDay: string | null = null
        if (rawDay) {
            const today = resolveClientToday(form.get("today")?.toString())
            if (!isDayString(rawDay)) throw new LeadSourceError("Pick a valid day.", 400, { field: "allottedDay" })
            if (rawDay < today) throw new LeadSourceError("Pick today or a later day.", 400, { field: "allottedDay" })
            if (rawDay > addDays(today, 366)) {
                throw new LeadSourceError("Pick a day within the next year.", 400, { field: "allottedDay" })
            }
            allottedDay = rawDay
        }

        const result = await processUpload({ file, region, assignee, allottedDay, user })

        return NextResponse.json({ success: true, data: result }, { status: 201 })
    } catch (error) {
        return errorResponse(error, "Failed to upload the file")
    }
}
