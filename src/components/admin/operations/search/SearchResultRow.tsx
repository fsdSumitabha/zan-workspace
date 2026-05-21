"use client"

import { Building2, Calendar, Folder, User, UserCog } from "lucide-react"

import type { SearchEntity, SearchHit } from "./types"

const ICON: Record<SearchEntity, typeof User> = {
    LEAD: User,
    CLIENT: Building2,
    PROJECT: Folder,
    MEETING: Calendar,
    USER: UserCog,
}

const ICON_COLOR: Record<SearchEntity, string> = {
    LEAD: "text-blue-500 bg-blue-500/10",
    CLIENT: "text-emerald-500 bg-emerald-500/10",
    PROJECT: "text-purple-500 bg-purple-500/10",
    MEETING: "text-cyan-500 bg-cyan-500/10",
    USER: "text-indigo-500 bg-indigo-500/10",
}

interface Props {
    hit: SearchHit
    active?: boolean
    onSelect: (hit: SearchHit) => void
    onHover?: () => void
}

export default function SearchResultRow({
    hit,
    active,
    onSelect,
    onHover,
}: Props) {
    const Icon = ICON[hit.type]

    return (
        <button
            type="button"
            onMouseDown={(e) => {
                // Prevent blur on input before navigation can run.
                e.preventDefault()
                onSelect(hit)
            }}
            onMouseEnter={onHover}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 transition ${
                active
                    ? "bg-neutral-100 dark:bg-neutral-800"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
            }`}
        >
            <span
                className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center ${ICON_COLOR[hit.type]}`}
            >
                <Icon className="w-3.5 h-3.5" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                    {hit.title}
                </span>
                {hit.subtitle && (
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        {hit.subtitle}
                    </span>
                )}
            </span>
        </button>
    )
}
