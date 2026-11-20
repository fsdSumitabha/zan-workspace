import { Types } from "mongoose"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import EmailContact from "@/models/EmailContact"
import User from "@/models/User"
import type { IAudienceRules } from "@/models/EmailAudience"
import { RECIPIENT_SOURCE } from "@/constants/emailStatus"
import { firstNameOf, splitPastedAddresses } from "./address"

/**
 * Turns audience rules into candidate recipients.
 *
 * ## Nothing from the rules becomes a query operator
 *
 * Each named field is read and used to build a filter here. A rule object
 * cannot carry `$where`, `$expr` or a dotted path into a query, because
 * there is no path from the stored shape into the filter except the code
 * below. That is why EmailAudience stores a closed shape rather than a
 * Mongo filter.
 *
 * ## Region is passed in, not inherited
 *
 * Lead, Client and EmailContact all carry regionScopePlugin, so inside a
 * signed-in request these queries are already narrowed to the regions that
 * request may read.
 *
 * That is not enough. The dispatcher builds a scheduled campaign's
 * snapshot inside `runWithoutRegionScope`, where the plugin adds nothing,
 * so relying on it alone let an IN campaign collect AE recipients. The
 * campaign's own region is the authority, and it is passed in. See
 * `inRegion` below for why it goes in an `$and`.
 *
 * ## This returns candidates, not recipients
 *
 * Eligibility, deduplication and the suppression check happen after, in
 * eligibility.ts. Keeping them apart is what makes the exclusion breakdown
 * possible: we need to know how many were matched before anything was
 * removed.
 */

export interface Candidate {
    email: string
    name: string
    sourceType: number
    sourceId: Types.ObjectId | null
    /** Merge values, snapshotted here and never read again at send time. */
    mergeData: Record<string, string>
}

export interface ResolveResult {
    candidates: Candidate[]
    /** How many records each rule matched, before any exclusion. */
    matched: {
        leads: number
        clients: number
        contacts: number
        manual: number
    }
    /** True when a rule hit the safety cap and the list is incomplete. */
    truncated: boolean
}

/**
 * A hard ceiling on one audience.
 *
 * It is not a product limit; campaigns are expected to be well under a
 * hundred. It is a guard so a mistaken "all leads" on a database that grew
 * cannot build a list that takes the server down while it is counted.
 */
export const MAX_CANDIDATES = 25_000

export interface ResolveOptions {
    /**
     * The one region these recipients must belong to.
     *
     * The campaign snapshot always passes the campaign's region. The
     * preview passes the pinned region, so what a person approves is
     * built by the same filter that later writes the rows.
     *
     * Left out, the query falls back to whatever the region plugin adds,
     * which is correct inside a request and nothing at all outside one.
     */
    region?: string
}

/**
 * Pins a filter to one region, in a way the region plugin cannot widen.
 *
 * The plugin adds its condition with `query.where({ region: ... })`, which
 * replaces a plain `region` key on the same filter. An `$and` entry is not
 * replaced, so both conditions survive and the narrower one decides.
 *
 * In a request that means "a region I may read AND the campaign's region".
 * In the dispatcher, where the plugin adds nothing, it means "the
 * campaign's region". Both are right.
 */
export function inRegion(
    filter: Record<string, unknown>,
    region?: string
): Record<string, unknown> {
    return region ? { $and: [filter, { region }] } : filter
}

interface LeanLead {
    _id: Types.ObjectId
    name?: string
    email?: string
    phone?: string
    source?: string
    assignedTo?: Types.ObjectId
}

interface LeanClient {
    _id: Types.ObjectId
    name?: string
    company?: string
    email?: string
    phone?: string
}

interface LeanContact {
    _id: Types.ObjectId
    email: string
    firstName?: string
    lastName?: string
    company?: string
    marketingConsent: boolean
    customFields?: Map<string, string> | Record<string, string>
}

