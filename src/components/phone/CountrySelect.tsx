"use client"

import type { ComponentType, FocusEventHandler } from "react"
import { getCountryCallingCode, type CountryCode } from "libphonenumber-js"

// Country picker for <PhoneField>. It replaces the library's default picker
// and keeps its markup and CSS classes, with two changes:
//
// 1. The list uses two <optgroup> headings, "Suggested" and "All countries".
//    The library draws the split as a disabled <option> with a black
//    background. A browser gives that row the full height of a normal row,
//    so it shows as a thick black bar.
// 2. The calling code, for example "+1", shows next to the flag. The user
//    sees that the code is already set and does not type it again.

interface CountryOption {
    value?: string
    label: string
    divider?: boolean
}

interface CountrySelectProps {
    value?: string
    onChange: (value?: string) => void
    options: CountryOption[]
    iconComponent: ComponentType<{ country?: string; label: string; "aria-hidden"?: boolean }>
    name?: string
    "aria-label"?: string
    onFocus?: FocusEventHandler<HTMLSelectElement>
    onBlur?: FocusEventHandler<HTMLSelectElement>
    disabled?: boolean
    readOnly?: boolean
}

// "ZZ" is the library's value for "no country". HTML needs a string value.
const NO_COUNTRY = "ZZ"

function renderOptions(options: CountryOption[]) {
    return options.map((option) => (
        <option key={option.value || NO_COUNTRY} value={option.value || NO_COUNTRY}>
            {option.label}
        </option>
    ))
}

function callingCode(country: string | undefined): string {
    if (!country) return ""
    try {
        return `+${getCountryCallingCode(country as CountryCode)}`
    } catch {
        return ""
    }
}

export default function CountrySelect({
    value,
    onChange,
    options,
    iconComponent: Icon,
    name,
    "aria-label": ariaLabel,
    onFocus,
    onBlur,
    disabled,
    readOnly,
}: CountrySelectProps) {
    const dividerAt = options.findIndex((option) => option.divider)
    const suggested = dividerAt === -1 ? [] : options.slice(0, dividerAt)
    const rest = (dividerAt === -1 ? options : options.slice(dividerAt + 1))
        .filter((option) => !option.divider)

    const selected = options.find((option) => !option.divider && option.value === value)
    const code = callingCode(value)

    return (
        <div className="PhoneInputCountry">
            <select
                name={name}
                aria-label={ariaLabel}
                className="PhoneInputCountrySelect"
                value={value || NO_COUNTRY}
                onChange={(e) => onChange(e.target.value === NO_COUNTRY ? undefined : e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
                // A <select> ignores readOnly, so read-only works as disabled.
                disabled={disabled || readOnly}
            >
                {suggested.length > 0 ? (
                    <>
                        <optgroup label="Suggested">{renderOptions(suggested)}</optgroup>
                        <optgroup label="All countries">{renderOptions(rest)}</optgroup>
                    </>
                ) : (
                    renderOptions(rest)
                )}
            </select>
            {selected && <Icon aria-hidden country={value} label={selected.label} />}
            {code && (
                <span className="PhoneInputCallingCode" aria-hidden>
                    {code}
                </span>
            )}
            <div className="PhoneInputCountrySelectArrow" />
        </div>
    )
}
