"use client"

import { toast } from "sonner"

/** The `google` field of a meeting API reply. See GoogleSyncResult. */
export interface GoogleResultLike {
    status?: "cancelled" | "updated" | "skipped" | "failed"
    message?: string
}

/**
 * One message for a meeting change that may also reach Google Calendar.
 *
 * - Google changed: `googleDone`, which says the guests were emailed.
 * - Nothing to do in Google, such as an offline meeting: `done`.
 * - Google failed: a warning that stays on screen longer, with the reason.
 *   The CRM change is saved anyway, and the meeting card offers Try again.
 */
export function showGoogleResult(
    google: GoogleResultLike | undefined,
    text: { done: string; googleDone: string }
): void {
    if (google?.status === "failed") {
        toast.warning(`${text.done} in the CRM. Google Calendar was not updated.`, {
            description: google.message,
            duration: 15_000,
        })
        return
    }
    if (google?.status === "cancelled" || google?.status === "updated") {
        toast.success(text.googleDone)
        return
    }
    toast.success(text.done)
}
