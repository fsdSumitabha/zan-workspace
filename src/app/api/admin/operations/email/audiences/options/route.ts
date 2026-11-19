import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ACCESS_ROLES } from "@/constants/emailRoles"
import Lead from "@/models/Lead"
import User from "@/models/User"
import EmailContact from "@/models/EmailContact"
import { errorResponse } from "@/lib/email/http"

/**
 * GET /api/admin/operations/email/audiences/options
 *
 * The real values the rule builder offers: lead sources that exist, people
 * leads are assigned to, and contact tags in use.
 *
 * Statuses are not here. They are fixed codes in src/constants, so the
 * client already knows them and a round trip would add nothing.
 *
 * Every query is region-scoped by the plugin, so the options a person sees
 * are the ones from records they can actually reach.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const [sources, assigneeIds, tags] = await Promise.all([
            // Free text on the Lead model, so the list has to come from the
            // data rather than a constant.
            Lead.distinct("source"),
            Lead.distinct("assignedTo"),
            EmailContact.distinct("tags"),
        ])

        const owners = await User.find({
            _id: { $in: assigneeIds.filter(Boolean) },
        })
            .select("_id name email")
            .sort({ name: 1 })
            .lean<{ _id: unknown; name?: string; email?: string }[]>()

        return NextResponse.json({
            success: true,
            data: {
                leadSources: (sources as unknown[])
                    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
                    .sort()
                    .slice(0, 200),
                assignees: owners.map((o) => ({
                    _id: String(o._id),
                    name: o.name || o.email || "Unnamed",
                })),
                contactTags: (tags as unknown[])
                    .filter((t): t is string => typeof t === "string" && t.trim() !== "")
                    .sort()
                    .slice(0, 200),
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the audience options")
    }
}
