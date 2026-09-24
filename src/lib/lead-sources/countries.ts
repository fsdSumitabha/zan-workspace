import { isSupportedCountry, type CountryCode } from "libphonenumber-js"

/**
 * Country names seen in bought lists, mapped to the two-letter code the phone
 * library needs.
 *
 * A two-letter code in the sheet is used as it is, when the phone library
 * knows it. This list is only for names and for common short forms that are
 * not real codes, such as "UK" (the code is GB) and "USA".
 *
 * Keys are lower case, with dots removed and spaces collapsed. Add a country
 * here if its rows keep failing with "not a valid number" although the
 * numbers look right.
 */
const COUNTRY_NAMES: Record<string, CountryCode> = {
    "united states": "US",
    "united states of america": "US",
    "usa": "US",
    "us": "US",
    "america": "US",
    "india": "IN",
    "bharat": "IN",
    "united arab emirates": "AE",
    "uae": "AE",
    "emirates": "AE",
    "dubai": "AE",
    "abu dhabi": "AE",
    "united kingdom": "GB",
    "uk": "GB",
    "great britain": "GB",
    "britain": "GB",
    "england": "GB",
    "scotland": "GB",
    "wales": "GB",
    "canada": "CA",
    "australia": "AU",
    "new zealand": "NZ",
    "singapore": "SG",
    "ireland": "IE",
    "germany": "DE",
    "france": "FR",
    "spain": "ES",
    "italy": "IT",
    "netherlands": "NL",
    "the netherlands": "NL",
    "switzerland": "CH",
    "sweden": "SE",
    "saudi arabia": "SA",
    "ksa": "SA",
    "qatar": "QA",
    "kuwait": "KW",
    "oman": "OM",
    "bahrain": "BH",
    "pakistan": "PK",
    "bangladesh": "BD",
    "sri lanka": "LK",
    "nepal": "NP",
    "south africa": "ZA",
    "nigeria": "NG",
    "kenya": "KE",
    "philippines": "PH",
    "malaysia": "MY",
    "indonesia": "ID",
    "hong kong": "HK",
    "china": "CN",
    "japan": "JP",
    "mexico": "MX",
    "brazil": "BR",
}

/** The country of a sheet cell as a phone country code, or null if unknown. */
export function resolveCountryCode(raw: string | null | undefined): CountryCode | null {
    const text = (raw ?? "").trim()
    if (!text) return null

    const key = text.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim()
    if (COUNTRY_NAMES[key]) return COUNTRY_NAMES[key]

    const upper = key.toUpperCase()
    if (upper.length === 2 && isSupportedCountry(upper)) return upper as CountryCode

    return null
}
