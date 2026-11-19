import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { runWithoutRegionScope } from "@/lib/region-scope"
import { TRACKING_EVENT } from "@/constants/emailStatus"
import { hashIp } from "@/lib/email/tracking/token"
import { recipientByToken, recordEvent } from "@/lib/email/tracking/record"
import { getClientIp } from "@/lib/security/clientIp"

/**
 * GET /api/e/o/[token]
 *
 * The open pixel. A 1x1 transparent GIF.
 *
 * ## It returns the same thing to everyone, always
 *
 * Valid token, unknown token, missing token, database down: one 43-byte
 * GIF and a 200. A route that answers 404 for a bad token is an oracle —
 * somebody could sit and test tokens until one comes back 200, and each
 * hit would confirm a real recipient of a real campaign.
 *
 * ## Public and unauthenticated, by necessity
 *
 * It is fetched by a mail client that has no session. The token is the
 * only credential, which is why it is an HMAC rather than an id.
 *
 * ## Opens are wrong and we say so elsewhere
 *
 * Apple Mail Privacy Protection fetches this for every message, read or
 * not. Corporate scanners do too. Gmail caches it, so a second open often
 * does not register. The number is directionally useful and numerically
 * wrong, and the campaign screens say that next to it.
 */

/** A 1x1 fully transparent GIF. The smallest valid image. */
const PIXEL = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
)

function pixelResponse(): NextResponse {
    return new NextResponse(new Uint8Array(PIXEL), {
        status: 200,
        headers: {
            "Content-Type": "image/gif",
            "Content-Length": String(PIXEL.length),
            // Never cached. A cached pixel is an open that is never
            // counted, and caches here belong to proxies we do not control.
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            Pragma: "no-cache",
            Expires: "0",
            // The image is not a page and has nothing to frame or sniff.
            "X-Content-Type-Options": "nosniff",
        },
    })
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params

        await dbConnect()

        // Public route: there is no signed-in person, so no region scope.
        // The token identifies one recipient in one region.
        await runWithoutRegionScope(async () => {
            const recipient = await recipientByToken(token)
            if (!recipient) return

            await recordEvent({
                recipient,
                type: TRACKING_EVENT.OPEN,
                ipHash: hashIp(getClientIp(req)),
                userAgent: req.headers.get("user-agent") ?? undefined,
            })
        })
    } catch (error) {
        // Logged, never surfaced. The reader gets their image either way.
        console.error("[email] open pixel:", error)
    }

    return pixelResponse()
}

export const dynamic = "force-dynamic"
