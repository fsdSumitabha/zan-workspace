"use client"

import { useRegion } from "@/contexts/RegionContext"
import { formatPhoneForDisplay, toE164 } from "@/lib/phone"

// Shows a saved phone number. A valid number is formatted, for example
// "+1 415 555 0123", and can link to tel:. An invalid old value is shown
// as saved, in a muted colour, and is never a link.

interface PhoneTextProps {
    phone?: string | null
    link?: boolean
    className?: string
}

export default function PhoneText({ phone, link = false, className = "" }: PhoneTextProps) {
    const { phoneCountry } = useRegion()
    if (!phone?.trim()) return null

    const e164 = toE164(phone, phoneCountry)
    const text = formatPhoneForDisplay(phone, phoneCountry)

    if (!e164) {
        return (
            <span
                title="This is not a valid phone number"
                className={`break-all text-neutral-400 dark:text-neutral-500 ${className}`}
            >
                {text}
            </span>
        )
    }

    if (link) {
        return (
            <a href={`tel:${e164}`} className={`break-all hover:underline ${className}`}>
                {text}
            </a>
        )
    }

    return <span className={`break-all ${className}`}>{text}</span>
}
