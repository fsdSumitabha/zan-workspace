import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_AUTHOR_ROLES } from "@/constants/emailRoles"
import EmailAudience, { type IEmailAudience } from "@/models/EmailAudience"
import { EmailError, errorResponse, isObjectId, readJson } from "@/lib/email/http"
import { parseAudienceRules } from "@/lib/email/audience/parseRules"
import { previewAudience } from "@/lib/email/audience/preview"
import { checkRateLimit } from "@/lib/security/rateLimit"

/**
 * POST /api/admin/operations/email/audiences/preview
 *
 * How many people a set of rules would reach, and where everybody else
 * went. The audience builder calls this as the rules are edited, and the
 * campaign wizard calls it before scheduling.
 *
 * Takes either `rules` directly, or `audienceId` to preview a saved one.
 *
 * ## Why it is rate limited
 *
 * It runs several collection queries, and the builder calls it while
 * somebody is clicking. On Vercel Hobby there is no overage billing:
 * exceeding the Active CPU allowance pauses the whole project for 30 days.
 * The client debounces; this is the backstop for when it does not.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_AUTHOR_ROLES)

        const limit = checkRateLimit(`email-audience-preview:${user.id}`, 60, 60_000)
        if (!limit.allowed) {
            throw new EmailError(
                `Too many previews. Try again in ${limit.retryAfterSec} seconds.`,
                429
            )
        }

        await dbConnect()

        const body = await readJson(req)

        let rules
        if (typeof body.audienceId === "string") {
            if (!isObjectId(body.audienceId)) {
                throw new EmailError("That audience was not found.", 404)
            }
            const saved = await EmailAudience.findById(body.audienceId)
                .lean<IEmailAudience>()
            if (!saved) {
                throw new EmailError("That audience was not found.", 404)
            }
            rules = saved.rules
        } else {
            rules = parseAudienceRules(body.rules)
        }

        const preview = await previewAudience(rules, {
            allowRoleAddresses: body.allowRoleAddresses === true,
        })

        return NextResponse.json({ success: true, data: preview })
    } catch (error) {
        return errorResponse(error, "Failed to work out the recipients")
    }
}
