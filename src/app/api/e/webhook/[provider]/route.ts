import crypto from "crypto"
import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { runWithoutRegionScope } from "@/lib/region-scope"
import CampaignRecipient, {
    type ICampaignRecipient,
} from "@/models/CampaignRecipient"
import { TRACKING_EVENT, type TrackingEvent } from "@/constants/emailStatus"
import { recordEvent } from "@/lib/email/tracking/record"
import { parseMessageId } from "@/lib/email/delivery/messageId"
import { checkRateLimit } from "@/lib/security/rateLimit"
import { getClientIp } from "@/lib/security/clientIp"

/**
 * POST /api/e/webhook/[provider]
 *
 * Delivery and bounce reports from the sending provider.
 *
 * ## The signature is checked before anything is read
 *
 * This endpoint is public and it writes to the suppression list. Without a
 * signature check, anyone who found the URL could suppress every address
 * they liked, which would quietly stop a company emailing its own
 * customers and look like nothing at all in the logs.
 *
 * `EMAIL_WEBHOOK_SECRET` must be set. Without it every request is refused,
 * rather than the endpoint running unguarded.
 *
 * ## Matching an event back to a recipient
 *
 * Providers echo the Message-ID we generated, and ours encode the campaign
 * and the recipient (see messageId.ts), so the common case needs no lookup
 * table. When a provider sends its own id instead, the address is used as
 * a fallback, narrowed to the most recent campaign that went to it.
 *
 * ## Gmail sends none of this
 *
 * Which is why the campaign screens show Delivered as an em-dash rather
 * than a zero when the provider does not report. This route is here for
 * Brevo or SES.
 */

/** Which of our event codes a provider's wording maps to. */
const EVENT_MAP: Record<string, TrackingEvent> = {
    delivered: TRACKING_EVENT.DELIVERED,
    delivery: TRACKING_EVENT.DELIVERED,

    bounce: TRACKING_EVENT.BOUNCE_HARD,
    hard_bounce: TRACKING_EVENT.BOUNCE_HARD,
    hardbounce: TRACKING_EVENT.BOUNCE_HARD,
    permanent: TRACKING_EVENT.BOUNCE_HARD,

    soft_bounce: TRACKING_EVENT.BOUNCE_SOFT,
    softbounce: TRACKING_EVENT.BOUNCE_SOFT,
    deferred: TRACKING_EVENT.BOUNCE_SOFT,
    transient: TRACKING_EVENT.BOUNCE_SOFT,

    complaint: TRACKING_EVENT.COMPLAINT,
    spam: TRACKING_EVENT.COMPLAINT,
    "spam_complaint": TRACKING_EVENT.COMPLAINT,

    unsubscribe: TRACKING_EVENT.UNSUBSCRIBE,
    unsubscribed: TRACKING_EVENT.UNSUBSCRIBE,

    // Opens and clicks are tracked by our own pixel and redirect. A
    // provider reporting them too would double-count, so they are ignored.
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ provider: string }> }
) {
    try {
        const { provider } = await params

        const limit = checkRateLimit(
            `email-webhook:${getClientIp(req)}`,
            600,
            60_000
        )
        if (!limit.allowed) {
            return NextResponse.json({ ok: false }, { status: 429 })
        }

        const secret = process.env.EMAIL_WEBHOOK_SECRET?.trim()

        if (!secret || secret.length < 16) {
            console.error(
                "[email] a webhook arrived but EMAIL_WEBHOOK_SECRET is not " +
                "set, so it was refused."
            )
            return NextResponse.json({ ok: false }, { status: 503 })
        }

        // The raw body, because a signature is over the bytes that were
        // sent, not over a re-serialised object.
        const raw = await req.text()

        if (!signatureValid(req, raw, secret)) {
            return NextResponse.json({ ok: false }, { status: 401 })
        }

        let payload: unknown
        try {
            payload = JSON.parse(raw)
        } catch {
            return NextResponse.json({ ok: false }, { status: 400 })
        }

        await dbConnect()

        const events = Array.isArray(payload) ? payload : [payload]
        let handled = 0

        await runWithoutRegionScope(async () => {
            for (const event of events.slice(0, 200)) {
                if (await handleOne(event as Record<string, unknown>, provider)) {
                    handled += 1
                }
            }
        })

        return NextResponse.json({ ok: true, handled })
    } catch (error) {
        console.error("[email] webhook:", error)
        // A 500 makes most providers retry, which is what we want for a
        // transient fault on our side.
        return NextResponse.json({ ok: false }, { status: 500 })
    }
}

/* ------------------------------------------------------------------ */

/**
 * Compares the provider's signature with one computed over the raw body.
 *
 * Providers differ in header name, so a few are accepted. The comparison
 * is constant time, and a length mismatch is rejected before
 * `timingSafeEqual`, which throws on one.
 */
function signatureValid(
    req: NextRequest,
    raw: string,
    secret: string
): boolean {
    const given =
        req.headers.get("x-webhook-signature") ??
        req.headers.get("x-mailin-signature") ??
        req.headers.get("x-signature") ??
        ""

    if (!given) return false

    const expected = crypto
        .createHmac("sha256", secret)
        .update(raw)
        .digest("hex")

    const a = Buffer.from(given.replace(/^sha256=/i, "").trim())
    const b = Buffer.from(expected)

    if (a.length !== b.length) return false

    return crypto.timingSafeEqual(a, b)
}

async function handleOne(
    event: Record<string, unknown>,
    provider: string
): Promise<boolean> {
    const name = String(
        event.event ?? event.eventType ?? event.type ?? event.notificationType ?? ""
    )
        .toLowerCase()
        .replace(/[\s-]/g, "_")

    const type = EVENT_MAP[name]
    if (!type) return false

    const recipient = await findRecipient(event)
    if (!recipient) return false

    await recordEvent({
        recipient,
        type,
        providerMessageId: String(
            event["message-id"] ?? event.messageId ?? ""
        ) || undefined,
        // The provider's own words, kept so a bounce reason can be read on
        // the recipient row months later.
        raw: { provider, ...event },
    })

    return true
}

/**
 * Our Message-ID first, the address second.
 *
 * Ours carries the campaign and the recipient, so it resolves in one
 * indexed lookup with no ambiguity. The address fallback picks the most
 * recent campaign that went to it, which is the right guess when a
 * provider echoes its own id instead of ours.
 */
async function findRecipient(
    event: Record<string, unknown>
): Promise<ICampaignRecipient | null> {
    const messageId = String(
        event["message-id"] ?? event.messageId ?? event.mail_id ?? ""
    )

    const parsed = parseMessageId(messageId)
    if (parsed) {
        const byId = await CampaignRecipient.findById(
            parsed.recipientId
        ).lean<ICampaignRecipient>()

        if (byId) return byId
    }

    const address = String(event.email ?? event.recipient ?? event.to ?? "")
        .trim()
        .toLowerCase()

    if (!address) return null

    return CampaignRecipient.findOne({ emailNormalized: address })
        .sort({ createdAt: -1 })
        .lean<ICampaignRecipient>()
}

export const dynamic = "force-dynamic"
