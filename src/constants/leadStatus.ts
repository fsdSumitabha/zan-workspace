export const LEAD_STATUS = {
    NEW: 10,
    CONTACTED: 20,
    MEETING: 30,
    DISCUSSION: 40,
    NEGOTIATION: 50,
    CONVERTED: 60,
    LOST: 70
} as const

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS]

export const LEAD_STATUS_META: Record<
    LeadStatus,
    { label: string; color: string }
> = {
    10: { label: "New Lead", color: "bg-gray-500 text-white" },
    20: { label: "Contacted", color: "bg-blue-500 text-white" },
    30: { label: "Meeting Scheduled", color: "bg-purple-500 text-white" },
    40: { label: "Discussion", color: "bg-yellow-500 text-yellow-900" },
    50: { label: "Negotiation", color: "bg-orange-500 text-white" },
    60: { label: "Converted", color: "bg-green-500 text-white" },
    70: { label: "Lost", color: "bg-red-500 text-white" }
}
