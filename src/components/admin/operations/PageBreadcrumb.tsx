"use client"

import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft, ChevronRight } from "lucide-react"

const OBJECT_ID = /^[a-f0-9]{24}$/i

function humanize(slug: string): string {
    if (OBJECT_ID.test(slug)) return "Detail"
    return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function PageBreadcrumb() {
    const router = useRouter()
    const pathname = usePathname()

    const segments = pathname.split("/").filter(Boolean)
    const visibleSegments = segments[0] === "admin" ? segments.slice(1) : segments
    const hasAdmin = segments[0] === "admin"

    const isRoot = visibleSegments.length <= 1

    const crumbs = visibleSegments.map((seg, i) => {
        const parts = hasAdmin ? ["admin", ...visibleSegments.slice(0, i + 1)] : visibleSegments.slice(0, i + 1)
        return { label: humanize(seg), href: "/" + parts.join("/"), isLast: i === visibleSegments.length - 1 }
    })

    return (
        <div className="w-full max-w-7xl mx-auto px-3 md:px-4 pt-3">
            <div className="flex items-center gap-3 flex-wrap">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                </button>

                {!isRoot && (
                    <nav className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 min-w-0 overflow-hidden">
                        {crumbs.map((c, i) => (
                            <span key={c.href} className="flex items-center gap-1.5 min-w-0">
                                {i > 0 && <ChevronRight className="w-3 h-3 text-neutral-400 shrink-0" />}
                                {c.isLast ? (
                                    <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                        {c.label}
                                    </span>
                                ) : (
                                    <Link
                                        href={c.href}
                                        className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate"
                                    >
                                        {c.label}
                                    </Link>
                                )}
                            </span>
                        ))}
                    </nav>
                )}
            </div>
        </div>
    )
}
