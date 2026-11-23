import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_IMPORT_ROLES } from "@/constants/adTrackingRoles"
import { AD_PLATFORM, AD_PLATFORM_META, isAdPlatform } from "@/constants/adTracking"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import { errorResponse, LeadSourceError } from "@/lib/lead-sources/http"
import { parsePage } from "@/lib/lead-sources/listQuery"
import { runLeadImport } from "@/lib/ad-tracking/importLeads"
import { serializeImportSummary, type RawLeadImport } from "@/lib/ad-tracking/importView"
import LeadImport from "@/models/LeadImport"

/**
 * GET /api/admin/operations/ad-tracking/imports
 *
 * Past imports, newest first, without their rows.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, LEAD_IMPORT_ROLES)
        await dbConnect()

        const { searchParams } = new URL(req.url)
        const page = parsePage(searchParams.get("page"))
        const limit = Math.min(50, Math.max(1, Math.floor(Number(searchParams.get("limit"))) || 20))

        const [imports, total] = await Promise.all([
            LeadImport.find({})
                .select("-rows -columns -breakdown")
                .populate("uploadedBy", "name")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<RawLeadImport[]>(),
            LeadImport.countDocuments({}),
        ])

        return NextResponse.json({
            success: true,
            data: imports.map(serializeImportSummary),
            pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load imports")
    }
}

/**
 * POST /api/admin/operations/ad-tracking/imports
 *
 * multipart/form-data:
 *   file      .xlsx or .csv (Meta's UTF-16, tab-separated export is read too)
 *   platform  META or OTHER
 *   source    the lead source text, for OTHER only, such as "Trade show"
 *   region    needed only when the importer is viewing several regions
 *   check     "1" to check the file and save nothing
 *
 * With check=1 the answer is the report of what would happen. Without it,
 * the leads are saved, and the answer is the new import's id and counts.
 * See src/lib/ad-tracking/importLeads.ts.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, LEAD_IMPORT_ROLES)
        await dbConnect()

        let form: FormData
        try {
            form = await req.formData()
        } catch {
            throw new LeadSourceError("Send the file as form data.", 400)
        }

        const file = form.get("file")
        if (!(file instanceof File)) {
            throw new LeadSourceError("Choose a file to import.", 400, { field: "file" })
        }

        const platform = form.get("platform")?.toString() || AD_PLATFORM.META
        if (!isAdPlatform(platform) || !AD_PLATFORM_META[platform].importable) {
            throw new LeadSourceError("Pick Meta or Other as the platform.", 400, { field: "platform" })
        }

        const source = (form.get("source")?.toString() ?? "").replace(/\s+/g, " ").trim()
        if (platform !== AD_PLATFORM.META) {
            if (!source) throw new LeadSourceError("Say where these leads came from, such as Trade show.", 400, { field: "source" })
            if (source.length > 60) throw new LeadSourceError("Keep the source under 60 characters.", 400, { field: "source" })
        }

        const region = resolveWriteRegion(form.get("region")?.toString(), user)
        const check = ["1", "true"].includes(form.get("check")?.toString() ?? "")

        const result = await runLeadImport({ file, region, platform, source, user, check })

        return NextResponse.json({ success: true, data: result }, { status: check ? 200 : 201 })
    } catch (error) {
        return errorResponse(error, "Failed to import the file")
    }
}
