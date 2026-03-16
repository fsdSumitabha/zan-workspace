export const INTERACTION_TYPES = [
    "MEETING",
    "NOTE",
    "DOCUMENT",
    "PROPOSAL"
] as const

export type InteractionType = typeof INTERACTION_TYPES[number]