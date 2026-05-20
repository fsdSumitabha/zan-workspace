/**
 * Single source of truth for "who can edit this entity" — used by:
 *   - the proxy/middleware to gate the `/admin/operations/<entity>/<id>/edit`
 *     routes (server-side enforcement)
 *   - detail-page UI to hide the Edit button for users who couldn't act
 *     on it anyway
 *
 * Mirrors the role lists declared on each entity's PATCH route handler.
 * Update both places together if you ever change a role list.
 */
export const EDIT_ROLES = {
    LEAD: [10, 60, 70],
    CLIENT: [10, 60, 70],
    PROJECT: [10, 60, 70],
    USER: [10, 20],
} as const

export type EditEntity = keyof typeof EDIT_ROLES

export function canEdit(
    entity: EditEntity,
    role: number | null | undefined
): boolean {
    if (role == null) return false
    return (EDIT_ROLES[entity] as readonly number[]).includes(role)
}
