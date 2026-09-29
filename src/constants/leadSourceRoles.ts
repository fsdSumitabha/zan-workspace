/**
 * Who can do what with lead sources. Existing roles only. See USER_ROLE_META.
 *
 * Edit the lists here. The API routes, the page guard in src/proxy.ts, the
 * sidebar and the buttons all read them, so nothing else needs to change.
 *
 * Region still applies on top of every list. A US Leads Manager sees US
 * lead sources only, like everything else in the app.
 */
export const LEAD_SOURCE_ROLES = {
    /**
     * See every lead source in their regions. Upload sheets, assign sources
     * to a person and a day, and delete. Also everything WORK can do.
     *
     * 10 Admin, 15 Operations Manager, 69 US Leads Manager.
     * 45 is here because it has the same power over leads in the lead routes,
     * including delete.
     */
    MANAGE: [10, 15, 45, 69],

    /**
     * See only the lead sources assigned to them. Call, set the status, add
     * notes, set callback reminders.
     *
     * The same roles that can open the Leads list today.
     */
    WORK: [50, 60, 65, 70],

    /**
     * Turn a lead source into a real Lead. The same roles that can create a
     * Lead in POST /api/admin/operations/leads. 65 (US Sales Agent) cannot
     * create leads there, so it cannot convert here. It marks the source
     * Interested and a manager converts it.
     */
    CONVERT: [10, 15, 45, 50, 60, 69, 70],
} as const

/** Everyone who can open the lead source pages at all. */
export const LEAD_SOURCE_ACCESS_ROLES: number[] = [
    ...LEAD_SOURCE_ROLES.MANAGE,
    ...LEAD_SOURCE_ROLES.WORK,
]

export const LEAD_SOURCE_MANAGE_ROLES: number[] = [...LEAD_SOURCE_ROLES.MANAGE]

export const LEAD_SOURCE_CONVERT_ROLES: number[] = [...LEAD_SOURCE_ROLES.CONVERT]

export function canUseLeadSources(role: number | null | undefined): boolean {
    return role != null && LEAD_SOURCE_ACCESS_ROLES.includes(role)
}

export function canManageLeadSources(role: number | null | undefined): boolean {
    return role != null && LEAD_SOURCE_MANAGE_ROLES.includes(role)
}

export function canConvertLeadSources(role: number | null | undefined): boolean {
    return role != null && LEAD_SOURCE_CONVERT_ROLES.includes(role)
}
