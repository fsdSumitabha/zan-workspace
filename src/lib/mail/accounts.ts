/**
 * The two mailboxes this app sends transactional mail from.
 *
 * ## Why there are two
 *
 * One SMTP account used to serve everything, so a new user's welcome mail
 * and a customer's quotation both went out from the same address. They are
 * different jobs with different audiences:
 *
 * - HR is internal. The user module: an account was created, here is your
 *   password, here is who created it.
 * - Sales is outward. Campaigns, quotations, anything a customer or a lead
 *   receives.
 *
 * Keeping them apart matters beyond tidiness. A customer who replies to a
 * campaign should reach sales, not HR. The two mailboxes also have separate
 * sending reputations, so a bulk campaign that upsets a provider cannot
 * stop a new employee getting their password.
 *
 * ## Where the settings come from
 *
 * Environment variables, one set per account:
 *
 *     HR_SMTP_HOST     SALES_SMTP_HOST
 *     HR_SMTP_PORT     SALES_SMTP_PORT
 *     HR_SMTP_USER     SALES_SMTP_USER
 *     HR_SMTP_PASS     SALES_SMTP_PASS
 *
 * Each HR variable falls back to its older unprefixed name when it is
 * unset: HR_SMTP_HOST to SMTP_HOST, and so on. Those are the names the app
 * used before the split and they are already set in deployed environments.
 * The fallback is per variable rather than all or nothing, so half-renaming
 * a deployment leaves mail working rather than stopping it.
 *
 * The sales set has no such fallback, on purpose. If the sales variables are
 * missing, sending must fail and say so. Falling back would send a customer
 * mail from the HR mailbox, which is the exact problem this split exists to
 * fix.
 *
 * Bulk campaigns are the one thing that does not read these variables at
 * send time. The email marketing engine sends through the provider row
 * saved in the database, so the kill switch and the shared rate limits
 * apply to every worker. The sales variables pre-fill that settings form.
 * See src/lib/email/config/providerConfig.ts.
 */

export const MAIL_ACCOUNT = {
    /**
     * Internal mail about people. The user module.
     */
    HR: "hr",

    /**
     * Outward mail to customers and leads. Campaigns and quotations.
     */
    SALES: "sales",
} as const

export type MailAccount = (typeof MAIL_ACCOUNT)[keyof typeof MAIL_ACCOUNT]

/**
 * Everything needed to open a connection and set a From address.
 */
export interface MailAccountSettings {
    account: MailAccount
    /** For error messages and logs. Never shown to a customer. */
    label: string
    host: string
    port: number
    secure: boolean
    user: string
    pass: string
}

/**
 * The connection settings without the password.
 *
 * This is what a settings form can be pre-filled with. The password is
 * deliberately left out of the type, so a screen or an API response cannot
 * leak one by accident.
 */
export type MailAccountConnection = Omit<MailAccountSettings, "pass">

type EnvField = "HOST" | "PORT" | "USER" | "PASS"

const ACCOUNT_META: Record<MailAccount, { prefix: string; label: string }> = {
    [MAIL_ACCOUNT.HR]: { prefix: "HR_SMTP", label: "HR" },
    [MAIL_ACCOUNT.SALES]: { prefix: "SALES_SMTP", label: "Sales" },
}

/**
 * The older names, still read for the HR account only.
 *
 * Deployed environments already hold these. Dropping them would have broken
 * user creation mail the moment this change shipped, which is worse than a
 * few lines of compatibility.
 */
const LEGACY_HR: Record<EnvField, string> = {
    HOST: "SMTP_HOST",
    PORT: "SMTP_PORT",
    USER: "SMTP_USER",
    PASS: "SMTP_PASS",
}

interface RawAccount {
    label: string
    host: string
    port: number
    user: string
    pass: string
    /** Variable names that are unset or unusable, in the order asked for. */
    missing: string[]
}

function env(name: string): string {
    return process.env[name]?.trim() ?? ""
}

