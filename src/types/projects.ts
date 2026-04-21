import { ProjectStatus } from "@/constants/projectStatus"

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
    serviceType?: number

    status: ProjectStatus

    budget?: number

    createdAt: string
    updatedAt: string

    lastInteractionAt?: string
    lastInteractionId?: string
}