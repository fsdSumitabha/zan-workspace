import type { RegionCode } from "@/lib/region"
import EmailProviderConfig, {
    type IEmailProviderConfig,
} from "@/models/EmailProviderConfig"
import { EmailError } from "@/lib/email/http"
import { decryptSecret } from "./crypto"

/**
 * Loading the SMTP provider, with and without its password.
 *
 * Two functions on purpose. `getProvider` is what routes and screens use
 * and can never return the password. `getProviderWithSecret` is the only
 * place that reads it, and it is called by the transport factory alone.
 *
 * The model marks the three secret fields `select: false`, so the plain
 * read genuinely does not fetch them. The `.select("+...")` below is the
 * documented exception.
 */

export interface ProviderSettings {
    id: string
    region: RegionCode
    name: string
    providerKey: string
    host: string
    port: number
    secure: boolean
    user: string
    maxConnections: number
    maxMessages: number
    globalPerSecond: number
    globalPerDay: number
    killSwitch: boolean
    killSwitchReason?: string
    reportsDelivery: boolean
    reportsBounces: boolean
    hasPassword: boolean
}

export interface ProviderWithSecret extends ProviderSettings {
    pass: string
    /** The stored ciphertext, used only to fingerprint the pool. */
    passCipher: string
}

/**
 * The default provider for a region, with no password.
 *
 * Returns null when none is configured yet, so the settings screen can
 * show an empty state rather than an error.
 */
export async function getProvider(
    region: RegionCode
): Promise<ProviderSettings | null> {
    const row = await EmailProviderConfig.findOne({ region })
        .sort({ isDefault: -1, createdAt: 1 })
        .select("+passCipher")
        .lean<IEmailProviderConfig>()

    return row ? toSettings(row) : null
}

/**
 * The default provider with its password decrypted.
 *
 * Only the transport factory calls this. It throws rather than returning
 * null, because a worker that reaches this point has nothing useful to do
 * without a working connection.
 */
export async function getProviderWithSecret(
    region: RegionCode
): Promise<ProviderWithSecret> {
    const row = await EmailProviderConfig.findOne({ region })
        .sort({ isDefault: -1, createdAt: 1 })
        .select("+passCipher +passIv +passTag")
        .lean<IEmailProviderConfig>()

    if (!row) {
        throw new EmailError(
            `No SMTP provider is set up for the ${region} region. Add one in ` +
            "Email Marketing, Settings.",
            400
        )
    }

    if (!row.passCipher || !row.passIv || !row.passTag) {
        throw new EmailError(
            `The SMTP password for "${row.name}" is missing. Enter it again in ` +
            "Email Marketing, Settings.",
            400
        )
    }

    const pass = decryptSecret({
        cipher: row.passCipher,
        iv: row.passIv,
        tag: row.passTag,
    })

    return {
        ...toSettings(row),
        pass,
        passCipher: row.passCipher,
    }
}

/**
 * Refuses to go on when sending is switched off.
 *
 * The worker calls this before every claim cycle, so flipping the kill
 * switch stops everything within one cycle rather than at the end of the
 * campaign.
 */
export function assertSendingAllowed(provider: ProviderSettings): void {
    if (!provider.killSwitch) return

    throw new EmailError(
        provider.killSwitchReason
            ? `Sending is switched off: ${provider.killSwitchReason}`
            : "Sending is switched off in Email Marketing, Settings.",
        409
    )
}

function toSettings(row: IEmailProviderConfig): ProviderSettings {
    return {
        id: String(row._id),
        region: row.region,
        name: row.name,
        providerKey: row.providerKey,
        host: row.host,
        port: row.port,
        secure: row.secure,
        user: row.user,
        maxConnections: row.maxConnections,
        maxMessages: row.maxMessages,
        globalPerSecond: row.globalPerSecond,
        globalPerDay: row.globalPerDay,
        killSwitch: row.killSwitch,
        killSwitchReason: row.killSwitchReason,
        reportsDelivery: row.reportsDelivery,
        reportsBounces: row.reportsBounces,
        hasPassword: Boolean(row.passCipher),
    }
}

/**
 * The settings to offer when somebody sets up a provider for the first
 * time, taken from the SMTP_* environment variables the app already uses
 * for registration and booking mail.
 *
 * It is a starting point for the form, not a fallback at send time. A
 * campaign always sends through a saved provider row, so that the kill
 * switch and the rate limits apply.
 */
export function suggestedFromEnv(): {
    host: string
    port: number
    secure: boolean
    user: string
} | null {
    const host = process.env.SMTP_HOST?.trim()
    const user = process.env.SMTP_USER?.trim()
    const port = Number(process.env.SMTP_PORT)

    if (!host || !user || !Number.isFinite(port)) return null

    return { host, port, secure: port === 465, user }
}

/**
 * What a well-known host can and cannot tell us.
 *
 * Gmail accepts mail and says nothing afterwards: no delivery
 * confirmation, no bounce webhook. The UI reads these flags to say "not
 * reported by your provider" instead of showing a delivery count of zero,
 * which would look like a failure.
 */
export function providerCapabilities(host: string): {
    reportsDelivery: boolean
    reportsBounces: boolean
    note: string
} {
    const h = host.toLowerCase()

    if (h.includes("gmail") || h.includes("google")) {
        return {
            reportsDelivery: false,
            reportsBounces: false,
            note:
                "Gmail accepts mail but does not report deliveries or bounces. " +
                "Delivered and Bounced will stay empty. Gmail also limits a " +
                "Workspace account to 2,000 messages a day.",
        }
    }

    if (h.includes("brevo") || h.includes("sendinblue")) {
        return {
            reportsDelivery: true,
            reportsBounces: true,
            note: "Brevo reports deliveries and bounces by webhook.",
        }
    }

    if (h.includes("amazonaws") || h.includes("ses")) {
        return {
            reportsDelivery: true,
            reportsBounces: true,
            note:
                "Amazon SES reports deliveries and bounces through SNS. A new " +
                "account is in the sandbox and can only send to verified " +
                "addresses until AWS grants production access.",
        }
    }

    return {
        reportsDelivery: false,
        reportsBounces: false,
        note:
            "We do not know whether this provider reports deliveries and " +
            "bounces. Turn the two switches on once you have set up its " +
            "webhook.",
    }
}
