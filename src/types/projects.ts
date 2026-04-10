import { ProjectStatus } from "@/constants/projectStatus"

export interface Project {
    _id: string

    clientId: {
        _id: string
        name: string
        company: string
    }
    companyName?: string
    title: string
    description?: string
    serviceType?: string

    status: ProjectStatus

    budget?: number

    createdAt: string
    updatedAt: string

    lastInteractionAt?: string
    lastInteractionId?: string
}