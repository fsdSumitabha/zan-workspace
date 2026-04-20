import { UserRole } from "@/constants/userRoles"

export interface User {
    _id: string

    name: string
    email: string
    password: string

    role: UserRole

    isActive: boolean

    lastLoginAt?: string
    createdBy?: string

    avatar?: string

    deletedAt: string | null

    createdAt: string
    updatedAt: string
}