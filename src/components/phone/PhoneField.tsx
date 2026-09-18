"use client"

import { useState } from "react"
import PhoneInput, { type Country } from "react-phone-number-input"
import "react-phone-number-input/style.css"
import { useRegion } from "@/contexts/RegionContext"
import { REGION_CODES } from "@/lib/region"
import { getPhonePlaceholder } from "@/lib/phone"
import CountrySelect from "./CountrySelect"

// Phone input with a country picker. The value is always E.164
// ("+14155550123") or undefined.
//
// Library presets that remove most typing mistakes:
// - defaultCountry: the region's country is picked at the start.
// - limitMaxLength: no digits past the longest number for that country.
// - addInternationalOption={false}: a country is always picked, so the
//   number is always checked against that country's rules.
// - initialValueFormat="national": a saved number from the region's country
//   shows the same way as a typed one, "(415) 555-0123", not "+1 415 ...".
// - countrySelectComponent: our picker shows the calling code ("+1") next to
//   the flag, and groups the list as "Suggested" and "All countries".
// - Letters and symbols cannot be typed. Pasted text keeps only digits and
//   a leading "+". A pasted "+44 ..." switches the country by itself.

interface PhoneFieldProps {
    id?: string
    name?: string
    value: string | undefined
    onChange: (value: string | undefined) => void
    onBlur?: () => void
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
    hasError = false,
    required,
    disabled,
    className = "",
}: PhoneFieldProps) {
    const { phoneCountry } = useRegion()
    const [country, setCountry] = useState<Country | undefined>(phoneCountry)

    return (
        <PhoneInput
            id={id}
            name={name}
            value={value || undefined}
            onChange={(v) => onChange(v || undefined)}
            onBlur={onBlur}
            onCountryChange={setCountry}
            defaultCountry={phoneCountry}
            initialValueFormat="national"
            countryOptionsOrder={COUNTRY_ORDER as unknown as Country[]}
            countrySelectComponent={CountrySelect}
            addInternationalOption={false}
            limitMaxLength
            placeholder={getPhonePlaceholder(country)}
            autoComplete="tel"
            required={required}
            disabled={disabled}
            aria-invalid={hasError || undefined}
            className={`phone-field ${className}`}
        />
    )
}
