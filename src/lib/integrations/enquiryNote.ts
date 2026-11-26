import type { Types } from "mongoose"
import type { CountryCode } from "libphonenumber-js"
import { formatPhoneForDisplay } from "@/lib/phone"
import { REGIONS, type RegionCode } from "@/lib/region"
import { formLabel, type LeadBody } from "./contract"
import type { IntegrationSite } from "./sites"

/**
 * The text of the note a website enquiry adds to its lead. Plain lines,
 * which the lead's timeline shows as written. No database here, so it can
 * be tested on its own.
 */

/** A lead the enquiry is added to. */
export interface KnownLead {
    _id: Types.ObjectId
    name: string
    email?: string
    phone?: string
    region?: RegionCode
    deletedAt?: Date | null
}

/** The enquiry's phone, as receiveLead read it. */
export interface ReadPhone {
    /** What is saved and matched on: E.164 when valid, else as typed. */
    value: string
    valid: boolean
}

export interface NoteFacts {
    phone: ReadPhone
    country: CountryCode
    /** The lead the enquiry was added to. Null for a new lead. */
    existing: KnownLead | null
    /** How the existing lead was found. */
    matchedBy?: "phone" | "email"
    /** Set when the existing lead is in another region than the website sent. */
    sentForRegion?: RegionCode
    /** The existing lead had been deleted, and this enquiry restored it. */
    restored?: boolean
}

export function enquiryNote(site: IntegrationSite, body: LeadBody, facts: NoteFacts): { title: string; description: string } {
    const lines: string[] = [`Form: ${formLabel(body.form)}`]
    if (body.page) lines.push(`Page: ${body.page}`)

    if (facts.sentForRegion) {
        lines.push(
            `Region: sent from the ${REGIONS[facts.sentForRegion].label} site. ` +
            "This lead already has the same phone number, so the enquiry is here."
        )
    }
    if (facts.restored) lines.push("This lead had been deleted. This enquiry brought it back.")

    const existing = facts.existing
    if (existing) {
        // Contact details that differ from the lead's own, so a colleague or
        // a new address is not lost.
        if (body.name.toLowerCase() !== existing.name.toLowerCase()) lines.push(`Name: ${body.name}`)
        if (body.email && body.email !== existing.email?.toLowerCase()) lines.push(`Email: ${body.email}`)
        if (facts.matchedBy === "email" && facts.phone.value !== existing.phone) {
            const shown = formatPhoneForDisplay(facts.phone.value, facts.country)
            lines.push(`Phone: ${shown}${facts.phone.valid ? "" : " (not a valid number)"}`)
        }
    } else if (!facts.phone.valid) {
        lines.push(`Phone: ${facts.phone.value} (not a valid number, saved as typed)`)
    }

    if (body.service) lines.push(`Service: ${body.service}`)
    if (body.interest) lines.push(`Package: ${body.interest}`)

    const chat = body.chat
    if (chat) {
        if (chat.leadScore) lines.push(`Lead score: ${chat.leadScore}`)
        if (chat.service) lines.push(`Service: ${chat.service}`)
        if (chat.projectType) lines.push(`Project type: ${chat.projectType}`)
        if (chat.budget) lines.push(`Budget: ${chat.budget}`)
        if (chat.timeline) lines.push(`Timeline: ${chat.timeline}`)
        if (chat.requirements.length) lines.push(`Requirements: ${chat.requirements.join(", ")}`)
        if (chat.technology.length) lines.push(`Technology: ${chat.technology.join(", ")}`)
        lines.push(`Conversation: ${chat.conversationId}`)
        if (chat.summary) lines.push("", "Summary:", chat.summary)
    }

    if (body.message) lines.push("", "Message:", body.message)

    return { title: `Enquiry from ${site.domain}`, description: lines.join("\n") }
}
