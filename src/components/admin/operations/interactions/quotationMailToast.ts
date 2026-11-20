"use client"

import { toast } from "sonner"

/** The `mail` field of a quotation API reply. See QuotationMailResult. */
export interface QuotationMailResultLike {
    status?: "sent" | "failed"
    to?: string
    message?: string
}

/**
 * One message for an action that also emails the client.
 *
 * - The email went: a success toast naming the address it went to.
 * - The email failed: a warning that stays on screen longer, with the
 *   reason. The quotation is saved anyway, and the timeline offers Try
 *   again.
 * - Nothing to report: a plain success, for an older reply with no `mail`
 *   field.
 *
 * Same shape and same reasoning as showGoogleResult, which does this for a
 * meeting that may or may not reach Google Calendar.
 */
export function showQuotationMailResult(
    mail: QuotationMailResultLike | undefined,
    text: { done: string }
): void {
    if (mail?.status === "failed") {
        toast.warning(`${text.done}. The client was not emailed.`, {
            description: mail.message,
            duration: 15_000,
        })
        return
    }

    if (mail?.status === "sent") {
        toast.success(
            mail.message ||
                `${text.done} and emailed to ${mail.to || "the client"}.`
        )
        return
    }

    toast.success(text.done)
}
