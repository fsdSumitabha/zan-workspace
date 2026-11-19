import { INTERACTION_TYPE } from "./interactionTypes"

/**
 * Who can schedule, reschedule, cancel and close a meeting (mark it missed or
 * completed). Existing roles only. See USER_ROLE_META.
 *
 * Sales: 60 Business Development Executive, 65 US Sales Agent,
 * 69 US Leads Manager. Marketing: 50 Digital Marketer.
 * Also 10 Admin, 15 Operations Manager, 45 Senior Blockchain Developer and
 * 70 Accountant, who had this access before.
 *
 * Edit the list here. The meeting API routes and the meeting buttons on the
 * web both read it. Before this list, the routes allowed 50 and the buttons
 * did not, so a Digital Marketer saw no buttons at all.
 *
 * Region still applies on top. A US Sales Agent manages US meetings only.
 */
export const MEETING_MANAGE_ROLES: number[] = [10, 15, 45, 50, 60, 65, 69, 70]

export function canManageMeetings(role: number | null | undefined): boolean {
    return role != null && MEETING_MANAGE_ROLES.includes(role)
}

/**
 * The timeline entries that point at a meeting through `refId`. The timeline
 * routes load the meeting for each one. COMPLETED was missing from those
 * routes, so a completed meeting's entry arrived with no meeting and broke
 * the timeline.
 */
export const MEETING_INTERACTION_TYPES: number[] = [
    INTERACTION_TYPE.MEETING_SCHEDULED,
    INTERACTION_TYPE.MEETING_RESCHEDULED,
    INTERACTION_TYPE.MEETING_CANCELLED,
    INTERACTION_TYPE.MEETING_MISSED,
    INTERACTION_TYPE.MEETING_COMPLETED,
]
