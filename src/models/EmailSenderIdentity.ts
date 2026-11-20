import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"
import { softDeletePlugin } from "@/lib/db/softDeletePlugin"

/**
 * Who a campaign appears to come from.
 *
 * Kept apart from EmailProviderConfig on purpose. One SMTP connection can
 * send as several identities, so merging them would force a duplicate copy
 * of the credentials for every from-address.
 *
 * ## postalAddress is required
 *
 * CAN-SPAM requires a real postal address in every marketing email, and
 * most providers treat a missing one as a spam signal. It is required at
 * the schema level, not only in a form, so a campaign cannot be sent from
 * an identity that lacks one.
 */
export interface IEmailSenderIdentity extends Document {
    region: RegionCode

    /** The display name: "Zan Services". */
    fromName: string
    fromEmail: string
    replyTo?: string

    /** Printed in the footer of every campaign. Required. */
    postalAddress: string

    /**
     * Set once somebody has confirmed the domain is set up: SPF, DKIM and
     * DMARC. We cannot check this from here, so it is a note a person
     * ticks, with the date.
     */
    verifiedAt?: Date | null
    verifiedBy?: Types.ObjectId
    verificationNote?: string

    isDefault: boolean

    createdBy?: Types.ObjectId
    deletedAt: Date | null
    deletedBy?: Types.ObjectId

    createdAt: Date
    updatedAt: Date
}

const EmailSenderIdentitySchema = new Schema<IEmailSenderIdentity>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
            index: true,
        },

        fromName: { type: String, required: true, trim: true, maxlength: 100 },
        fromEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        replyTo: { type: String, trim: true, lowercase: true },

        postalAddress: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
        },

        verifiedAt: { type: Date, default: null },
        verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
        verificationNote: { type: String, maxlength: 500 },

        isDefault: { type: Boolean, default: false },

        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

// One identity per address per region.
EmailSenderIdentitySchema.index({ region: 1, fromEmail: 1 }, { unique: true })
EmailSenderIdentitySchema.index({ region: 1, isDefault: 1 })

softDeletePlugin(EmailSenderIdentitySchema)
ensureAuditPlugin(EmailSenderIdentitySchema, ENTITY_TYPE.EMAIL_SENDER_IDENTITY)
regionScopePlugin(EmailSenderIdentitySchema)

const EmailSenderIdentity =
    (mongoose.models.EmailSenderIdentity as mongoose.Model<IEmailSenderIdentity>) ||
    mongoose.model<IEmailSenderIdentity>(
        "EmailSenderIdentity",
        EmailSenderIdentitySchema
    )

softDeletePlugin(EmailSenderIdentity.schema)
ensureAuditPlugin(EmailSenderIdentity.schema, ENTITY_TYPE.EMAIL_SENDER_IDENTITY)
regionScopePlugin(EmailSenderIdentity.schema)

export default EmailSenderIdentity
