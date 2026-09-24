"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

interface Props {
    open: boolean
    onClose: () => void
    title: string
    description?: ReactNode
    children: ReactNode
    footer?: ReactNode
}

/**
 * A modal window, for the bulk actions and the details page actions.
 * Centred on a desktop, a sheet at the bottom on a phone.
 */
export default function Dialog({ open, onClose, title, description, children, footer }: Props) {
    const panelRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const previous = document.activeElement as HTMLElement | null

        // Focus the first field, so the keyboard works straight away.
        const first = panelRef.current?.querySelector<HTMLElement>(
            "input, select, textarea, button:not([data-close])"
        )
        first?.focus()

        return () => previous?.focus?.()
    }, [open])

    if (!open || typeof document === "undefined") return null

    return createPortal(
        <div
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === "Escape") onClose()
            }}
        >
            <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />

            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
            >
                <div className="flex items-start justify-between gap-3 px-5 pt-5">
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
                        {description && (
                            <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</div>
                        )}
                    </div>
                    <button
                        type="button"
                        data-close
                        onClick={onClose}
                        className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4">{children}</div>

                {footer && (
                    <div className="flex justify-end gap-2 border-t border-neutral-100 dark:border-neutral-800 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}

export const BUTTON_PRIMARY =
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"

export const BUTTON_DANGER =
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition"

export const BUTTON_QUIET =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 transition"

export const FIELD =
    "w-full rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