/**
 * Reads one field for one account, preferring the prefixed name.
 *
 * The name it reports as missing is always the prefixed one, because that
 * is the name somebody setting this up now should add.
 */
function field(
    account: MailAccount,
    name: EnvField
): { value: string; reportAs: string } {
    const prefixed = `${ACCOUNT_META[account].prefix}_${name}`
    const value = env(prefixed)

    if (value) return { value, reportAs: prefixed }

    if (account === MAIL_ACCOUNT.HR) {
        return { value: env(LEGACY_HR[name]), reportAs: prefixed }
    }

    return { value: "", reportAs: prefixed }
}

function readRaw(account: MailAccount): RawAccount {
    const missing: string[] = []

    const host = field(account, "HOST")
    const port = field(account, "PORT")
    const user = field(account, "USER")
    const pass = field(account, "PASS")

    if (!host.value) missing.push(host.reportAs)

    // A port that is not a usable number is as bad as one that is absent.
    // Number("") is 0, so both cases land here.
    const portNumber = Number(port.value)
    const portUsable =
        port.value !== "" &&
        Number.isInteger(portNumber) &&
        portNumber > 0 &&
        portNumber <= 65_535
    if (!portUsable) missing.push(port.reportAs)

    if (!user.value) missing.push(user.reportAs)
    if (!pass.value) missing.push(pass.reportAs)

    return {
        label: ACCOUNT_META[account].label,
        host: host.value,
        port: portUsable ? portNumber : 0,
        user: user.value,
        pass: pass.value,
        missing,
    }
}

/**
 * Implicit TLS on port 465, STARTTLS everywhere else.
 *
 * This is the rule the app has always applied. It is written down once here
 * so the two accounts cannot drift apart.
 */
function isSecurePort(port: number): boolean {
    return port === 465
}

/**
 * The settings for an account, or null when it is not fully set up.
 *
 * Use this where a missing account is an ordinary state to report. Use
 * `requireMailAccount` where it should stop the request.
 */
export function readMailAccount(
    account: MailAccount
): MailAccountSettings | null {
    const raw = readRaw(account)
    if (raw.missing.length > 0) return null

    return {
        account,
        label: raw.label,
        host: raw.host,
        port: raw.port,
        secure: isSecurePort(raw.port),
        user: raw.user,
        pass: raw.pass,
    }
}

/**
 * The settings for an account, or an error naming what is missing.
 *
 * The message lists the variables rather than saying "not configured". The
 * person reading it is usually looking at a deploy screen and needs to know
 * which line to add.
 */
export function requireMailAccount(account: MailAccount): MailAccountSettings {
    const settings = readMailAccount(account)
    if (settings) return settings

    const raw = readRaw(account)
    const legacyNote =
        account === MAIL_ACCOUNT.HR
            ? " The older SMTP_* names are also accepted."
            : ""

    throw new Error(
        `The ${raw.label} mail account is not set up, so nothing can be sent ` +
            `from it. Set these environment variables: ` +
            `${raw.missing.join(", ")}.${legacyNote}`
    )
}

/**
 * The host, port and address for an account, with no password, or null.
 *
 * The password is not required here. Somebody who has filled in the host
 * and the address but not yet the password still wants a form pre-filled
 * with what they have.
 */
export function mailAccountConnection(
    account: MailAccount
): MailAccountConnection | null {
    const raw = readRaw(account)

    // The password is the one field this view does not need, so a missing
    // password alone must not hide the rest.
    const blockers = raw.missing.filter((name) => !name.endsWith("_PASS"))
    if (blockers.length > 0) return null

    return {
        account,
        label: raw.label,
        host: raw.host,
        port: raw.port,
        secure: isSecurePort(raw.port),
        user: raw.user,
    }
}

/**
 * Whether an account can send right now. For health checks and screens.
 */
export function mailAccountReady(account: MailAccount): boolean {
    return readMailAccount(account) !== null
}
