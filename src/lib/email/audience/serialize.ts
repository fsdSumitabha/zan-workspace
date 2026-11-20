import type { IEmailAudience, IAudienceRules } from "@/models/EmailAudience"
import type { IEmailContact } from "@/models/EmailContact"
import type { IEmailSuppression } from "@/models/EmailSuppression"
import type {
    EmailAudienceRow,
    EmailContactRow,
    EmailSuppressionRow,
} from "@/types/email"

/** Rules as JSON the browser can hold and send back unchanged. */
export function serializeRules(rules: IAudienceRules | undefined): Record<string, unknown> {
    if (!rules) return {}

    return {
        leads: rules.leads
            ? {
                  all: rules.leads.all ?? false,
                  ids: (rules.leads.ids ?? []).map(String),
                  status: rules.leads.status ?? [],
                  source: rules.leads.source ?? [],
                  assignedTo: (rules.leads.assignedTo ?? []).map(String),
              }
            : undefined,
        clients: rules.clients
            ? {
                  all: rules.clients.all ?? false,
                  ids: (rules.clients.ids ?? []).map(String),
                  status: rules.clients.status ?? [],
              }
            : undefined,
        contacts: rules.contacts
            ? {
                  all: rules.contacts.all ?? false,
                  ids: (rules.contacts.ids ?? []).map(String),
                  tags: rules.contacts.tags ?? [],
              }
            : undefined,
        manual: rules.manual ?? [],
        exclude: rules.exclude
            ? {
                  emails: rules.exclude.emails ?? [],
                  audienceIds: (rules.exclude.audienceIds ?? []).map(String),
              }
            : undefined,
    }
}

export function serializeAudience(row: IEmailAudience): EmailAudienceRow {
    return {
        _id: String(row._id),
        name: row.name,
        description: row.description ?? "",
        rules: serializeRules(row.rules),
        lastCount: row.lastCount ?? null,
        lastCountedAt: row.lastCountedAt
            ? row.lastCountedAt.toISOString()
            : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }
}

export function serializeContact(row: IEmailContact): EmailContactRow {
    const custom =
        row.customFields instanceof Map
            ? Object.fromEntries(row.customFields.entries())
            : ((row.customFields ?? {}) as Record<string, string>)

    return {
        _id: String(row._id),
        email: row.email,
        firstName: row.firstName ?? "",
        lastName: row.lastName ?? "",
        company: row.company ?? "",
        marketingConsent: row.marketingConsent,
        consentSource: row.consentSource ?? "",
        consentAt: row.consentAt ? row.consentAt.toISOString() : null,
        consentWithdrawnAt: row.consentWithdrawnAt
            ? row.consentWithdrawnAt.toISOString()
            : null,
        tags: row.tags ?? [],
        customFields: custom,
        createdAt: row.createdAt.toISOString(),
    }
}

export function serializeSuppression(
    row: IEmailSuppression
): EmailSuppressionRow {
    return {
        _id: String(row._id),
        email: row.email,
        emailNormalized: row.emailNormalized,
        reason: row.reason,
        note: row.note ?? "",
        sourceCampaignId: row.sourceCampaignId
            ? String(row.sourceCampaignId)
            : null,
        createdAt: row.createdAt.toISOString(),
    }
}
