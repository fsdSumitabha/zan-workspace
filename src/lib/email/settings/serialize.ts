import type { IEmailProviderConfig } from "@/models/EmailProviderConfig"
import type { IEmailSenderIdentity } from "@/models/EmailSenderIdentity"
import type {
    EmailProviderView,
    EmailSenderIdentityView,
} from "@/types/email"

/**
 * Turns database rows into what the settings screen receives.
 *
 * Every field is named one at a time. Nothing spreads the whole document,
 * because that is how a `passCipher` ends up in a response body the day
 * somebody adds a field.
 */

export function serializeProvider(row: IEmailProviderConfig): EmailProviderView {
    return {
        _id: String(row._id),
        name: row.name,
        providerKey: row.providerKey,
        host: row.host,
        port: row.port,
        secure: row.secure,
        user: row.user,
        hasPassword: Boolean(row.passCipher),
        maxConnections: row.maxConnections,
        maxMessages: row.maxMessages,
        globalPerSecond: row.globalPerSecond,
        globalPerDay: row.globalPerDay,
        killSwitch: row.killSwitch,
        killSwitchReason: row.killSwitchReason ?? "",
        reportsDelivery: row.reportsDelivery,
        reportsBounces: row.reportsBounces,
        lastTestAt: row.lastTestAt ? row.lastTestAt.toISOString() : null,
        lastTestOk: row.lastTestOk ?? null,
        lastTestMessage: row.lastTestMessage ?? "",
    }
}

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
