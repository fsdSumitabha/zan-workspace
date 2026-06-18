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
    META_LEAD_EVENT: 9,
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
    9: { label: "MetaLeadEvent" },
}
