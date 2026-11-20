import type { IEmailSenderIdentity } from "@/models/EmailSenderIdentity"
import type { EmailSenderIdentityView } from "@/types/email"

/**
 * Turns database rows into what the settings screen receives.
 *
 * Every field is named one at a time. Nothing spreads the whole document,
 * because that is how a secret ends up in a response body the day somebody
 * adds a field.
 *
 * The SMTP connection is not here. It comes from the environment, and
 * src/lib/email/config/providerConfig.ts builds it.
 */

export function serializeIdentity(
    row: IEmailSenderIdentity
): EmailSenderIdentityView {
    return {
        _id: String(row._id),
        fromName: row.fromName,
        fromEmail: row.fromEmail,
        replyTo: row.replyTo ?? "",
        postalAddress: row.postalAddress,
        verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
        verificationNote: row.verificationNote ?? "",
        isDefault: row.isDefault,
    }
}
