/**
 * Who can do what in email marketing. Existing roles only. See USER_ROLE_META.
 *
 * Edit the lists here. The API routes, the page guard in src/proxy.ts, the
 * sidebar and the buttons all read them, so nothing else needs to change.
 *
 * Region still applies on top of every list. A US Leads Manager sees US
 * campaigns only, like everything else in the app.
 *
 * Same shape as src/constants/leadSourceRoles.ts.
 */
export const EMAIL_ROLES = {
    /**
     * The settings screen: sender identities and the global kill switch.
     *
     * 10 Admin, 15 Operations Manager. Nobody else.
     *
     * Deliberately not 45 or 50, who can do everything else here. These
     * two controls decide who the company appears to be when it sends
     * mail, and can stop every campaign at once.
     *
     * The cost of keeping it this small: a sender identity has to exist
     * before anybody can send a campaign, so an Admin creates it once
     * during setup. Day to day nobody needs this screen.
     */
    ADMIN: [10, 15],

    /**
     * Create, edit, schedule, send, pause, resume and cancel campaigns.
     * Manage templates, audiences, contacts and the suppression list.
     *
     * 50 Digital Marketer is who this module is for.
     */
    MANAGE: [10, 15, 45, 50],

    /**
     * Create and edit drafts and templates. Cannot schedule or send.
     *
     * 60 Business Development Executive. A BDE can write a campaign for a
     * manager to review and send. Sending to a hundred people without
     * review is not a thing one person should do alone.
     */
    AUTHOR: [10, 15, 45, 50, 60],

    /**
     * Read campaigns, reports and delivery activity. Change nothing.
     *
     * The same roles that can open the Leads list, minus the ones with no
     * reason to read marketing results.
     */
    VIEW: [10, 15, 45, 50, 60, 65, 69, 70],
} as const

/** Everyone who can open the email marketing pages at all. */
export const EMAIL_ACCESS_ROLES: number[] = [...EMAIL_ROLES.VIEW]

export const EMAIL_ADMIN_ROLES: number[] = [...EMAIL_ROLES.ADMIN]

export const EMAIL_MANAGE_ROLES: number[] = [...EMAIL_ROLES.MANAGE]

export const EMAIL_AUTHOR_ROLES: number[] = [...EMAIL_ROLES.AUTHOR]

export function canUseEmail(role: number | null | undefined): boolean {
    return role != null && EMAIL_ACCESS_ROLES.includes(role)
}

/** Sender identities and the kill switch. The settings screen. */
export function canAdministerEmail(role: number | null | undefined): boolean {
    return role != null && EMAIL_ADMIN_ROLES.includes(role)
}

/** Schedule, send, pause, cancel. */
export function canManageEmail(role: number | null | undefined): boolean {
    return role != null && EMAIL_MANAGE_ROLES.includes(role)
}

/** Create and edit drafts and templates. */
export function canAuthorEmail(role: number | null | undefined): boolean {
    return role != null && EMAIL_AUTHOR_ROLES.includes(role)
}
