import { IntegrationError } from "./http"

/**
 * The CRM user that every website record is written as.
 *
 * It is the system integration user: a User with role 90 ("System
 * Integration User", src/constants/userRoles.ts), a bot account rather than
 * an employee. /api/public/leads and the booking page already write as this
 * user, so a lead from a website reads the same way in the activity log and
 * on the timeline as every other lead that came in by itself. Its Mongo id is
 * in ZANSERVICES_USER_ID. One bot for both websites: the lead's source says
 * which website it came from.
 *
 * It is the actor of the audit rows and the `createdBy` of each lead, note
 * and contact. Notifications are still sent with no actor, as the booking
 * page sends them, so they read "New lead: ..." and not as from a person.
 */
export function integrationActorId(): string {
    const id = process.env.ZANSERVICES_USER_ID?.trim() ?? ""
    if (!/^[a-f0-9]{24}$/i.test(id)) {
        console.error(
            "[integrations] ZANSERVICES_USER_ID must hold the Mongo id of the system integration user " +
            "(the bot account with role 90) that website leads are written as."
        )
        throw new IntegrationError("Website integrations are not set up.", 503)
    }
    return id
}
