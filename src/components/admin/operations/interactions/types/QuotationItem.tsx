"use client"

import { useState } from "react"
import * as Icons from "lucide-react"
import { toast } from "sonner"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import { INTERACTION_TYPE_META } from "@/constants/interactionTypes"
import Tooltip from "@/components/admin/operations/tooltip/Tooltip"

/**
 * One quotation on the timeline, and whether it reached the client.
 *
 * The email is sent after the quotation is saved, so the two can disagree:
 * the quotation exists and the client never got it. That is the state this
 * component exists to make impossible to miss. A failure shows an amber
 * strip with the reason and a Try again button, the same way a meeting that
 * could not reach Google Calendar does.
 */

interface QuotationMail {
    status?: "sent" | "failed"
    to?: string
    sentAt?: string
    attempts?: number
    error?: string
}

export default function QuotationItem({
    item,
    onChanged,
}: {
    item: any
    onChanged?: () => void
}) {
    const quotation = item.quotation
    const mail: QuotationMail = quotation?.mail ?? {}
    const [sending, setSending] = useState(false)

    const failed = mail.status === "failed"
    const sent = mail.status === "sent"
    // No mail record at all. Either this quotation predates the emailing, or
    // nobody has pressed the button. Both are offered the button and neither
    // is warned about, because a quotation from before was sent by hand and
    // saying "not emailed" about it would be wrong.
    const neverTried = !mail.status

    const sendMail = async () => {
        if (sending || !quotation?._id) return
        setSending(true)
        try {
            const res = await fetch(
                `/api/admin/operations/quotations/${quotation._id}/send`,
                { method: "POST" }
            )
            const json = await res.json().catch(() => null)
            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "The quotation was not emailed")
            }
            toast.success(json.message || "Quotation emailed to the client")
            onChanged?.()
        } catch (err: any) {
            toast.error(err?.message || "The quotation was not emailed", {
                duration: 15_000,
            })
            // Refresh either way: the attempt was recorded on the quotation.
            onChanged?.()
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="flex group gap-3 p-4 rounded-lg dark:rounded-xl border border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 transition">

            {/* Left Icon */}
            <div className="mt-1">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/30">
                    <Icons.FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2 min-w-0">

                {/* Header */}
                <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {item.title && (
                            <h3 className="font-semibold text-sm capitalize tracking-wide text-neutral-800 dark:text-neutral-200">
                                {item.title}
                            </h3>
                        )}
                        <StatusBadge status={item.type} meta={INTERACTION_TYPE_META} />
                    </div>

                    <span className="text-xs text-gray-500 whitespace-nowrap flex items-center gap-1 shrink-0">
                        <Icons.Calendar className="w-3 h-3" />
                        <TimeAgo date={item.createdAt} />
                    </span>
                </div>

                {item.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap break-words">
                        {item.description}
                    </p>
                )}

                {/*  Quotation Details */}
                {quotation && (
                    <div className="mt-2 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                                ₹{quotation.amount.toLocaleString()} <small className="text-xs text-gray-500" > + {quotation.gst_percentage}% GST </small>
                            </p>
                            {quotation.gst_percentage && (
                                <p className="text-xs text-gray-500">
                                    Amount Inclusive GST : ₹{(quotation.amount * (1 + quotation.gst_percentage / 100)).toLocaleString()}
                                </p>
                            )}
                        </div>

                        {quotation.url && (
                            <a
                                href={quotation.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition"
                            >
                                <Icons.Download className="w-3 h-3" />
                                Download
                            </a>
                        )}
                    </div>
                )}

                {/* Did the client actually get it? */}
                {quotation && failed && (
                    <div className="mt-2 p-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20">
                        <div className="flex gap-2">
                            <Icons.TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                            <div className="min-w-0 flex-1 space-y-2">
                                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                                    Saved here, but not emailed to the client.
                                </p>
                                {mail.error && (
                                    <p className="text-xs text-amber-700 dark:text-amber-400/90 leading-relaxed break-words">
                                        {mail.error}
                                    </p>
                                )}
                                <div className="flex items-center gap-3 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={sendMail}
                                        disabled={sending}
                                        className="flex items-center gap-1 text-xs px-3 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60 transition"
                                    >
                                        <Icons.RefreshCw
                                            className={`w-3 h-3 ${sending ? "animate-spin" : ""}`}
                                        />
                                        {sending ? "Sending..." : "Try again"}
                                    </button>
                                    {typeof mail.attempts === "number" && mail.attempts > 1 && (
                                        <span className="text-xs text-amber-700 dark:text-amber-400/80">
                                            {mail.attempts} tries so far
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {quotation && sent && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-gray-500">
                        <Icons.MailCheck className="w-3.5 h-3.5 text-green-600 dark:text-green-500" />
                        <span className="break-all">
                            Emailed to {mail.to || "the client"}
                        </span>
                        {mail.sentAt && (
                            <>
                                <span aria-hidden="true">·</span>
                                <TimeAgo date={mail.sentAt} />
                            </>
                        )}
                        <button
                            type="button"
                            onClick={sendMail}
                            disabled={sending}
                            className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-60"
                        >
                            {sending ? "Sending..." : "Send again"}
                        </button>
                    </div>
                )}

                {quotation && neverTried && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                        <Icons.Mail className="w-3.5 h-3.5" />
                        <button
                            type="button"
                            onClick={sendMail}
                            disabled={sending}
                            className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-60"
                        >
                            {sending ? "Sending..." : "Email to client"}
                        </button>
                    </div>
                )}
            </div>

            {item.createdBy && (
                <Tooltip content={`Created by ${item.createdBy.name} `} />
            )}
        </div>
    )
}
