export const ENTITY_TYPE = {
    LEAD: 0,
    CLIENT: 1,
    PROJECT: 2,
    USER: 3,
    INTERACTION: 4,
    MEETING: 5,
    DOCUMENT: 6,
    CALL: 7,
    QUOTATION: 8,
    LEAD_SOURCE: 9,
    LEAD_SOURCE_UPLOAD: 10,

    // Email marketing. See docs/EMAIL_MARKETING_DATABASE_SCHEMA.md.
    // Only the records a person edits get a code. Job rows
    // (CampaignRecipient, EmailDeliveryAttempt, EmailTrackingEvent) are
    // written by workers, not people, so they are not audited.
    EMAIL_CAMPAIGN: 11,
    EMAIL_TEMPLATE: 12,
    EMAIL_AUDIENCE: 13,
    EMAIL_CONTACT: 14,
    EMAIL_ASSET: 15,
    EMAIL_SUPPRESSION: 16,
    EMAIL_SENDER_IDENTITY: 17,
    EMAIL_PROVIDER_CONFIG: 18,

    // Ad tracking. One code for the import, which a person starts. The ad
    // records (campaign, ad set, ad, lead form) are written in bulk by the
    // import, not edited by people, so they are not audited.
    // See docs/ad-tracking.md.
    LEAD_IMPORT: 19,
} as const

export type EntityType = (typeof ENTITY_TYPE)[keyof typeof ENTITY_TYPE]

export const ENTITY_TYPE_META: Record<EntityType, { label: string }> = {
    0: { label: "Lead" },
    1: { label: "Client" },
    2: { label: "Project" },
    3: { label: "User" },
    4: { label: "Interaction" },
    5: { label: "Meeting" },
    6: { label: "Document" },
    7: { label: "Call" },
    8: { label: "Quotation" },
    9: { label: "Lead Source" },
    10: { label: "Lead Source Upload" },
    11: { label: "Email Campaign" },
    12: { label: "Email Template" },
    13: { label: "Email Audience" },
    14: { label: "Email Contact" },
    15: { label: "Email Asset" },
    16: { label: "Email Suppression" },
    17: { label: "Sender Identity" },
    18: { label: "Email Provider" },
    19: { label: "Lead Import" },
}
