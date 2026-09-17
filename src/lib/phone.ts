// Region-aware phone handling.
//
// NEXT_PUBLIC_REGION is optional. Only the exact value "US"
// (case-insensitive) switches to US behaviour. Anything else, including
// unset, keeps the original India behaviour so existing data is untouched.
//
// NEXT_PUBLIC_ vars are inlined at build time, so changing the value needs
// a rebuild. This file has no server-only imports and is safe on the client.

export type PhoneRegion = "IN" | "US"

export function getPhoneRegion(): PhoneRegion {
    const raw = process.env.NEXT_PUBLIC_REGION
    return raw?.trim().toUpperCase() === "US" ? "US" : "IN"
}

// Value to store in the database.
// IN: returned exactly as given (same as before this helper existed).
// US: "+..." input is kept (spaces/dashes removed). A 10-digit number gets
// "+1". An 11-digit number starting with 1 gets "+". Anything else is kept
// as typed, so we never guess.
export function normalizePhoneForStorage(input: string): string {
    // Non-string values (null from FormData, numbers from JSON) pass through
    // untouched, exactly as the routes handled them before.
    if (getPhoneRegion() !== "US" || typeof input !== "string") return input

    const trimmed = input.trim()
    const digits = trimmed.replace(/\D/g, "")

    if (trimmed.startsWith("+")) return digits ? `+${digits}` : trimmed
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
    return trimmed
}

// Digits-only number for wa.me / whatsapp:// links.
// A number that already starts with "+" is used as is.
// Otherwise a 10-digit number gets the region's country code.
export function toWhatsAppNumber(phone: string): string {
    const digits = phone.replace(/\D/g, "")
    if (phone.trim().startsWith("+")) return digits
    if (digits.length === 10) {
        return (getPhoneRegion() === "US" ? "1" : "91") + digits
    }
    return digits
}

export function getPhonePlaceholder(): string {
    return getPhoneRegion() === "US" ? "+1 (415) 555-0123" : "+91 98765 43210"
}
