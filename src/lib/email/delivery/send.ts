import type { Transporter } from "nodemailer"
import type { Types } from "mongoose"
import type { ICampaignRecipient } from "@/models/CampaignRecipient"
import { renderMerge, renderMergeText, renderSubject } from "@/lib/email/personalise/render"
import { injectTracking } from "@/lib/email/tracking/inject"
import { buildMessageId } from "./messageId"

/**
 * Sends one email to one person.
 *
 * ## One recipient per message, always
 *
 * `to` carries exactly one address and nothing is ever put in `cc` or
 * `bcc`. There is no code path in this module that places two recipients
 * on one message, which is what stops a campaign leaking its whole list to
 * every reader.
 *
 * ## It does not touch the database
 *
 * The caller writes the outcome. Keeping the write out of here is what
 * lets the worker record a result the same way whether the send threw,
 * returned, or was abandoned.
 */

export interface SendInput {
    transporter: Transporter
    recipient: ICampaignRecipient
    campaignId: Types.ObjectId | string
    subject: string
    html: string
    text: string
    from: { name: string; address: string }
    replyTo?: string
    sendingDomain: string
    /** Per-campaign fallbacks for merge tokens with no value. */
    fallbacks?: Record<string, string>
    /** The one-click unsubscribe URL for this recipient. */
    unsubscribeUrl: string
    /** The sender's postal address, for the footer token. */
    postalAddress: string
    /** Where the tracking routes live. */
    origin: string
    trackClicks: boolean
    trackOpens: boolean
}

export interface SendOutcome {
    messageId: string
    /** What the server said. Recorded verbatim on the attempt. */
    response?: string
    /** Addresses the server refused while accepting others. */
    rejected: string[]
}

export async function sendOne(input: SendInput): Promise<SendOutcome> {
    const { recipient } = input

    const messageId = buildMessageId({
        campaignId: input.campaignId,
        recipientId: recipient._id as Types.ObjectId,
        attempt: recipient.attempts,
        sendingDomain: input.sendingDomain,
    })

    const merge = {
        data: recipient.mergeData,
        fallbacks: input.fallbacks,
        // Values we generated. They are not escaped, because escaping a URL
        // we built would break it, and nothing a person typed goes here.
        raw: {
            unsubscribe_url: input.unsubscribeUrl,
            postal_address: input.postalAddress,
        },
    }

    const merged = renderMerge(input.html, merge).text
    const text = renderMergeText(input.text, merge).text
    const subject = renderSubject(input.subject, merge).text

    /**
     * Tracking is injected AFTER the merge fields are filled.
     *
     * The order matters. A link such as `{{cta_url}}` is only a real URL
     * once the merge has run, and rewriting before that would leave the
     * tracker pointing at a literal `{{cta_url}}`. Doing it after means
     * every link that resolved to something real gets tracked, and the
     * ones that did not are left alone.
     *
     * The unsubscribe URL is deliberately not rewritten; see inject.ts.
     */
    const { html } = injectTracking({
        html: merged,
        recipientToken: recipient.trackingToken ?? "",
        origin: input.origin,
        trackClicks: input.trackClicks && Boolean(recipient.trackingToken),
        trackOpens: input.trackOpens && Boolean(recipient.trackingToken),
    })

    const info = await input.transporter.sendMail({
        from: { name: input.from.name, address: input.from.address },
        to: recipient.email,
        replyTo: input.replyTo,
        subject,
        html,
        text,
        messageId,
        headers: {
            /**
             * One-click unsubscribe. Gmail and Yahoo require these on bulk
             * mail, and a message without them is far more likely to be
             * marked as spam than to be unsubscribed from politely.
             */
            "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            /**
             * Tells well-behaved auto-responders not to reply. Without it,
             * a hundred out-of-office replies arrive at the sending inbox.
             */
            Precedence: "bulk",
            "Auto-Submitted": "auto-generated",
        },
    })

    return {
        messageId: info.messageId ?? messageId,
        response: typeof info.response === "string" ? info.response : undefined,
        rejected: (info.rejected ?? []).map(String),
    }
}

/**
 * The unsubscribe URL for one recipient.
 *
 * The token is the one already on the recipient row, so this is a string
 * build with no database read in the send loop.
 */
export function unsubscribeUrlFor(
    origin: string,
    token: string | undefined
): string {
    const base = origin.replace(/\/+$/, "")
    return token ? `${base}/e/u/${token}` : `${base}/e/u/unknown`
}