export async function resolveAudience(
    rules: IAudienceRules | undefined | null,
    options: ResolveOptions = {}
): Promise<ResolveResult> {
    const candidates: Candidate[] = []
    const matched = { leads: 0, clients: 0, contacts: 0, manual: 0 }
    let truncated = false

    if (!rules) return { candidates, matched, truncated }

    /* ---------------------------------------------------------------- */
    /* Leads                                                             */
    /* ---------------------------------------------------------------- */

    const leadFilter = buildLeadFilter(rules)
    if (leadFilter) {
        const rows = await Lead.find(inRegion(leadFilter, options.region))
            .select("_id name email phone source assignedTo")
            .limit(MAX_CANDIDATES + 1)
            .lean<LeanLead[]>()

        matched.leads = rows.length
        if (rows.length > MAX_CANDIDATES) truncated = true

        // One lookup for every owner on the page, not one per lead.
        const owners = await ownerNames(
            rows.map((r) => r.assignedTo).filter(Boolean) as Types.ObjectId[]
        )

        for (const row of rows.slice(0, MAX_CANDIDATES)) {
            candidates.push({
                email: row.email ?? "",
                name: row.name ?? "",
                sourceType: RECIPIENT_SOURCE.LEAD,
                sourceId: row._id,
                mergeData: {
                    name: row.name ?? "",
                    first_name: firstNameOf(row.name),
                    email: row.email ?? "",
                    phone: row.phone ?? "",
                    lead_source: row.source ?? "",
                    company: "",
                    owner_name: owners.get(String(row.assignedTo)) ?? "",
                },
            })
        }
    }

    /* ---------------------------------------------------------------- */
    /* Clients                                                           */
    /* ---------------------------------------------------------------- */

    const clientFilter = buildClientFilter(rules)
    if (clientFilter) {
        const rows = await Client.find(inRegion(clientFilter, options.region))
            .select("_id name company email phone")
            .limit(MAX_CANDIDATES + 1)
            .lean<LeanClient[]>()

        matched.clients = rows.length
        if (rows.length > MAX_CANDIDATES) truncated = true

        for (const row of rows.slice(0, MAX_CANDIDATES)) {
            candidates.push({
                email: row.email ?? "",
                name: row.name ?? "",
                sourceType: RECIPIENT_SOURCE.CLIENT,
                sourceId: row._id,
                mergeData: {
                    name: row.name ?? "",
                    first_name: firstNameOf(row.name),
                    email: row.email ?? "",
                    phone: row.phone ?? "",
                    company: row.company ?? "",
                    lead_source: "",
                    owner_name: "",
                },
            })
        }
    }

    /* ---------------------------------------------------------------- */
    /* Contacts                                                          */
    /* ---------------------------------------------------------------- */

    const contactFilter = buildContactFilter(rules)
    if (contactFilter) {
        const rows = await EmailContact.find(
            inRegion(contactFilter, options.region)
        )
            .select("_id email firstName lastName company marketingConsent customFields")
            .limit(MAX_CANDIDATES + 1)
            .lean<LeanContact[]>()

        matched.contacts = rows.length
        if (rows.length > MAX_CANDIDATES) truncated = true

        for (const row of rows.slice(0, MAX_CANDIDATES)) {
            const full = [row.firstName, row.lastName].filter(Boolean).join(" ")
            const custom =
                row.customFields instanceof Map
                    ? Object.fromEntries(row.customFields.entries())
                    : (row.customFields ?? {})

            candidates.push({
                email: row.email,
                name: full,
                sourceType: RECIPIENT_SOURCE.CONTACT,
                sourceId: row._id,
                mergeData: {
                    ...custom,
                    name: full,
                    first_name: row.firstName ?? firstNameOf(full),
                    email: row.email,
                    company: row.company ?? "",
                    phone: "",
                    lead_source: "",
                    owner_name: "",
                },
            })
        }
    }

    /* ---------------------------------------------------------------- */
    /* Typed or pasted addresses                                         */
    /* ---------------------------------------------------------------- */

    if (rules.manual?.length) {
        const typed = rules.manual
            .flatMap((entry) => splitPastedAddresses(entry))
            .slice(0, MAX_CANDIDATES)

        matched.manual = typed.length

        for (const entry of typed) {
            candidates.push({
                email: entry,
                name: "",
                sourceType: RECIPIENT_SOURCE.MANUAL,
                sourceId: null,
                mergeData: {
                    name: "",
                    first_name: "",
                    email: entry,
                    company: "",
                    phone: "",
                    lead_source: "",
                    owner_name: "",
                },
            })
        }
    }

    return { candidates, matched, truncated }
}

/* ------------------------------------------------------------------ */
/* Filter builders                                                     */
/* ------------------------------------------------------------------ */

/**
 * Returns null when the rule selects nothing at all.
 *
 * Null and "match everything" are different answers, and getting them
 * confused is how an audience with no lead rule ends up emailing every
 * lead in the database.
 */
function buildLeadFilter(
    rules: IAudienceRules
): Record<string, unknown> | null {
    const r = rules.leads
    if (!r) return null

    const and: Record<string, unknown>[] = []

    if (r.ids?.length) {
        and.push({ _id: { $in: r.ids.map(toObjectId).filter(Boolean) } })
    } else if (!r.all) {
        // No ids and not "all" means the rule has to narrow by something.
        // With no narrowing field either, it selects nothing.
        const hasNarrowing =
            r.status?.length || r.source?.length || r.assignedTo?.length
        if (!hasNarrowing) return null
    }

    if (r.status?.length) and.push({ status: { $in: r.status } })
    if (r.source?.length) and.push({ source: { $in: r.source } })
    if (r.assignedTo?.length) {
        and.push({
            assignedTo: { $in: r.assignedTo.map(toObjectId).filter(Boolean) },
        })
    }

    return and.length > 0 ? { $and: and } : {}
}

function buildClientFilter(
    rules: IAudienceRules
): Record<string, unknown> | null {
    const r = rules.clients
    if (!r) return null

    const and: Record<string, unknown>[] = []

    if (r.ids?.length) {
        and.push({ _id: { $in: r.ids.map(toObjectId).filter(Boolean) } })
    } else if (!r.all) {
        if (!r.status?.length) return null
    }

    if (r.status?.length) and.push({ status: { $in: r.status } })

    return and.length > 0 ? { $and: and } : {}
}

function buildContactFilter(
    rules: IAudienceRules
): Record<string, unknown> | null {
    const r = rules.contacts
    if (!r) return null

    const and: Record<string, unknown>[] = []

    if (r.ids?.length) {
        and.push({ _id: { $in: r.ids.map(toObjectId).filter(Boolean) } })
    } else if (!r.all) {
        if (!r.tags?.length) return null
    }

    if (r.tags?.length) and.push({ tags: { $in: r.tags } })

    return and.length > 0 ? { $and: and } : {}
}

function toObjectId(value: unknown): Types.ObjectId | null {
    if (value instanceof Types.ObjectId) return value
    if (typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)) {
        return new Types.ObjectId(value)
    }
    return null
}

/** Names for the {{owner_name}} token, one query for the whole page. */
async function ownerNames(
    ids: Types.ObjectId[]
): Promise<Map<string, string>> {
    const unique = Array.from(new Set(ids.map(String)))
    if (unique.length === 0) return new Map()

    const rows = await User.find({ _id: { $in: unique } })
        .select("_id name")
        .lean<{ _id: Types.ObjectId; name?: string }[]>()

    return new Map(rows.map((r) => [String(r._id), r.name ?? ""]))
}
