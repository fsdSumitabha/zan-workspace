/**
 * Who can use Ad Tracking and the bulk lead import. Existing roles only.
 * See USER_ROLE_META.
 *
 * Edit the lists here. The API routes, the page guard in src/proxy.ts, the
 * sidebar and the buttons all read them.
 *
 * Region still applies on top. The lead counts on every Ad Tracking page
 * come from region-scoped lead queries, so a US Leads Manager counts US
 * leads only. The ad records themselves are shared by every region.
 */
export const AD_TRACKING_ROLES = {
    /**
     * Open the Ad Tracking pages: campaigns, ad sets, ads, lead forms and
     * the lead counts on each.
     *
     * 10 Admin, 15 Operations Manager, 45, 50 Digital Marketer,
     * 69 US Leads Manager.
     */
    VIEW: [10, 15, 45, 50, 69],

    /**
     * Import a sheet of leads, and see past imports and their reports.
     * Each of these roles can also create a lead by hand in
     * POST /api/admin/operations/leads.
     */
    IMPORT: [10, 15, 45, 50, 69],
} as const

export const AD_TRACKING_VIEW_ROLES: number[] = [...AD_TRACKING_ROLES.VIEW]

export const LEAD_IMPORT_ROLES: number[] = [...AD_TRACKING_ROLES.IMPORT]

export function canViewAdTracking(role: number | null | undefined): boolean {
    return role != null && AD_TRACKING_VIEW_ROLES.includes(role)
}

export function canImportLeads(role: number | null | undefined): boolean {
    return role != null && LEAD_IMPORT_ROLES.includes(role)
}
