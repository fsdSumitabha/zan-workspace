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
    { label: string; color: string; decoration?: string }
> = {
    110: { label: "Discussion", color: "bg-yellow-500 text-yellow-900", decoration: "border-b-2 border-yellow-500" },
    120: { label: "Proposal Sent", color: "bg-blue-500 text-white", decoration: "border-b-2 border-blue-500" },
    130: { label: "Negotiation", color: "bg-orange-500 text-white", decoration: "border-b-2 border-orange-500" },
    140: { label: "Confirmed", color: "bg-green-500 text-white", decoration: "border-b-2 border-green-500" },
    150: { label: "In Progress", color: "bg-purple-500 text-white", decoration: "border-b-2 border-purple-500" },
    160: { label: "Deployed", color: "bg-teal-500 text-white", decoration: "border-b-2 border-teal-500" },
    170: { label: "Maintenance", color: "bg-cyan-500 text-white", decoration: "border-b-2 border-cyan-500" },
    180: { label: "Closed", color: "bg-gray-500 text-white", decoration: "border-b-2 border-gray-500" }
}