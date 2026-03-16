export const STATUSES = [
    "NEW_LEAD",
    "CONTACTED",
    "MEETING_SCHEDULED",
    "DISCUSSION",
    "NEGOTIATION",
    "ACTIVE",
    "IN_PROGRESS",
    "MAINTENANCE",
    "COMPLETED"
] as const

export type Status = typeof STATUSES[number]