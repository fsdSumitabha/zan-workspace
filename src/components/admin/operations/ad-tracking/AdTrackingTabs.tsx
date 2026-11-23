"use client"

import Link from "next/link"
import clsx from "clsx"
import { useAuth } from "@/contexts/AuthContext"
import { AD_KIND_META, AD_KINDS, type AdKind } from "@/constants/adTracking"
import { canImportLeads } from "@/constants/adTrackingRoles"
import { AD_TRACKING_PAGE, listHref } from "./api"

type Tab = "overview" | AdKind | "imports"

/**
 * The tabs at the top of every Ad Tracking page. The sidebar has the same
 * links, but it is hidden on a phone, and this keeps the four levels one
 * tap apart while tracing a campaign down to its ads.
 */
export default function AdTrackingTabs({ active }: { active: Tab }) {
    const { user } = useAuth()

    const tabs: Array<{ key: Tab; label: string; href: string }> = [
        { key: "overview", label: "Overview", href: AD_TRACKING_PAGE },
        ...AD_KINDS.map((k) => ({ key: k as Tab, label: AD_KIND_META[k].plural, href: listHref(k) })),
        ...(canImportLeads(user?.role) ? [{ key: "imports" as Tab, label: "Imports", href: `${AD_TRACKING_PAGE}/imports` }] : []),
    ]

    return (
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Ad tracking">
            {tabs.map((t) => (
                <Link
                    key={t.key}
                    href={t.href}
                    aria-current={t.key === active ? "page" : undefined}
                    className={clsx(
                        "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition",
                        t.key === active
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                    )}
                >
                    {t.label}
                </Link>
            ))}
        </nav>
    )
}
