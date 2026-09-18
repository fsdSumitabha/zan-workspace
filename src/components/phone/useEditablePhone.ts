"use client"

import { useEffect, useState } from "react"
import { useRegion } from "@/contexts/RegionContext"
import { toE164, validatePhone } from "@/lib/phone"

// Phone state for a create or edit form.
//
// `savedPhone` is the value in the database. It may be an old format such
// as "9876543210" or even "N/A". If the user does not change the number,
// check() returns `savedPhone` exactly, so the server sees no change and
// editing other fields never fails on an old value. If the user changes the
// number, check() validates it and returns E.164.
export function useEditablePhone(savedPhone: string = "") {
    const { phoneCountry } = useRegion()
    const savedE164 = toE164(savedPhone, phoneCountry) ?? undefined

    const [phone, setPhone] = useState<string | undefined>(savedE164)
    const [error, setError] = useState("")

    // The saved value arrives after the edit page loads it.
    useEffect(() => {
        setPhone(savedE164)
        setError("")
    }, [savedE164, savedPhone])

    const unchanged = !!savedPhone && phone === savedE164

    function onChange(value: string | undefined) {
        setPhone(value)
        if (error) setError("")
    }

    // Returns the value to send, or null and shows the error.
    function check(): string | null {
        if (unchanged) return savedPhone
        const result = validatePhone(phone, phoneCountry)
        if (!result.ok) {
            setError(result.message)
            return null
        }
        return result.e164
    }

    function onBlur() {
        if (phone) check()
    }

    return {
        value: phone,
        onChange,
        onBlur,
        check,
        error,
        setError,
        // Set when the saved value is not a valid number and the field is empty.
        savedInvalid: savedPhone && !savedE164 && !phone ? savedPhone : "",
    }
}
