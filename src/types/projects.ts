import { ProjectStatus } from "@/constants/projectStatus"
import { ServiceType } from "@/constants/services"

export interface Project {
    _id: string

    clientId: {
        _id: string
        name: string
        company: string
        phone: string
    }
    companyName?: string
    title: string
    description?: string
    serviceType?: ServiceType

    status: ProjectStatus

    budget?: number

    createdAt: string
    updatedAt: string

    lastInteractionAt?: string
    lastInteractionId?: string
}