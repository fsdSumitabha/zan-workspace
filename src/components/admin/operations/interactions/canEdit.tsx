import type { UserRole } from "@/constants/userRoles"

export const INTERACTION_EDIT_ROLES: UserRole[] = [10, 60, 45, 50, 70]

export function canEditInteraction(role: UserRole | number | null | undefined): boolean {
    if (role === null || role === undefined) return false
    return (INTERACTION_EDIT_ROLES as number[]).includes(role)
}