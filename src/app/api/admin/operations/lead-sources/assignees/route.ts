import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { LEAD_SOURCE_ACCESS_ROLES, LEAD_SOURCE_MANAGE_ROLES } from "@/constants/leadSourceRoles"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import User from "@/models/User"
import { errorResponse, LeadSourceError } from "@/lib/lead-sources/http"

/**
 * GET /api/admin/operations/lead-sources/assignees?regions=US,IN
 *
 * People a manager can assign lead sources to: active, with a lead source
 * role, holding every region asked for.
 *
 * With no `regions`, everyone with a lead source role in any region the
 * caller is viewing. The list page's person filter uses that.
 *
 * The User query is region-scoped for the caller as well, so a manager only
 * ever sees people in their own regions.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, LEAD_SOURCE_MANAGE_ROLES)
        await dbConnect()

        const raw = new URL(req.url).searchParams.get("regions") ?? ""
        const asked = [...new Set(raw.split(",").map((r) => r.trim().toUpperCase()).filter(Boolean))]

        const unknown = asked.filter((r) => !(REGION_CODES as readonly string[]).includes(r))
        if (unknown.length > 0) throw new LeadSourceError(`Unknown region: ${unknown.join(", ")}`, 400)

        const regions = asked as RegionCode[]

        const users = await User.find({
            isActive: true,
            role: { $in: LEAD_SOURCE_ACCESS_ROLES },
            // In $and so it cannot collide with the region scope's own
            // condition on the same `regions` field.
            ...(regions.length > 0 ? { $and: [{ regions: { $all: regions } }] } : {}),
        })
            .select("_id name role regions")
            .sort({ name: 1 })
            .limit(300)
            .lean()

        return NextResponse.json({ success: true, data: users })
    } catch (error) {
        return errorResponse(error, "Failed to load people")
    }
}
