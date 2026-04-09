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
    { label: string; color: string, decoration?: string }
> = {
    10: { label: "New Lead", color: "bg-gray-500 text-white", decoration: "border-b-2 border-gray-500"  },
    20: { label: "Contacted", color: "bg-blue-500 text-white", decoration: "border-b-2 border-blue-500" },
    30: { label: "Meeting Scheduled", color: "bg-purple-500 text-white", decoration: "border-b-2 border-purple-500" },
    40: { label: "Discussion", color: "bg-yellow-500 text-yellow-900", decoration: "border-b-2 border-yellow-500" },
    50: { label: "Negotiation", color: "bg-orange-500 text-white", decoration: "border-b-2 border-orange-500" },
    60: { label: "Converted", color: "bg-green-500 text-white", decoration: "border-b-2 border-green-500" },
    70: { label: "Lost", color: "bg-red-500 text-white", decoration: "border-b-2 border-red-500" }
}
