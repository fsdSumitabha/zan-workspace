"use client"

import clsx from "clsx"
import { Phone } from "lucide-react"
import { useRegion } from "@/contexts/RegionContext"
import { startCall } from "./dialer"

/** The call button. Not connected to a dialer yet. See dialer.ts. */
export default function CallButton({
    name,
    phone,
    size = "sm",
}: {
    name: string
    phone: string
    size?: "sm" | "md"
}) {
    const { phoneCountry } = useRegion()

    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                startCall({ name, phone }, phoneCountry)
            }}
            aria-label={`Call ${name}`}
            title="Call"
            className={clsx(
                "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-emerald-600 font-medium text-white shadow-sm transition hover:bg-emerald-500",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1",
                size === "sm" ? "h-8 w-8" : "h-9 px-4 text-sm"
            )}
        >
            <Phone className={size === "sm" ? "h-4 w-4" : "h-4 w-4"} />
            {size === "md" && "Call"}
        </button>
    )
}
