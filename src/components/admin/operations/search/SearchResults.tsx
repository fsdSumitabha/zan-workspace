"use client"

import { Inbox, Loader2 } from "lucide-react"

import SearchResultRow from "./SearchResultRow"
import type { SearchData, SearchEntity, SearchHit } from "./types"

interface Props {
    query: string
    data: SearchData | null
    loading: boolean
    error: string | null
    activeIndex: number
    onHover: (index: number) => void
    onSelect: (hit: SearchHit) => void
}

interface Section {
    label: string
    type: SearchEntity
    hits: SearchHit[]
}

export default function SearchResults({
    query,
    data,
    loading,
    error,
    activeIndex,
    onHover,
    onSelect,
}: Props) {
    const sections: Section[] = data
        ? (
              [
                  { label: "Leads", type: "LEAD", hits: data.leads },
                  { label: "Clients", type: "CLIENT", hits: data.clients },
                  { label: "Projects", type: "PROJECT", hits: data.projects },
                  { label: "Meetings", type: "MEETING", hits: data.meetings },
                //   { label: "Users", type: "USER", hits: data.users },
              ] as Section[]
          ).filter((s) => s.hits.length > 0)
        : []

    // Flat index for keyboard nav. Each row gets a sequential number.
    let flatCursor = 0

    return (
        <div className="absolute top-full left-0 right-0 mt-2 z-40 rounded-lg dark:rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl shadow-black/5 max-h-[70vh] overflow-y-auto">
            {loading && (!data || data.total === 0) ? (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-neutral-500 dark:text-neutral-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching…
                </div>
            ) : error ? (
                <div className="px-3 py-4 text-sm text-red-600 dark:text-red-300">
                    {error}
                </div>
            ) : !data || data.total === 0 ? (
                <div className="px-3 py-6 text-center">
                    <Inbox className="w-6 h-6 mx-auto text-neutral-400 mb-1" />
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        No results for &ldquo;{query}&rdquo;
                    </p>
                </div>
            ) : (
                <div className="py-1">
                    {sections.map((section) => (
                        <div key={section.type} className="py-1">
                            <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                                {section.label}
                            </div>
                            {section.hits.map((hit) => {
                                const idx = flatCursor++
                                return (
                                    <SearchResultRow
                                        key={`${hit.type}-${hit.id}`}
                                        hit={hit}
                                        active={idx === activeIndex}
                                        onHover={() => onHover(idx)}
                                        onSelect={onSelect}
                                    />
                                )
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
