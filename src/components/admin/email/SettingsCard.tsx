"use client"

import type { ReactNode } from "react"

/**
 * One card on the settings screen. Same border, radius and dark-mode
 * colours as the lead source cards, so the page looks like the rest of
 * the app rather than a bolted-on module.
 */
export default function SettingsCard({
    title,
    description,
    children,
    footer,
}: {
    title: string
    description?: string
    children: ReactNode
    footer?: ReactNode
}) {
    return (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <header className="border-b border-slate-100 px-4 py-3 dark:border-neutral-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {title}
                </h2>
                {description && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400">
                        {description}
                    </p>
                )}
            </header>

            <div className="space-y-4 px-4 py-4">{children}</div>

            {footer && (
                <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 dark:border-neutral-800">
                    {footer}
                </footer>
            )}
        </section>
    )
}

/** A labelled input with optional help text and an error state. */
export function Field({
    label,
    help,
    error,
    children,
}: {
    label: string
    help?: string
    error?: string
    children: ReactNode
}) {
    return (
        <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-neutral-300">
                {label}
            </span>
            {children}
            {error ? (
                <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">
                    {error}
                </span>
            ) : help ? (
                <span className="mt-1 block text-xs text-slate-500 dark:text-neutral-500">
                    {help}
                </span>
            ) : null}
        </label>
    )
}

export const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition " +
    "placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 " +
    "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 " +
    "dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-600 dark:disabled:bg-neutral-900"

export const buttonPrimary =
    "inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition " +
    "hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-60"

export const buttonGhost =
    "inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 transition " +
    "hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 " +
    "dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
