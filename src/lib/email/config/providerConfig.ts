import { createHash } from "crypto"

import type { RegionCode } from "@/lib/region"
import EmailDeliveryConfig from "@/models/EmailDeliveryConfig"
import { EmailError } from "@/lib/email/http"
import { MAIL_ACCOUNT, readMailAccount } from "@/lib/mail/accounts"
import { deliverySettings } from "./deliveryConfig"

/**
 * Where a campaign's SMTP connection comes from.
 *
 * ## One account, from the environment
 *
 * Campaigns send through the sales mailbox, the same one quotations use.
 * The host, port, address and password are the `SALES_SMTP_*` environment
 * variables and nothing else. There is no SMTP form, nothing is stored in
 * the database, and no password is encrypted at rest, because there is no
 * longer a password at rest to encrypt.
 *
 * This replaced a per-region row that an admin filled in on a settings
 * screen. That row could hold a different account from the one quotations
 * used, which is a way to send half your mail from the wrong address
 * without noticing.
 *
 * ## The one thing still read from the database
 *
 * The kill switch. It is the only control that has to change while a
 * campaign is sending, and an environment variable cannot: changing one on
 * Vercel needs a redeploy, which is minutes somebody does not have when
 * mail is going out wrongly.
 *
 * It lives on EmailDeliveryConfig, one row per region. No row means
 * sending is allowed, so nothing has to be set up first.
 *
 * ## The numbers
 *
 * Every limit below comes from DELIVERY_LIMITS in deliveryConfig.ts, which
 * explains how each was arrived at.
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
    /** The last Test connection result, or null if nobody has pressed it. */
    lastTestOk: boolean | null
    lastTestAt: Date | null
    lastTestMessage: string
}

export interface ProviderWithSecret extends ProviderSettings {
    pass: string
    /**
     * A hash of the connection settings, used only to decide whether the
     * pooled transporter can be reused. Never the password itself: this
     * value is held in memory for the life of the process.
     */
    passHash: string
}

/**
 * The rate limiter's counter key.
 *
 * Fixed, because there is now exactly one sending account. Every worker in
 * every region counts against the same per-second and per-day budget,
 * which is right: Gmail's limit is per mailbox, not per region.
 */
const PROVIDER_KEY = "sales"

/**
 * The sending account for a region, without the password.
 *
 * Returns null when SALES_SMTP_* is not set, so the settings screen can say
 * what is missing instead of failing.
 */
export async function getProvider(
    region: RegionCode
): Promise<ProviderSettings | null> {
    const account = readMailAccount(MAIL_ACCOUNT.SALES)
    if (!account) return null

    const state = await regionState(region)
    return toSettings(region, account.host, account.port, account.secure, account.user, state)
}

/**
 * The sending account with its password.
 *
 * Only the transport factory calls this. It throws rather than returning
 * null, because a worker that reaches here has nothing useful to do
 * without a working connection.
 */
export async function getProviderWithSecret(
    region: RegionCode
): Promise<ProviderWithSecret> {
    const account = readMailAccount(MAIL_ACCOUNT.SALES)

    if (!account) {
        throw new EmailError(
            "The sales mailbox is not set up on this server, so no campaign " +
                "can send. Set SALES_SMTP_HOST, SALES_SMTP_PORT, " +
                "SALES_SMTP_USER and SALES_SMTP_PASS.",
            500
        )
    }

    const state = await regionState(region)
    const base = toSettings(
        region,
        account.host,
        account.port,
        account.secure,
        account.user,
        state
    )

    return {
        ...base,
        pass: account.pass,
        passHash: createHash("sha256")
            .update(
                `${account.host}|${account.port}|${account.secure}|${account.user}|${account.pass}`
            )
            .digest("hex"),
    }
}

/**
 * Refuses to go on when sending is switched off.
 *
 * The worker calls this before every claim cycle, so turning the switch on
 * stops everything within one cycle rather than at the end of the campaign.
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

/**
 * Turns campaign sending off or on for a region.
 *
 * Upserts, because a region that has never been touched has no row and
 * switching off must still work the first time.
 */
export async function setKillSwitch(
    region: RegionCode,
    on: boolean,
    reason?: string
): Promise<{ killSwitch: boolean; killSwitchReason?: string }> {
    const trimmed = reason?.trim()

    await EmailDeliveryConfig.findOneAndUpdate(
        { region },
        on
            ? { $set: { region, killSwitch: true, killSwitchReason: trimmed || "" } }
            : { $set: { region, killSwitch: false }, $unset: { killSwitchReason: "" } },
        { upsert: true, returnDocument: "after" }
    ).lean()

    return on
        ? { killSwitch: true, killSwitchReason: trimmed || undefined }
        : { killSwitch: false }
}

/**
 * Records what the mail server said when somebody pressed Test connection.
 *
 * Kept so the overview can say whether the connection has ever been proved,
 * rather than only whether the variables are present.
 */
export async function recordTestResult(
    region: RegionCode,
    result: { ok: boolean; message: string }
): Promise<void> {
    await EmailDeliveryConfig.findOneAndUpdate(
        { region },
        {
            $set: {
                region,
                lastTestOk: result.ok,
                lastTestAt: new Date(),
                lastTestMessage: result.message.slice(0, 500),
            },
        },
        { upsert: true }
    ).lean()
}

interface RegionState {
    killSwitch: boolean
    killSwitchReason?: string
    lastTestOk: boolean | null
    lastTestAt: Date | null
    lastTestMessage: string
}

async function regionState(region: RegionCode): Promise<RegionState> {
    // No row is the normal state. It means nobody has ever switched
    // sending off here or tested the connection, so sending is allowed.
    const row = await EmailDeliveryConfig.findOne({ region })
        .select("killSwitch killSwitchReason lastTestOk lastTestAt lastTestMessage")
        .lean<{
            killSwitch?: boolean
            killSwitchReason?: string
            lastTestOk?: boolean
            lastTestAt?: Date
            lastTestMessage?: string
        }>()

    return {
        killSwitch: Boolean(row?.killSwitch),
        killSwitchReason: row?.killSwitch
            ? row.killSwitchReason || undefined
            : undefined,
        lastTestOk: typeof row?.lastTestOk === "boolean" ? row.lastTestOk : null,
        lastTestAt: row?.lastTestAt ?? null,
        lastTestMessage: row?.lastTestMessage ?? "",
    }
}

function toSettings(
    region: RegionCode,
    host: string,
    port: number,
    secure: boolean,
    user: string,
    state: RegionState
): ProviderSettings {
    const capabilities = providerCapabilities(host)

    // deliverySettings(), not DELIVERY_LIMITS: the accessor is the one
    // place that applies the test seam. Reading the constants directly
    // here meant a test could not lower the daily budget, which is how
    // this was found.
    const limits = deliverySettings()

    return {
        id: `env:${PROVIDER_KEY}`,
        region,
        name: user,
        providerKey: PROVIDER_KEY,
        host,
        port,
        secure,
        user,
        maxConnections: limits.maxConnections,
        maxMessages: limits.maxMessages,
        globalPerSecond: limits.globalPerSecond,
        globalPerDay: limits.globalPerDay,
        killSwitch: state.killSwitch,
        killSwitchReason: state.killSwitchReason,
        reportsDelivery: capabilities.reportsDelivery,
        reportsBounces: capabilities.reportsBounces,
        hasPassword: true,
        lastTestOk: state.lastTestOk,
        lastTestAt: state.lastTestAt,
        lastTestMessage: state.lastTestMessage,
    }
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
