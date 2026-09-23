"use client"

import { useEffect, useRef, useState } from "react"
import clsx from "clsx"
import { Check, ChevronDown, Globe, Lock } from "lucide-react"
import { REGION_CODES, REGIONS, type RegionCode } from "@/lib/region"
import { canAdministerAllRegions } from "@/constants/userRoles"
import { useAuth } from "@/contexts/AuthContext"
import { RegionBadge } from "./RegionBadge"

interface Props {
    value: RegionCode[]
    onChange: (next: RegionCode[]) => void

    /** Regions the account already holds. Used when editing. */
    existing?: RegionCode[]

    disabled?: boolean

    /** Shown instead of the control. Used for "you cannot edit your own". */
    lockedReason?: string
}

/**
 * Picks which regions an account may see.
 *
 * Three rules, all enforced again on the server in
 * `src/lib/region-scope/regionGrant.ts`. This is the explanation, not the
 * guard:
 *
 * 1. You can only tick a region you hold yourself, unless your role
 *    administers users across regions. HR covers one region for leads but
 *    hires for all of them.
 *
 * 2. Regions the account already holds that you cannot grant are shown ticked
 *    and locked. Editing a colleague's name must not quietly strip their
 *    access to a region you cannot see.
 *
 * 3. At least one region. An account with none sees an empty app rather than
 *    an error, which is a confusing way to find out.
 */
export default function RegionSelect({
    value,
    onChange,
    existing = [],
    disabled = false,
    lockedReason,
}: Props) {
    const { regions: mine, role, loading } = useAuth()
    const [open, setOpen] = useState(false)
    const boxRef = useRef<HTMLDivElement>(null)

    // HR and admin hire for every region.
    const grantable: RegionCode[] =
        role !== null && canAdministerAllRegions(role) ? [...REGION_CODES] : mine

    /* ------------------------- close on outside / escape ------------------------ */

    useEffect(() => {
        if (!open) return

        const onPointer = (e: MouseEvent) => {
            if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false)
        }

        document.addEventListener("mousedown", onPointer)
        document.addEventListener("keydown", onKey)

        return () => {
            document.removeEventListener("mousedown", onPointer)
            document.removeEventListener("keydown", onKey)
        }
    }, [open])

    const toggle = (code: RegionCode) => {
        // Rebuild from REGION_CODES so the order never depends on click order.
        onChange(
            REGION_CODES.filter((r) =>
                r === code ? !value.includes(r) : value.includes(r)
            )
        )
    }

    /* --------------------------------- locked --------------------------------- */

    if (lockedReason) {
        return (
            <div>
                <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                    Regions
                </label>

                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-gray-50 border-gray-200 dark:bg-neutral-800/50 dark:border-neutral-700">
                    <Lock className="w-4 h-4 shrink-0 text-gray-400 dark:text-neutral-500" />
                    {value.length > 0 ? (
                        value.map((code) => <RegionBadge key={code} code={code} />)
                    ) : (
                        <span className="text-sm text-gray-500 dark:text-neutral-400">
                            None
                        </span>
                    )}
                </div>

                <p className="text-xs mt-1.5 text-gray-500 dark:text-neutral-400">
                    {lockedReason}
                </p>
            </div>
        )
    }

    /* -------------------------------- dropdown -------------------------------- */

    const isDisabled = disabled || loading
    const summary =
        value.length === REGION_CODES.length && value.length > 1
            ? "All regions"
            : null

    return (
        <div>
            <label className="block text-sm mb-1 text-gray-600 dark:text-gray-300">
                Regions *
            </label>

            <div ref={boxRef} className="relative">
                <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => setOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    className={clsx(
                        "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition",
                        "bg-white dark:bg-neutral-800",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        isDisabled
                            ? "opacity-50 cursor-not-allowed border-gray-200 dark:border-neutral-800"
                            : "border-gray-300 dark:border-neutral-700 hover:border-gray-400 dark:hover:border-neutral-600",
                        open && "border-blue-500 dark:border-blue-500"
                    )}
                >
                    <Globe className="w-4 h-4 shrink-0 text-gray-400 dark:text-neutral-500" />

                    <span className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0">
                        {value.length === 0 ? (
                            <span className="text-sm text-gray-400 dark:text-neutral-500">
                                Select regions
                            </span>
                        ) : summary ? (
                            <span className="text-sm text-gray-800 dark:text-gray-200">
                                {summary}
                            </span>
                        ) : (
                            value.map((code) => (
                                <RegionBadge key={code} code={code} />
                            ))
                        )}
                    </span>

                    <ChevronDown
                        className={clsx(
                            "w-4 h-4 shrink-0 text-gray-400 transition-transform dark:text-neutral-500",
                            open && "rotate-180"
                        )}
                    />
                </button>

                {open && (
                    <div
                        role="listbox"
                        aria-multiselectable
                        className={clsx(
                            "absolute z-50 mt-2 w-full p-1 rounded-xl shadow-lg ring-1 overflow-hidden",
                            "bg-white ring-black/5",
                            "dark:bg-neutral-900 dark:ring-white/10 dark:shadow-black/40"
                        )}
                    >
                        {REGION_CODES.map((code) => {
                            const canGrant = grantable.includes(code)
                            const lockedOn = !canGrant && existing.includes(code)
                            const checked = value.includes(code)
                            const rowDisabled = !canGrant && !lockedOn

                            return (
                                <button
                                    key={code}
                                    type="button"
                                    role="option"
                                    aria-selected={checked}
                                    disabled={rowDisabled || lockedOn}
                                    onClick={() => toggle(code)}
                                    title={
                                        lockedOn
                                            ? "This account already has this region. You cannot change it, because you cannot grant it."
                                            : rowDisabled
                                              ? "You cannot grant a region you do not have."
                                              : REGIONS[code].label
                                    }
                                    className={clsx(
                                        "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                                        rowDisabled || lockedOn
                                            ? "opacity-50 cursor-not-allowed"
                                            : "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                                        checked && !lockedOn &&
                                            "bg-blue-50 hover:bg-blue-50 dark:bg-blue-500/10 dark:hover:bg-blue-500/15"
                                    )}
                                >
                                    <span
                                        className={clsx(
                                            "w-4 h-4 shrink-0 rounded flex items-center justify-center border transition-colors",
                                            checked
                                                ? "bg-blue-600 border-blue-600 text-white dark:bg-blue-500 dark:border-blue-500"
                                                : "border-gray-300 dark:border-neutral-600"
                                        )}
                                    >
                                        {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                                    </span>

                                    <RegionBadge code={code} />

                                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                                        {REGIONS[code].label}
                                    </span>

                                    {lockedOn && (
                                        <Lock className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-neutral-500" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            <p className="text-xs mt-1.5 text-gray-500 dark:text-neutral-400">
                {value.length === 0
                    ? "Pick at least one. An account with no region sees an empty app."
                    : "This account can only see records from the regions above."}
            </p>

            {!loading && grantable.length === 1 && (
                <p className="text-xs mt-1 text-gray-500 dark:text-neutral-400">
                    You cover {REGIONS[grantable[0]].label} only, so that is the
                    one region you can grant.
                </p>
            )}
        </div>
    )
}
