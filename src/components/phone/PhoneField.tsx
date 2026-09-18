"use client"

import type { ClipboardEvent, KeyboardEvent, RefObject } from "react"
import PhoneInput, { type Country } from "react-phone-number-input"
import type { CountryCode } from "libphonenumber-js"
import "react-phone-number-input/style.css"
import { useRegion } from "@/contexts/RegionContext"
import { REGION_CODES } from "@/lib/region"
import { PHONE_MESSAGES, checkPastedPhone, getPhonePlaceholder } from "@/lib/phone"
import CountrySelect from "./CountrySelect"

// Phone input with a country picker. Use it with useEditablePhone():
// <PhoneField {...phone.fieldProps} />.
//
// The country code comes only from the picker. The picker shows it, for
// example "+1", and the box takes the local number only.
// - international={false}: the box always shows the local format. A "+"
//   and the code after it cannot be typed.
// - The "+" key is blocked with a message, so the user knows why.
// - Pasted text is checked before the box changes it. The box drops
//   letters, so "Call after 6pm: 415 555 0146" would turn into a different
//   number. A pasted full number for the picked country, "+1 415 555 0123",
//   is put in as the local number. A number for another country is refused.
// - No limitMaxLength: it cut extra digits without a word. An extra digit
//   now stays in the box, and the check says "too long".
// - addInternationalOption={false}: a country is always picked.
// - initialValueFormat="national": a saved number shows as "(415) 555-0123".
// - countrySelectComponent: our picker, with "+1" and grouped countries.

interface PhoneFieldProps {
    id?: string
    name?: string
    value: string | undefined
    onChange: (value: string | undefined) => void
    onBlur?: () => void
    onCountryChange: (country: CountryCode | undefined) => void
    // Shows a message under the box, such as for a blocked paste.
    onInputError: (message: string) => void
    country: CountryCode
    inputRef: RefObject<HTMLInputElement | null>
    hasError?: boolean
    required?: boolean
    disabled?: boolean
    // Classes for the outer box. The inner <input> is transparent.
    className?: string
}

const COUNTRY_ORDER = [...REGION_CODES, "|", "..."] as const

export default function PhoneField({
    id,
    name,
    value,
    onChange,
    onBlur,
    onCountryChange,
    onInputError,
    country,
    inputRef,
    hasError = false,
    required,
    disabled,
    className = "",
}: PhoneFieldProps) {
    const { phoneCountry } = useRegion()

    function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "+") {
            e.preventDefault()
            onInputError(PHONE_MESSAGES.HAS_COUNTRY_CODE)
        }
    }

    function onPaste(e: ClipboardEvent<HTMLInputElement>) {
        const result = checkPastedPhone(e.clipboardData.getData("text"), country)
        if (result.action === "allow") return
        e.preventDefault()
        if (result.action === "replace") onChange(result.e164)
        else onInputError(result.message)
    }

    return (
        <PhoneInput
            // At runtime the library passes `ref` to the <input> element
            // (PhoneInputWithCountry.js: `inputRef: ref`). Its .d.ts types the
            // ref as the class component, so the cast is needed.
            ref={inputRef as never}
            id={id}
            name={name}
            value={value || undefined}
            onChange={(v) => onChange(v || undefined)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onCountryChange={(c) => onCountryChange(c as CountryCode | undefined)}
            defaultCountry={phoneCountry}
            international={false}
            initialValueFormat="national"
            countryOptionsOrder={COUNTRY_ORDER as unknown as Country[]}
            countrySelectComponent={CountrySelect}
            addInternationalOption={false}
            placeholder={getPhonePlaceholder(country)}
            autoComplete="tel-national"
            required={required}
            disabled={disabled}
            aria-invalid={hasError || undefined}
            className={`phone-field ${className}`}
        />
    )
}
