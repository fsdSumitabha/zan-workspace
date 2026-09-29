"use client"

import { toast } from "sonner"
import type { CountryCode } from "libphonenumber-js"
import { formatPhoneForDisplay } from "@/lib/phone"

/**
 * Starts a call to a lead source.
 *
 * Calling is not connected yet. For now this shows the number, with a button
 * to copy it. Every call button in the lead source pages goes through this
 * one function, so a real dialer (for example a Twilio call) only has to be
 * added here.
 */
export function startCall(
    source: { name: string; phone: string },
    phoneCountry: CountryCode
): void {
    const shown = formatPhoneForDisplay(source.phone, phoneCountry)

    toast.info(`Call ${source.name}`, {
        id: "lead-source-call",
        description: `${shown}. Calling from the CRM is not set up yet. Dial this number on your phone.`,
        action: {
            label: "Copy number",
            onClick: () => {
                navigator.clipboard
                    ?.writeText(source.phone)
                    .then(() => toast.success("Number copied"))
                    .catch(() => toast.error("Could not copy the number"))
            },
        },
    })
}
