import type { UserRole } from "@/constants/userRoles"

export type AuthProfileCreatedBy = {
    id: string
    name?: string
    email?: string
    role?: number
} | null

export interface AuthProfileUser {
    id: string
    name: string
    email: string
    role: UserRole
    isActive: boolean
    avatar: string
    lastLoginAt: string | null
    createdAt: string | null
    updatedAt: string | null
    createdBy: AuthProfileCreatedBy
}
