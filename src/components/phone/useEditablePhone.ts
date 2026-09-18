"use client"

import { useEffect, useRef, useState } from "react"
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js"
import { useRegion } from "@/contexts/RegionContext"
import { toE164, validateLocalPhone } from "@/lib/phone"

// Phone state for a create or edit form. Spread `phone.fieldProps` on
// <PhoneField>.
//
// `savedPhone` is the value in the database. It may be an old format such
// as "9876543210" or even "N/A". If the user does not change the number,
// check() returns `savedPhone` exactly, so the server sees no change and
// editing other fields never fails on an old value. If the user changes the
// number, check() validates it and returns E.164.
//
// check() reads the text shown in the box, with the country from the
// picker. It does not trust the library's value: the library turns some
// typed text into a different number, such as "011 44 …" into a US number.
export function useEditablePhone(savedPhone: string = "") {
    const { phoneCountry } = useRegion()
    const savedE164 = toE164(savedPhone, phoneCountry) ?? undefined
    const savedCountry =
        (savedE164 && parsePhoneNumberFromString(savedE164)?.country) || phoneCountry

    const [phone, setPhone] = useState<string | undefined>(savedE164)
    const [country, setCountry] = useState<CountryCode>(savedCountry)
    const [error, setError] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)

    // The saved value arrives after the edit page loads it.
    useEffect(() => {
        setPhone(savedE164)
        setError("")
    }, [savedE164, savedPhone])

    function onChange(value: string | undefined) {
        setPhone(value)
        if (error) setError("")
    }

    function onCountryChange(next: CountryCode | undefined) {
        setCountry(next ?? phoneCountry)
        if (error) setError("")
    }

    function showError(message: string, focus: boolean) {
        setError(message)
        if (focus && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.scrollIntoView({ block: "center", behavior: "smooth" })
        }
    }

    // Returns the value to send, or null and shows the error.
    // Pass focus: true on submit, so the user sees the error on a long form.
    function check({ focus = false }: { focus?: boolean } = {}): string | null {
        const typed = inputRef.current?.value ?? ""

        // An invalid old value stays until the user types a new number.
        if (savedPhone && !savedE164 && !typed.trim()) return savedPhone

        const result = validateLocalPhone(typed, country)
        if (!result.ok) {
            showError(result.message, focus)
            return null
        }
        // Same number as saved: send the saved text, so an old format stays.
        if (savedPhone && result.e164 === savedE164) return savedPhone
        return result.e164
    }

    function onBlur() {
        if (inputRef.current?.value.trim()) check()
    }

    function reset() {
        setPhone(savedE164)
        setError("")
    }

    return {
        check,
        error,
        setError,
        reset,
        // Set when the saved value is not a valid number and the field is empty.
        savedInvalid: savedPhone && !savedE164 && !phone ? savedPhone : "",
        fieldProps: {
            value: phone,
            onChange,
            onBlur,
            onCountryChange,
            onInputError: (message: string) => showError(message, false),
            country,
            inputRef,
            hasError: !!error,
        },
    }
}
