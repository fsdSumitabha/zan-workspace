import { LeadStatus } from "@/constants/leadStatus"

export interface Lead {
    _id: string
    name: string
    email?: string
    phone: string
    source: string

    status: LeadStatus

    assignedTo?: string
    convertedClientId?: string

    createdAt: string
    updatedAt: string
}