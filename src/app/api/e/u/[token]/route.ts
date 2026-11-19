import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { runWithoutRegionScope } from "@/lib/region-scope"
import { TRACKING_EVENT } from "@/constants/emailStatus"
import { recipientByToken, recordEvent } from "@/lib/email/tracking/record"
import EmailSuppression from "@/models/EmailSuppression"

/**
 * POST /api/e/u/[token]
 *
 * One-click unsubscribe.
 *
 * ## Who calls this
 *
 * Gmail and Yahoo, not a person. Every message carries
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, and when a reader
 * presses the provider's own unsubscribe button the provider POSTs here
 * directly. RFC 8058 requires it to work with no confirmation step, no
 * sign-in and no further click.
 *
 * Both providers now require this on bulk mail. A sender without it gets
 * marked as spam instead of unsubscribed from, which is far worse for
 * everybody.
 *
 * ## It always answers 200
 *
 * Unknown token, already unsubscribed, database trouble: 200. A provider
 * that gets an error here may show the reader a failure and then they
 * press "report spam" instead, which is the outcome this whole mechanism
 * exists to avoid.
 *
 * The same route handles the browser form on the unsubscribe page.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params
        await dbConnect()

        await runWithoutRegionScope(async () => {
            const recipient = await recipientByToken(token)
            if (!recipient) return

            // Already on the list. Nothing to do, and no second event.
            const already = await EmailSuppression.findOne({
                region: recipient.region,
                emailNormalized: recipient.emailNormalized,
            })
                .select("_id")
                .lean()

            if (already) return

            await recordEvent({
                recipient,
                type: TRACKING_EVENT.UNSUBSCRIBE,
            })
        })
    } catch (error) {
        // Never surfaced. See the note above.
        console.error("[email] unsubscribe:", error)
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}

/**
 * GET is accepted so a provider that probes the link does not record a
 * broken URL. It does NOT unsubscribe: a scanner that follows every link
 * in an email would otherwise unsubscribe the reader before they had read
 * anything.
 *
 * The page at /e/u/[token] is what a person sees and acts on.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params

    return NextResponse.redirect(
        new URL(
            `/e/u/${encodeURIComponent(token)}`,
            process.env.EMAIL_PUBLIC_ORIGIN ?? "http://localhost:3000"
        ),
        { status: 302, headers: { "Cache-Control": "no-store" } }
    )
}

export const dynamic = "force-dynamic"
