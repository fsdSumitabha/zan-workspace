import { Types } from "mongoose"
import EmailCampaign from "@/models/EmailCampaign"
import CampaignRecipient from "@/models/CampaignRecipient"
import EmailTemplate from "@/models/EmailTemplate"
import EmailTemplateVersion from "@/models/EmailTemplateVersion"
import EmailSenderIdentity from "@/models/EmailSenderIdentity"
import EmailProviderConfig from "@/models/EmailProviderConfig"
import EmailDeliveryConfig from "@/models/EmailDeliveryConfig"
import EmailDeliveryAttempt from "@/models/EmailDeliveryAttempt"
import EmailTrackingEvent from "@/models/EmailTrackingEvent"
import EmailSuppression from "@/models/EmailSuppression"
import EmailRateCounter from "@/models/EmailRateCounter"
import EmailDispatchLock from "@/models/EmailDispatchLock"
import EmailContact from "@/models/EmailContact"
import EmailAudience from "@/models/EmailAudience"
import { CAMPAIGN_STATUS, RECIPIENT_STATUS } from "@/constants/emailStatus"
import {
    DELIVERY_LIMITS,
    setTestLimits,
} from "@/lib/email/config/deliveryConfig"
import { buildTrackingToken } from "@/lib/email/campaign/snapshot"
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
/**
 * The rate limiter's counter key. Fixed in providerConfig.ts now that
 * there is one sending account, so a test that clears counters must use
 * the same string the engine does.
 */
export const TEST_PROVIDER_KEY = "sales"

function ensureTestSecrets(): void {
    process.env.EMAIL_TRACKING_SECRET ??= "test-tracking-secret"
    process.env.EMAIL_PUBLIC_ORIGIN ??= "http://localhost:3000"
    process.env.EMAIL_JOB_SECRET ??= "test-job-secret-at-least-16-chars"

    // Campaigns send through the sales mailbox from the environment, so a
    // test has to provide one. The address is on `.invalid`, which RFC 2606
    // reserves and which can never resolve, and the transport is replaced
    // by a sink before any worker runs. Nothing here can reach a person.
    process.env.SALES_SMTP_HOST ??= "sink.invalid"
    process.env.SALES_SMTP_PORT ??= "465"
    process.env.SALES_SMTP_USER ??= "sink@zan.invalid"
    process.env.SALES_SMTP_PASS ??= "not-a-real-password"
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
    // Easy to forget, and leaving it out makes events accumulate across
    // tests so a count that should be 1 comes back as 9.
    EmailTrackingEvent,
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

    /* ---- Limits ----
     *
     * The real ones are constants now, so a scenario overrides them
     * through the test seam rather than by seeding a row. The defaults
     * here are deliberately loose: a test that wants to watch the rate
     * limiter bite sets perSecond itself.
     */

    setTestLimits({
        globalPerSecond: options.perSecond ?? 50,
        globalPerDay: options.perDay ?? 10_000,
        maxJobsPerInvocation:
            options.maxJobsPerInvocation ?? DELIVERY_LIMITS.maxJobsPerInvocation,
        sendConcurrency:
            options.sendConcurrency ?? DELIVERY_LIMITS.sendConcurrency,
        workerDurationBudgetMs:
            options.workerDurationBudgetMs ??
            DELIVERY_LIMITS.workerDurationBudgetMs,
        leaseDurationMs:
            options.leaseDurationMs ?? DELIVERY_LIMITS.leaseDurationMs,
        maxAttemptsTransient:
            options.maxAttemptsTransient ?? DELIVERY_LIMITS.maxAttemptsTransient,
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
            /**
             * The same shape the real snapshot produces: 32 hex
             * characters. `recipientByToken` refuses anything else, so a
             * token with a hyphen in it would never resolve and the
             * tracking tests would pass against nothing.
             */
            trackingToken: buildTrackingToken(
                campaign._id as Types.ObjectId,
                email
            ),
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
