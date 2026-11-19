import { Types } from "mongoose"
import type { IAudienceRules } from "@/models/EmailAudience"
import { EmailError } from "@/lib/email/http"
import { LEAD_STATUS } from "@/constants/leadStatus"
import { CLIENT_STATUS } from "@/constants/clientStatus"
import { splitPastedAddresses } from "./address"

/**
 * Builds audience rules from a request body, field by field.
 *
 * ## Why this exists as its own file
 *
 * It is the boundary between what a browser sent and what reaches a Mongo
 * query. Every value is read by name, checked against a known set, and
 * copied into a fresh object. Nothing is spread, so a body carrying
 * `{"$where": "..."}` or `{"status": {"$ne": null}}` loses those keys here
 * rather than in the query builder.
 *
 * resolve.ts then reads only the fields this file can produce.
 */

const MAX_IDS = 2_000
const MAX_VALUES = 50
const MAX_MANUAL_CHARS = 100_000

const LEAD_STATUSES = new Set<number>(Object.values(LEAD_STATUS))
const CLIENT_STATUSES = new Set<number>(Object.values(CLIENT_STATUS))

export function parseAudienceRules(raw: unknown): IAudienceRules {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {}
    }

    const body = raw as Record<string, unknown>
    const rules: IAudienceRules = {}

    /* ---- Leads ---- */
    const leads = asObject(body.leads)
    if (leads) {
        rules.leads = {
            all: leads.all === true,
            ids: objectIds(leads.ids),
            status: numbersIn(leads.status, LEAD_STATUSES),
            source: strings(leads.source),
            assignedTo: objectIds(leads.assignedTo),
        }
    }

    /* ---- Clients ---- */
    const clients = asObject(body.clients)
    if (clients) {
        rules.clients = {
            all: clients.all === true,
            ids: objectIds(clients.ids),
            status: numbersIn(clients.status, CLIENT_STATUSES),
        }
    }

    /* ---- Contacts ---- */
    const contacts = asObject(body.contacts)
    if (contacts) {
        rules.contacts = {
            all: contacts.all === true,
            ids: objectIds(contacts.ids),
            tags: strings(contacts.tags),
        }
    }

    /* ---- Typed or pasted addresses ---- */
    if (Array.isArray(body.manual) || typeof body.manual === "string") {
        const text = Array.isArray(body.manual)
            ? body.manual.filter((v) => typeof v === "string").join("\n")
            : String(body.manual)

        if (text.length > MAX_MANUAL_CHARS) {
            throw new EmailError(
                "That pasted list is too long. Import it as a contact list " +
                "instead, which also keeps a record of where it came from.",
                400,
                { field: "manual" }
            )
        }

        const entries = splitPastedAddresses(text)
        if (entries.length > 0) rules.manual = entries
    }

    /* ---- Exclusions ---- */
    const exclude = asObject(body.exclude)
    if (exclude) {
        const emails =
            typeof exclude.emails === "string"
                ? splitPastedAddresses(exclude.emails)
                : Array.isArray(exclude.emails)
                  ? exclude.emails
                        .filter((v): v is string => typeof v === "string")
                        .flatMap(splitPastedAddresses)
                  : []

        if (emails.length > 0 || objectIds(exclude.audienceIds).length > 0) {
            rules.exclude = {
                emails: emails.slice(0, 5_000),
                audienceIds: objectIds(exclude.audienceIds),
            }
        }
    }

    return rules
}

/**
 * True when the rules would select nobody at all.
 *
 * Saving an empty audience is allowed; scheduling a campaign against one is
 * not, and the campaign route says so rather than sending zero emails and
 * reporting success.
 */
export function rulesAreEmpty(rules: IAudienceRules): boolean {
    const hasLeads =
        rules.leads &&
        (rules.leads.all ||
            rules.leads.ids?.length ||
            rules.leads.status?.length ||
            rules.leads.source?.length ||
            rules.leads.assignedTo?.length)

    const hasClients =
        rules.clients &&
        (rules.clients.all ||
            rules.clients.ids?.length ||
            rules.clients.status?.length)

    const hasContacts =
        rules.contacts &&
        (rules.contacts.all ||
            rules.contacts.ids?.length ||
            rules.contacts.tags?.length)

    return !hasLeads && !hasClients && !hasContacts && !rules.manual?.length
}

/* ------------------------------------------------------------------ */

function asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function objectIds(value: unknown): Types.ObjectId[] {
    if (!Array.isArray(value)) return []

    return value
        .filter((v): v is string => typeof v === "string" && /^[a-f0-9]{24}$/i.test(v))
        .slice(0, MAX_IDS)
        .map((v) => new Types.ObjectId(v))
}

/** Numbers, but only ones that exist in the given set of valid codes. */
function numbersIn(value: unknown, allowed: Set<number>): number[] {
    if (!Array.isArray(value)) return []

    return value
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && allowed.has(n))
        .slice(0, MAX_VALUES)
}

function strings(value: unknown): string[] {
    if (!Array.isArray(value)) return []

    return value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, MAX_VALUES)
}
