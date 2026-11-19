import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { UNKNOWN_OUTCOME_POLICY } from "@/constants/emailStatus"
import { regionScopePlugin } from "@/lib/region-scope"

/**
 * Every tunable number in the delivery engine, in one place.
 *
 * Nothing under src/lib/email hard-codes any of these. They are read once
 * per worker invocation and passed down. Changing one is a settings edit,
 * not a deploy.
 *
 * Kept apart from EmailProviderConfig on purpose. These are operational
 * knobs that an operations manager should be able to turn. Those are
 * credentials. They do not belong behind the same permission.
 *
 * The defaults below are for the Vercel Hobby plan with campaigns of up to
 * 100 recipients over Gmail SMTP. See
 * docs/EMAIL_MARKETING_DECISIONS.md section 3 for why each one is what it
 * is, and what to change when the plan or the provider changes.
 */
export interface IEmailDeliveryConfig extends Document {
    region: RegionCode

    /** Recipients per logical batch, for reporting. Not used yet. */
    logicalBatchSize: number

    /**
     * The most jobs one worker claims at a time. At 100, a campaign of 100
     * is one claim and one invocation.
     */
    maxJobsPerInvocation: number
    /** Sends in flight inside one worker. More than 2 just queues. */
    sendConcurrency: number

    /** How long a worker keeps claiming new work, in ms. */
    workerDurationBudgetMs: number
    /**
     * Stop claiming at this fraction of the budget, so in-flight sends can
     * finish and write their results before the function is killed.
     */
    workerSafetyFraction: number

    /**
     * How long a claim is held. Longer than any single send, short enough
     * that a crashed worker's jobs recover within two heartbeats.
     */
    leaseDurationMs: number

    maxAttemptsTransient: number
    /** Always 1. A 550 does not get better by being retried. */
    maxAttemptsPermanent: number
    backoffBaseMs: number
    backoffMaxMs: number

    /** How many campaigns may send at the same time. */
    globalCampaignConcurrency: number

    /** What to do with a send whose outcome we cannot confirm. */
    unknownOutcomePolicy: number
    unknownOutcomeWindowMs: number

    /**
     * Check the suppression list again in the worker, right before the
     * send. Costs one indexed lookup per recipient. Leave it on.
     */
    suppressionRecheckBeforeSend: boolean

    /**
     * How often the heartbeat runs, in minutes. The UI reads this to tell
     * people how close to their chosen time a campaign will go out. On
     * Vercel Hobby the schedule runs every 15 minutes with a 15-minute
     * jitter, so the honest figure to show is about double this.
     */
    heartbeatIntervalMinutes: number

    /** Stop a campaign when this share of sends hard bounce. 0 to 1. */
    bounceRateThreshold: number
    /** Only apply the bounce threshold after this many sends. */
    bounceRateMinSample: number

    updatedBy?: Types.ObjectId
    createdAt: Date
    updatedAt: Date
}

const EmailDeliveryConfigSchema = new Schema<IEmailDeliveryConfig>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
        },

        logicalBatchSize: { type: Number, default: 100, min: 1, max: 1000 },

        maxJobsPerInvocation: { type: Number, default: 100, min: 1, max: 500 },
        sendConcurrency: { type: Number, default: 2, min: 1, max: 20 },

        workerDurationBudgetMs: {
            type: Number,
            default: 180_000,
            min: 5_000,
            max: 280_000,
        },
        workerSafetyFraction: { type: Number, default: 0.7, min: 0.1, max: 0.95 },

        leaseDurationMs: { type: Number, default: 120_000, min: 10_000 },

        maxAttemptsTransient: { type: Number, default: 5, min: 1, max: 10 },
        maxAttemptsPermanent: { type: Number, default: 1, min: 1, max: 1 },
        backoffBaseMs: { type: Number, default: 2_000, min: 500 },
        backoffMaxMs: { type: Number, default: 900_000, min: 1_000 },

        globalCampaignConcurrency: { type: Number, default: 1, min: 1, max: 20 },

        unknownOutcomePolicy: {
            type: Number,
            default: UNKNOWN_OUTCOME_POLICY.NEVER_RESEND,
        },
        unknownOutcomeWindowMs: { type: Number, default: 3_600_000 },

        suppressionRecheckBeforeSend: { type: Boolean, default: true },

        heartbeatIntervalMinutes: { type: Number, default: 15, min: 1, max: 1440 },

        bounceRateThreshold: { type: Number, default: 0.05, min: 0, max: 1 },
        bounceRateMinSample: { type: Number, default: 100, min: 1 },

        updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

// One config document per region.
EmailDeliveryConfigSchema.index({ region: 1 }, { unique: true })

// No audit plugin: the activity log would record a row of 18 numbers on
// every tweak. The settings screen shows updatedBy and updatedAt instead.
regionScopePlugin(EmailDeliveryConfigSchema)

const EmailDeliveryConfig =
    (mongoose.models.EmailDeliveryConfig as mongoose.Model<IEmailDeliveryConfig>) ||
    mongoose.model<IEmailDeliveryConfig>(
        "EmailDeliveryConfig",
        EmailDeliveryConfigSchema
    )

regionScopePlugin(EmailDeliveryConfig.schema)

export default EmailDeliveryConfig
