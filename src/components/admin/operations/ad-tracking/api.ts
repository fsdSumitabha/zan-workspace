"use client"

import { AD_KIND_META, type AdKind } from "@/constants/adTracking"

export { ApiError, send } from "@/components/admin/operations/lead-sources/api"

export const AD_TRACKING_API = "/api/admin/operations/ad-tracking"
export const AD_TRACKING_PAGE = "/admin/operations/ad-tracking"

/** The page of one campaign, ad set, ad or form. */
export function recordHref(kind: AdKind, id: string): string {
    return `${AD_TRACKING_PAGE}/${AD_KIND_META[kind].segment}/${id}`
}

export function listHref(kind: AdKind): string {
    return `${AD_TRACKING_PAGE}/${AD_KIND_META[kind].segment}`
}

/** Card style shared by every Ad Tracking page. The same as Lead Sources. */
export const CARD = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}
