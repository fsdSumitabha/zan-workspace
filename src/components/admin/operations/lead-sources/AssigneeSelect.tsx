"use client"

import { useEffect, useState } from "react"
import { USER_ROLE_META, type UserRole } from "@/constants/userRoles"
import type { LeadSourceAssignee } from "@/types/leadSource"
import { LEAD_SOURCES_API, send } from "./api"
import { FIELD } from "./Dialog"

/**
 * People who can take lead sources in all of `regions`. Empty `regions`
 * means any region in view. Managers only: pass `enabled: false` for anyone
 * else, and nothing is fetched.
 */
export function useAssignees(regions: string[], enabled = true) {
    const key = [...regions].sort().join(",")
    const [people, setPeople] = useState<LeadSourceAssignee[]>([])
    const [loading, setLoading] = useState(enabled)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!enabled) {
            setLoading(false)
            return
        }

        let cancelled = false
        setLoading(true)
        setError(null)

        send<LeadSourceAssignee[]>(`${LEAD_SOURCES_API}/assignees?regions=${encodeURIComponent(key)}`, "GET")
            .then((data) => {
                if (!cancelled) setPeople(data)
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load people")
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [key, enabled])

    return { people, loading, error }
}

export function roleLabel(role: number): string {
    return USER_ROLE_META[role as UserRole]?.label ?? "Unknown role"
}

/**
 * A plain select of people. Only people who hold every region in `regions`
 * are listed, the same rule the server applies.
 */
export default function AssigneeSelect({
    id,
    regions,
    value,
    onChange,
    noneLabel = "Nobody for now",
}: {
    id: string
    regions: string[]
    value: string
    onChange: (userId: string) => void
    noneLabel?: string
}) {
    const { people, loading, error } = useAssignees(regions)

    // Drop a choice that is no longer on the list, for example after the
    // region changed on the upload form.
    useEffect(() => {
        if (!loading && value && !people.some((p) => p._id === value)) onChange("")
    }, [loading, people, value, onChange])

    return (
        <div>
            <select
                id={id}
                value={value}
                disabled={loading}
                onChange={(e) => onChange(e.target.value)}
                className={FIELD}
            >
                <option value="">{loading ? "Loading people..." : noneLabel}</option>
                {people.map((p) => (
                    <option key={p._id} value={p._id}>
                        {p.name} ({roleLabel(p.role)})
                    </option>
                ))}
            </select>
            {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
            {!loading && !error && people.length === 0 && (
                <p className="mt-1 text-xs text-neutral-500">
                    Nobody with a lead source role covers {regions.join(" and ") || "this region"}.
                </p>
            )}
        </div>
    )
}
