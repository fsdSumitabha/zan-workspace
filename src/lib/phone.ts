// Phone parsing, validation and display, built on libphonenumber-js.
//
// New numbers are saved in E.164 format, for example "+14155550123".
// Old rows may hold any text. Those rows are read with the region's country
// as the default, so "9876543210" in an India database reads as +91.
//
// Every function takes the default country as an argument. Client code gets
// it from useRegion(). Server code gets it from getRegion().
// This file has no server-only imports and is safe on the client.

import {
    AsYouType,
    getCountryCallingCode,
    getExampleNumber,
    parsePhoneNumberFromString,
    validatePhoneNumberLength,
    type CountryCode,
    type PhoneNumber,
} from "libphonenumber-js"
import examples from "libphonenumber-js/mobile/examples"

// Zero-width and text-direction marks. Contacts apps add these when you
// copy a number. They are invisible and break parsing.
const HIDDEN_MARKS = /[​-‏‪-‮⁦-⁩﻿]/g

export const PHONE_MESSAGES = {
    REQUIRED: "Phone number is required.",
    NOT_A_NUMBER: "Enter only one phone number, using digits.",
    TOO_SHORT: "This number is too short. Check the digits and the country.",
    TOO_LONG: "This number is too long. Check the digits and the country.",
    HAS_EXTENSION: "Remove the extension. Enter the main number only.",
    INVALID: "This is not a valid number for the selected country.",
} as const

export type PhoneErrorCode = keyof typeof PHONE_MESSAGES

export type PhoneCheck =
    | { ok: true; e164: string }
    | { ok: false; code: PhoneErrorCode; message: string }

function fail(code: PhoneErrorCode): PhoneCheck {
    return { ok: false, code, message: PHONE_MESSAGES[code] }
}

function clean(input: string): string {
    // "00" is the international dialling prefix in IN and AE.
    // No national number starts with it, so it is safe to read as "+".
    return input.replace(HIDDEN_MARKS, "").trim().replace(/^00/, "+")
}

function parse(input: unknown, defaultCountry: CountryCode): PhoneNumber | undefined {
    if (typeof input !== "string") return undefined
    const cleaned = clean(input)
    if (!cleaned) return undefined
    // extract: false rejects text around the number, such as
    // "Call after 6pm: 415 555 0146" or two numbers in one field.
    return parsePhoneNumberFromString(cleaned, { defaultCountry, extract: false })
}

/**
 * Checks a phone number typed by a person or sent by an API.
 * On success it returns the number in E.164 format.
 */
export function validatePhone(input: unknown, defaultCountry: CountryCode): PhoneCheck {
    const cleaned = typeof input === "string" ? clean(input) : ""
    if (!cleaned) return fail("REQUIRED")
    // A formatted number with an extension fits in 40 characters.
    if (cleaned.length > 40) return fail("TOO_LONG")

    const phone = parse(cleaned, defaultCountry)
    if (phone?.ext) return fail("HAS_EXTENSION")
    if (phone?.isValid()) return { ok: true, e164: phone.number }

    const lengthError = validatePhoneNumberLength(cleaned, defaultCountry)
    if (lengthError === "TOO_SHORT") return fail("TOO_SHORT")
    if (lengthError === "TOO_LONG") return fail("TOO_LONG")
    // Digits with normal punctuation, such as "0000000000", are a wrong
    // number. Anything else, such as letters or two numbers, is not a number.
    if (phone || /^\+?[\d\s().-]*\d[\d\s().-]*$/.test(cleaned)) return fail("INVALID")
    return fail("NOT_A_NUMBER")
}

/** A saved value as E.164, or null when it is not a valid number. */
export function toE164(stored: unknown, defaultCountry: CountryCode): string | null {
    const phone = parse(stored, defaultCountry)
    return phone && !phone.ext && phone.isValid() ? phone.number : null
}

/**
 * A saved value formatted for reading, for example "+1 415 555 0123".
 * An invalid old value is returned as it was saved.
 */
export function formatPhoneForDisplay(stored: unknown, defaultCountry: CountryCode): string {
    const phone = parse(stored, defaultCountry)
    if (phone?.isValid()) return phone.formatInternational()
    return typeof stored === "string" ? stored.trim() : ""
}

/** Digits for wa.me and whatsapp:// links, or null when the number is invalid. */
export function toWhatsAppNumber(stored: unknown, defaultCountry: CountryCode): string | null {
    const e164 = toE164(stored, defaultCountry)
    return e164 ? e164.slice(1) : null
}

/**
 * Values an existing row may hold for the same number. Old rows were saved
 * as typed, so "+919876543210" may be stored as "919876543210",
 * "9876543210" or "09876543210". Use this with $in for duplicate checks.
 * Numbers with spaces or dashes are not covered.
 */
export function phoneLookupValues(e164: string, defaultCountry: CountryCode): string[] {
    const values = [e164, e164.slice(1)]
    const phone = parsePhoneNumberFromString(e164)
    // Numbers without a country code were saved in the region's country,
    // so only match them for that country.
    if (phone && phone.countryCallingCode === getCountryCallingCode(defaultCountry)) {
        values.push(phone.nationalNumber, `0${phone.nationalNumber}`)
    }
    return values
}

/**
 * An example number for a placeholder, in the format the input shows while
 * typing. For example "(201) 555-0123" for US and "81234 56789" for IN.
 * Some countries, such as AE, only format a number typed with its leading
 * "0", so their example includes it: "050 123 4567".
 */
export function getPhonePlaceholder(country: CountryCode | undefined): string {
    if (!country) return "+1 201 555 0123"
    const example = getExampleNumber(country, examples)
    if (!example) return ""
    const typed = new AsYouType(country).input(example.nationalNumber)
    return /\D/.test(typed) ? typed : example.formatNational()
}
