import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { runWithoutRegionScope } from "@/lib/region-scope"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import EmailTemplateVersion, {
    type IEmailTemplateVersion,
} from "@/models/EmailTemplateVersion"
import { TRACKING_EVENT } from "@/constants/emailStatus"
import { decodeTarget, hashIp, verifyTarget } from "@/lib/email/tracking/token"
import { recipientByToken, recordEvent } from "@/lib/email/tracking/record"
import { hostAllowed } from "@/lib/email/template/extractLinks"
import { getClientIp } from "@/lib/security/clientIp"

/**
 * GET /api/e/c/[token]?u=<base64url>&s=<signature>
 *
 * The click redirect.
 *
 * ## How open redirect is closed
 *
 * Three checks, and the third is the one that matters:
 *
 *   1. The signature must match this recipient and this destination, so a
 *      link cannot be edited after it was sent.
 *   2. The scheme must be http or https.
 *   3. **The host must appear in the allow-list of the template version
 *      the campaign pinned.**
 *
 * That list was built from the compiled HTML when the version was saved,
 * and a version is immutable. So the only hosts this route will ever send
 * a reader to are hosts that were written into that email. A destination
 * that was never in the template cannot be reached through here, whoever
 * signed it and whatever the query says.
 *
 * The first check alone would not be enough: anyone holding our tracking
 * secret could mint links. The third holds even then.
 *
 * ## A refusal is a 404, not a redirect
 *
 * Nothing is sent anywhere we have not verified, and the reader sees a
 * plain page rather than a silent bounce to somewhere unexpected.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params
        const search = new URL(req.url).searchParams

        const encoded = search.get("u") ?? ""
        const signature = search.get("s") ?? ""

        const target = decodeTarget(encoded)
        if (!target) return refuse()

        /* 1. The signature. */
        if (!verifyTarget(token, target, signature)) return refuse()

        /* 2. The scheme. */
        let url: URL
        try {
            url = new URL(target)
        } catch {
            return refuse()
        }

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return refuse()
        }

        await dbConnect()

        const outcome = await runWithoutRegionScope(async () => {
            const recipient = await recipientByToken(token)
            if (!recipient) return null

            /* 3. The allow-list from the pinned template version. */
            const campaign = await EmailCampaign.findById(recipient.campaignId)
                .select("templateVersionId")
                .lean<IEmailCampaign>()

            if (!campaign?.templateVersionId) return null

            const version = await EmailTemplateVersion.findById(
                campaign.templateVersionId
            )
                .select("linkHosts")
                .lean<IEmailTemplateVersion>()

            if (!version) return null

            if (!hostAllowed(url.hostname, version.linkHosts ?? [])) {
                // Signed, but not a host this email ever linked to. Either
                // the template changed under a live campaign, or somebody
                // is trying to borrow the redirect.
                console.warn(
                    `[email] refused a click to ${url.hostname}, which is not ` +
                    "in the template version's allow-list"
                )
                return null
            }

            await recordEvent({
                recipient,
                type: TRACKING_EVENT.CLICK,
                url: target,
                ipHash: hashIp(getClientIp(req)),
                userAgent: req.headers.get("user-agent") ?? undefined,
            })

            return target
        })

        if (!outcome) return refuse()

        return NextResponse.redirect(outcome, {
            status: 302,
            headers: {
                "Cache-Control": "no-store",
                // The destination does not need to know which email, which
                // campaign or which recipient sent the reader.
                "Referrer-Policy": "no-referrer",
            },
        })
    } catch (error) {
        console.error("[email] click redirect:", error)
        return refuse()
    }
}

/**
 * The same answer for every failure.
 *
 * Bad signature, unknown token, host not allowed, database down: one page.
 * Telling the difference would let somebody work out which tokens are real.
 */
function refuse(): NextResponse {
    return new NextResponse(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>Link not available</title></head>` +
        `<body style="font-family:system-ui,sans-serif;max-width:32rem;` +
        `margin:4rem auto;padding:0 1rem;color:#0f172a;">` +
        `<h1 style="font-size:1.125rem;">This link is not available</h1>` +
        `<p style="color:#64748b;font-size:0.95rem;line-height:1.6;">` +
        `It may have expired, or it may have been changed since the email ` +
        `was sent. If you were expecting to go somewhere, please use the ` +
        `original email or get in touch with us.</p></body></html>`,
        {
            status: 404,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        }
    )
}

export const dynamic = "force-dynamic"
