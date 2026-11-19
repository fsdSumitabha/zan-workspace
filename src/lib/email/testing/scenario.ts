import { Types } from "mongoose"
import EmailCampaign from "@/models/EmailCampaign"
import CampaignRecipient from "@/models/CampaignRecipient"
import EmailTemplate from "@/models/EmailTemplate"
import EmailTemplateVersion from "@/models/EmailTemplateVersion"
import EmailSenderIdentity from "@/models/EmailSenderIdentity"
import EmailProviderConfig from "@/models/EmailProviderConfig"
import EmailDeliveryConfig from "@/models/EmailDeliveryConfig"
import EmailDeliveryAttempt from "@/models/EmailDeliveryAttempt"
import EmailSuppression from "@/models/EmailSuppression"
import EmailRateCounter from "@/models/EmailRateCounter"
import EmailDispatchLock from "@/models/EmailDispatchLock"
import EmailContact from "@/models/EmailContact"
import EmailAudience from "@/models/EmailAudience"
import { CAMPAIGN_STATUS, RECIPIENT_STATUS } from "@/constants/emailStatus"
import { DELIVERY_DEFAULTS } from "@/lib/email/config/deliveryConfig"
import { encryptSecret } from "@/lib/email/config/crypto"
import { clearCollections } from "./db"

/**
 * Builds a campaign ready to send, for tests and the simulation.
 *
 * Everything here writes directly rather than going through the API, so a
 * test can set up a precise state in one call. The delivery engine is what
 * is under test; getting to the starting line is not.
 *
 * ## Addresses
 *
 * Every seeded recipient is on `.invalid`, which RFC 2606 reserves and
 * guarantees will never resolve. Even if a test were somehow pointed at a
 * real SMTP server, nothing could be delivered to a real person.
 */

export const TEST_REGION = "IN" as const
export const TEST_PROVIDER_KEY = "sink:test"

/**
 * Keys the tests use, so a developer does not have to configure anything
 * to run them and the suite does not depend on whatever is in .env.local.
 *
 * They are fixed values in a file that only tests import. Nothing they
 * encrypt leaves the test database, and the password they protect is
 * itself a placeholder.
 */
const TEST_SECRET_KEY =
    "0000000000000000000000000000000000000000000000000000000000000001"

function ensureTestSecrets(): void {
    process.env.EMAIL_SECRET_KEY ??= TEST_SECRET_KEY
    process.env.EMAIL_TRACKING_SECRET ??= "test-tracking-secret"
    process.env.EMAIL_PUBLIC_ORIGIN ??= "http://localhost:3000"
    process.env.EMAIL_JOB_SECRET ??= "test-job-secret-at-least-16-chars"
}

export const ALL_EMAIL_MODELS = [
    EmailCampaign,
    CampaignRecipient,
    EmailTemplate,
    EmailTemplateVersion,
    EmailSenderIdentity,
    EmailProviderConfig,
    EmailDeliveryConfig,
    EmailDeliveryAttempt,
    EmailSuppression,
    EmailRateCounter,
    EmailDispatchLock,
    EmailContact,
    EmailAudience,
]

export interface ScenarioOptions {
    recipients: number
    perSecond?: number
    perDay?: number
    maxJobsPerInvocation?: number
    sendConcurrency?: number
    workerDurationBudgetMs?: number
    leaseDurationMs?: number
    maxAttemptsTransient?: number
    status?: number
}

export interface Scenario {
    campaignId: Types.ObjectId
    addresses: string[]
}

export async function resetEmailData(): Promise<void> {
    await clearCollections(ALL_EMAIL_MODELS)
}

