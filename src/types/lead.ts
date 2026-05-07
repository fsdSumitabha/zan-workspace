import { LeadStatus } from "@/constants/leadStatus"
import { UserRole } from "@/constants/userRoles"

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

    lastInteractionAt?: string
    lastInteractionId?: string
    createdBy?: {
        _id: string
        name: string
        email: string
        role: UserRole
    }
}