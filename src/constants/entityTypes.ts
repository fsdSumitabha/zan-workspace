export const ENTITY_TYPE = {
    LEAD: 0,
    CLIENT: 1,
    PROJECT: 2,
    USER: 3,
    Interaction: 4,
} as const

export type EntityType = (typeof ENTITY_TYPE)[keyof typeof ENTITY_TYPE]

export const ENTITY_TYPE_META = {
    0: { label: "Lead" },
    1: { label: "Client" },
    2: { label: "Project" },
    3: { label: "User" },
    4: { label: "Interaction" },
}