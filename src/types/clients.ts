import { ClientStatus } from "@/constants/clientStatus"

export interface Client {
    _id: string
    name: string
    company: string
    email?: string
    phone: string

    status: ClientStatus

    /** Sales region code: "IN", "US" or "AE". */
    region?: string

    createdAt: string
    updatedAt: string

    lastInteractionAt?: string
    lastInteractionId?: string,
    createdBy?: {
        _id: string
        name: string
        email: string
        role: number
    }
}