export async function seedScenario(
    options: ScenarioOptions
): Promise<Scenario> {
    ensureTestSecrets()
    const now = new Date()

    /* ---- Provider, with a password the engine can decrypt ---- */

    const secret = encryptSecret("not-a-real-password")

    await EmailProviderConfig.create({
        region: TEST_REGION,
        name: "Sink",
        providerKey: TEST_PROVIDER_KEY,
        host: "sink.invalid",
        port: 465,
        secure: true,
        user: "sink@zan.invalid",
        passCipher: secret.cipher,
        passIv: secret.iv,
        passTag: secret.tag,
        maxConnections: 1,
        maxMessages: 100,
        globalPerSecond: options.perSecond ?? 50,
        globalPerDay: options.perDay ?? 10_000,
        killSwitch: false,
        isDefault: true,
    })

    /* ---- Delivery settings ---- */

    await EmailDeliveryConfig.create({
        region: TEST_REGION,
        ...DELIVERY_DEFAULTS,
        maxJobsPerInvocation:
            options.maxJobsPerInvocation ?? DELIVERY_DEFAULTS.maxJobsPerInvocation,
        sendConcurrency:
            options.sendConcurrency ?? DELIVERY_DEFAULTS.sendConcurrency,
        workerDurationBudgetMs:
            options.workerDurationBudgetMs ??
            DELIVERY_DEFAULTS.workerDurationBudgetMs,
        leaseDurationMs:
            options.leaseDurationMs ?? DELIVERY_DEFAULTS.leaseDurationMs,
        maxAttemptsTransient:
            options.maxAttemptsTransient ?? DELIVERY_DEFAULTS.maxAttemptsTransient,
    })

    /* ---- Sender identity ---- */

    const identity = await EmailSenderIdentity.create({
        region: TEST_REGION,
        fromName: "Zan Services",
        fromEmail: "news@zan.invalid",
        postalAddress: "Zan Services, Kolkata, India",
        isDefault: true,
        verifiedAt: now,
    })

    /* ---- Template and a version ---- */

    const template = await EmailTemplate.create({
        region: TEST_REGION,
        name: "Simulation template",
        category: 10,
    })

    const version = await EmailTemplateVersion.create({
        region: TEST_REGION,
        templateId: template._id,
        version: 1,
        mjml: "<mjml><mj-body><mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>",
        html:
            "<html><body><p>Hello {{first_name}},</p>" +
            '<p><a href="https://zan.invalid/offer">Read more</a></p>' +
            '<p>{{postal_address}} · <a href="{{unsubscribe_url}}">Unsubscribe</a></p>' +
            "</body></html>",
        text: "Hello {{first_name}}, read more at https://zan.invalid/offer",
        linkHosts: ["zan.invalid"],
        mergeTokens: ["first_name", "postal_address", "unsubscribe_url"],
        htmlBytes: 200,
    })

    await EmailTemplate.updateOne(
        { _id: template._id },
        { $set: { currentVersionId: version._id } }
    )

    /* ---- Campaign ---- */

    const campaign = await EmailCampaign.create({
        region: TEST_REGION,
        name: `Simulation ${Date.now()}`,
        subject: "Hello {{first_name}}",
        status: options.status ?? CAMPAIGN_STATUS.SENDING,
        templateId: template._id,
        templateVersionId: version._id,
        senderIdentityId: identity._id,
        startedAt: now,
        counts: { total: options.recipients, queued: options.recipients },
    })

    /* ---- Recipients ---- */

    const addresses: string[] = []
    const docs = Array.from({ length: options.recipients }, (_, i) => {
        const email = `person${i}@sink.invalid`
        addresses.push(email)

        return {
            region: TEST_REGION,
            campaignId: campaign._id,
            email,
            emailNormalized: email,
            name: `Person ${i}`,
            sourceType: 40,
            mergeData: { first_name: `Person${i}`, email },
            status: RECIPIENT_STATUS.QUEUED,
            attempts: 0,
            maxAttempts: options.maxAttemptsTransient ?? 5,
            queuedAt: now,
            trackingToken: `tok${i}-${Date.now().toString(36)}`,
        }
    })

    if (docs.length > 0) {
        await CampaignRecipient.insertMany(docs, { ordered: false })
    }

    return { campaignId: campaign._id as Types.ObjectId, addresses }
}

/** Counts by recipient status, for assertions. */
export async function statusCounts(
    campaignId: Types.ObjectId
): Promise<Record<number, number>> {
    const rows = await CampaignRecipient.aggregate<{ _id: number; n: number }>([
        { $match: { campaignId } },
        { $group: { _id: "$status", n: { $sum: 1 } } },
    ])

    return Object.fromEntries(rows.map((r) => [r._id, r.n]))
}
