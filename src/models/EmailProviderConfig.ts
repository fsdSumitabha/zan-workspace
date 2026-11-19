import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"

/**
 * One SMTP connection, with the provider's limits and a kill switch.
 *
 * ## The password never leaves the server
 *
 * It is stored encrypted, as `passCipher` plus `passIv` and `passTag`
 * (AES-256-GCM, key in EMAIL_SECRET_KEY). The toJSON transform below
 * deletes all three, so even a route that forgets to project them out
 * cannot leak them into a response body.
 *
 * To change the password, send a new one. There is no way to read the old
 * one back through the API, by design.
 *
 * ## The kill switch
 *
 * One flag. The worker reads it before every claim, so setting it stops
 * all sending within one claim cycle. It matters more on the Vercel Hobby
 * plan than on Pro: Hobby has no overage billing, so a runaway loop pauses
 * the whole project for 30 days rather than costing money.
 */
export interface IEmailProviderConfig extends Document {
    region: RegionCode

    /** A name a person picks: "Gmail", "Brevo", "SES Mumbai". */
    name: string
    /** A key for the rate limiter. Every worker on it shares one budget. */
    providerKey: string

    host: string
    port: number
    secure: boolean
    user: string

    /** AES-256-GCM. Never serialised. See the toJSON transform below. */
    passCipher?: string
    passIv?: string
    passTag?: string

    /** Connections in the Nodemailer pool, per process. Keep this at 1. */
    maxConnections: number
    /** Messages on one connection before it is reopened. */
    maxMessages: number

    /** The global budget, shared by every worker. Not per process. */
    globalPerSecond: number
    globalPerDay: number

    killSwitch: boolean
    killSwitchReason?: string
    killSwitchAt?: Date
    killSwitchBy?: Types.ObjectId

    /** Result of the last "test connection" press. */
    lastTestAt?: Date
    lastTestOk?: boolean
    lastTestMessage?: string

    /**
     * Whether this provider reports deliveries and bounces by webhook.
     * Gmail does not. When this is false the UI shows "not reported by
     * your provider" instead of a delivery count of zero.
     */
    reportsDelivery: boolean
    reportsBounces: boolean

    isDefault: boolean

    createdBy?: Types.ObjectId
    createdAt: Date
    updatedAt: Date
}

const EmailProviderConfigSchema = new Schema<IEmailProviderConfig>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
            index: true,
        },

        name: { type: String, required: true, trim: true, maxlength: 100 },
        providerKey: { type: String, required: true, trim: true },

        host: { type: String, required: true, trim: true },
        port: { type: Number, required: true, min: 1, max: 65535 },
        secure: { type: Boolean, default: true },
        user: { type: String, required: true, trim: true },

        passCipher: { type: String, select: false },
        passIv: { type: String, select: false },
        passTag: { type: String, select: false },

        maxConnections: { type: Number, default: 1, min: 1, max: 20 },
        maxMessages: { type: Number, default: 100, min: 1 },

        globalPerSecond: { type: Number, default: 2, min: 1, max: 500 },
        globalPerDay: { type: Number, default: 500, min: 1 },

        killSwitch: { type: Boolean, default: false },
        killSwitchReason: String,
        killSwitchAt: Date,
        killSwitchBy: { type: Schema.Types.ObjectId, ref: "User" },

        lastTestAt: Date,
        lastTestOk: Boolean,
        lastTestMessage: { type: String, maxlength: 1000 },

        reportsDelivery: { type: Boolean, default: false },
        reportsBounces: { type: Boolean, default: false },

        isDefault: { type: Boolean, default: false },

        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

/**
 * The last line of defence on the credentials.
 *
 * `select: false` above keeps them out of an ordinary query. This removes
 * them from any document that is turned into JSON, whichever way it was
 * loaded. Both are needed: `.select("+passCipher")` deliberately bypasses
 * the first, and only the decrypt helper should ever do that.
 */
const stripSecrets = (_doc: unknown, ret: unknown) => {
    const out = ret as Record<string, unknown>
    delete out.passCipher
    delete out.passIv
    delete out.passTag
    return out
}

EmailProviderConfigSchema.set("toJSON", { transform: stripSecrets })
EmailProviderConfigSchema.set("toObject", { transform: stripSecrets })

EmailProviderConfigSchema.index({ region: 1, providerKey: 1 }, { unique: true })
EmailProviderConfigSchema.index({ region: 1, isDefault: 1 })

// No soft delete. A provider row is edited, not deleted; removing one
// while a campaign points at it would break that campaign's sending.
ensureAuditPlugin(EmailProviderConfigSchema, ENTITY_TYPE.EMAIL_PROVIDER_CONFIG)
regionScopePlugin(EmailProviderConfigSchema)

const EmailProviderConfig =
    (mongoose.models.EmailProviderConfig as mongoose.Model<IEmailProviderConfig>) ||
    mongoose.model<IEmailProviderConfig>(
        "EmailProviderConfig",
        EmailProviderConfigSchema
    )

ensureAuditPlugin(EmailProviderConfig.schema, ENTITY_TYPE.EMAIL_PROVIDER_CONFIG)
regionScopePlugin(EmailProviderConfig.schema)

export default EmailProviderConfig
