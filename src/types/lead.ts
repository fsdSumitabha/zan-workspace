import { LeadStatus } from "@/constants/leadStatus"
import { UserRole } from "@/constants/userRoles"

export interface Lead {
    _id: string
    name: string
    email?: string
    phone: string
    source: string

    status: LeadStatus

    /** Sales region code: "IN", "US" or "AE". */
    region?: string

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