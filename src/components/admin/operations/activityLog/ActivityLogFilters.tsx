"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { EntityType, ENTITY_TYPE_META } from "@/constants/entityTypes"
import { EMPTY_FILTERS, type ActivityLogFilterState } from "./types"

// Build the dropdown options once at module load. Object.entries gives
// us string keys; coerce back to number so the option value matches the
// filter state shape.
const ENTITY_TYPE_OPTIONS: Array<{ value: EntityType; label: string }> =
    Object.entries(ENTITY_TYPE_META).map(([k, v]) => ({
        value: Number(k) as EntityType,
        label: v.label,
    }))

interface UserOption {
    _id: string
    name?: string
    email?: string
}

interface UsersApiResponse {
    success: boolean
    data?: UserOption[]
    message?: string
}

interface Props {
    value: ActivityLogFilterState
    onChange: (next: ActivityLogFilterState) => void
    isAdmin: boolean
}

const SELECT_BASE =
    "w-full sm:w-auto px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"

const INPUT_BASE = SELECT_BASE

export default function ActivityLogFilters({
    value,
    onChange,
    isAdmin,
}: Props) {
    const [users, setUsers] = useState<UserOption[]>([])
    const [usersLoading, setUsersLoading] = useState(false)


    useEffect(() => {
        if (!isAdmin) return
        let cancelled = false

        const loadUsers = async () => {
            setUsersLoading(true)
            try {
                const res = await fetch(
                    "/api/admin/operations/users?limit=100",
                    { credentials: "include", cache: "no-store" }
                )
                const json: UsersApiResponse = await res.json()
                if (!cancelled && res.ok && json.success && json.data) {
                    setUsers(json.data)
                }
            } catch {
                // silent — picker becomes empty, search bar still works
            } finally {
                if (!cancelled) setUsersLoading(false)
            }
        }

        loadUsers()
        return () => {
            cancelled = true
        }
    }, [isAdmin])

    // Note: previously this component fetched a `meta` endpoint that
    // returned entity-type strings to populate the dropdown. With
    // entityType now numeric, that endpoint's payload no longer
    // matches — we drive the dropdown straight from ENTITY_TYPE_META
    // instead (full set, no extra request needed).

    const hasActive = useMemo(() => {
        // Check entityType against "" explicitly — `0` (LEAD) is a valid
        // selected value and truthy-check would treat it as "no filter".
        return (
            value.entityType !== "" ||
            value.userId !== "" ||
            value.from !== "" ||
            value.to !== "" ||
            value.q !== ""
        )
    }, [value])

    const update = (patch: Partial<ActivityLogFilterState>) => {
        onChange({ ...value, ...patch })
    }

    return (
        <div className="rounded-lg dark:rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Entity type */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                        Entity
                    </label>
                    <select
                        className={SELECT_BASE}
                        value={value.entityType === "" ? "" : String(value.entityType)}
                        onChange={(e) => {
                            const v = e.target.value
                            update({
                                entityType: v === "" ? "" : (Number(v) as EntityType),
                            })
                        }}
                    >
                        <option value="">All entities</option>
                        {ENTITY_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* From date */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                        From
                    </label>
                    <input
                        type="date"
                        className={INPUT_BASE}
                        value={value.from}
                        max={value.to || undefined}
                        onChange={(e) => update({ from: e.target.value })}
                    />
                </div>

                {/* To date */}
                <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                        To
                    </label>
                    <input
                        type="date"
                        className={INPUT_BASE}
                        value={value.to}
                        min={value.from || undefined}
                        onChange={(e) => update({ to: e.target.value })}
                    />
                </div>

                {/* User picker (admin only) */}
                {isAdmin && (
                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                            User
                        </label>
                        <select
                            className={SELECT_BASE}
                            value={value.userId}
                            onChange={(e) =>
                                update({ userId: e.target.value })
                            }
                            disabled={usersLoading}
                        >
                            <option value="">All users</option>
                            {users.map((u) => (
                                <option key={u._id} value={u._id}>
                                    {u.name || u.email || u._id}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Search row */}
            {isAdmin && (
                <div className="mt-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                        <input
                            type="text"
                            className={`${INPUT_BASE} pl-9`}
                            placeholder="Search by user name…"
                            value={value.q}
                            onChange={(e) => update({ q: e.target.value })}
                            disabled={!!value.userId}
                            title={
                                value.userId
                                    ? "Clear the User filter to search by name"
                                    : undefined
                            }
                        />
                    </div>

                    {hasActive && (
                        <button
                            type="button"
                            onClick={() => onChange({ ...EMPTY_FILTERS })}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                        >
                            <X className="w-4 h-4" />
                            Reset
                        </button>
                    )}
                </div>
            )}

            {!isAdmin && hasActive && (
                <div className="mt-3 flex justify-end">
                    <button
                        type="button"
                        onClick={() => onChange({ ...EMPTY_FILTERS })}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                    >
                        <X className="w-4 h-4" />
                        Reset
                    </button>
                </div>
            )}
        </div>
    )
}
