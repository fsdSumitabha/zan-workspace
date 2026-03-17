export const PROJECT_STATUS = {
    DISCUSSION: 110,
    PROPOSAL_SENT: 120,
    NEGOTIATION: 130,
    CONFIRMED: 140,
    IN_PROGRESS: 150,
    DEPLOYED: 160,
    MAINTENANCE: 170,
    CLOSED: 180
} as const

export type ProjectStatus =
    (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS]

export const PROJECT_STATUS_META: Record<
    ProjectStatus,
    { label: string; color: string }
> = {
    110: { label: "Discussion", color: "bg-yellow-500 text-yellow-900" },
    120: { label: "Proposal Sent", color: "bg-blue-500 text-white" },
    130: { label: "Negotiation", color: "bg-orange-500 text-white" },
    140: { label: "Confirmed", color: "bg-green-500 text-white" },
    150: { label: "In Progress", color: "bg-purple-500 text-white" },
    160: { label: "Deployed", color: "bg-teal-500 text-white" },
    170: { label: "Maintenance", color: "bg-cyan-500 text-white" },
    180: { label: "Closed", color: "bg-gray-500 text-white" }
}
