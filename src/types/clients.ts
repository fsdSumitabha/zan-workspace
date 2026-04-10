import { ClientStatus } from "@/constants/clientStatus"

export interface Client {
    _id: string
    name: string
    company: string
    email?: string
    phone: string

    status: ClientStatus

    createdAt: string
    updatedAt: string

    lastInteractionAt?: string
    lastInteractionId?: string
}