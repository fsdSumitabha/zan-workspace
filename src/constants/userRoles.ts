export const USER_ROLE_META = {
    10: { label: "Admin", description: "Full system access" },
    15: { label: "Operations Manager", description: "Manages operations" },
    20: { label: "HR", description: "Manages employees" },
    30: { label: "Project Manager", description: "Oversees projects" },
    40: { label: "Full Stack Developer", description: "Builds product" },
    42: { label: "Blockchain Developer", description: "Develops blockchain applications" },
    45: { label: "Senior Blockchain Developer", description: "Builds blockchain solutions" },
    50: { label: "Digital Marketer", description: "Run digital marketing campaigns" },
    60: { label: "Business Development Executive", description: "Handles leads" },
    65: { label: "US Sales Agent", description: "Sells products in the US region" },
    69: { label: "US Leads Manager", description: "Manages leads of the US region" },
    70: { label: "Accountant", description: "Manages finances" },
    80: { label: "Technical Support", description: "IT support" },

    90: { label: "System Integration User", description: "Automated user for API-based lead ingestion" }
} as const

export type UserRole = keyof typeof USER_ROLE_META

/**
 * Roles that administer staff accounts across every region.
 *
 * User administration is a different axis from data access. HR covers one
 * region for leads and clients, but hires for all of them, so HR must be able
 * to list, create and edit an account in a region they cannot read data from.
 *
 * Two effects, both deliberate:
 *
 * 1. They may grant any region, not only the ones they hold.
 *    See src/lib/region-scope/regionGrant.ts.
 * 2. The /users routes read outside the region scope for them. Without that,
 *    HR would create a US account and then watch it vanish from the list,
 *    unable to edit it.
 *
 * This does NOT widen what they can see anywhere else. Leads, clients and the
 * assignee picker stay region-scoped for these roles like everyone else.
 */
export const CROSS_REGION_USER_ADMIN_ROLES: readonly number[] = [
    10, // Admin
    20, // HR
]

export function canAdministerAllRegions(role: number): boolean {
    return CROSS_REGION_USER_ADMIN_ROLES.includes(role)
}
