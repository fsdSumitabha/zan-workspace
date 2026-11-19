import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { regionScopePlugin } from "@/lib/region-scope"
import { softDeletePlugin } from "@/lib/db/softDeletePlugin"

/**
 * A marketing recipient who is not a Lead and not a Client.
 *
 * ## This does not duplicate the CRM
 *
 * A lead's address is read from the Lead. A client's from the Client. This
 * collection is only for addresses that arrive another way: an imported
 * spreadsheet, a pasted list, a sign-up form. Nothing here mirrors a record
 * that already exists elsewhere.
 *
 * ## Consent
 *
 * `marketingConsent` must be true for a contact to receive a campaign.
 * `consentSource` and `consentAt` record where it came from and when,
 * because under the DPDP Act consent has to be specific to the purpose and
 * has to be shown on request.
 */
export interface IEmailContact extends Document {
    region: RegionCode

    email: string
    emailNormalized: string
    firstName?: string
    lastName?: string
    company?: string

    marketingConsent: boolean
    /** Where the consent came from, e.g. "import:nov-list.xlsx", "form". */
    consentSource?: string
    consentAt?: Date
    /** Set when the person unsubscribes. A suppression row is written too. */
    consentWithdrawnAt?: Date | null

    tags: string[]
    /** Extra columns from an import, for merge tokens. */
    customFields: Map<string, string>

    importBatchId?: Types.ObjectId | null

    createdBy?: Types.ObjectId
    deletedAt: Date | null
    deletedBy?: Types.ObjectId

    createdAt: Date
    updatedAt: Date
}

const EmailContactSchema = new Schema<IEmailContact>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
            index: true,
        },

        email: { type: String, required: true, trim: true },
        emailNormalized: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        company: { type: String, trim: true },

        marketingConsent: { type: Boolean, default: false, required: true },
        consentSource: String,
        consentAt: Date,
        consentWithdrawnAt: { type: Date, default: null },

        tags: { type: [String], default: [] },
        customFields: { type: Map, of: String, default: {} },

        importBatchId: { type: Schema.Types.ObjectId, default: null },

        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

// One contact per address per region. Import upserts on this.
EmailContactSchema.index({ region: 1, emailNormalized: 1 }, { unique: true })

// The contacts list, and the eligibility filter when resolving an audience.
EmailContactSchema.index({ region: 1, marketingConsent: 1, createdAt: -1 })
EmailContactSchema.index({ region: 1, tags: 1 })

// "Everything that came in with this import", for the import history screen.
EmailContactSchema.index({ importBatchId: 1 })

softDeletePlugin(EmailContactSchema)
ensureAuditPlugin(EmailContactSchema, ENTITY_TYPE.EMAIL_CONTACT)
regionScopePlugin(EmailContactSchema)

const EmailContact =
    (mongoose.models.EmailContact as mongoose.Model<IEmailContact>) ||
    mongoose.model<IEmailContact>("EmailContact", EmailContactSchema)

softDeletePlugin(EmailContact.schema)
ensureAuditPlugin(EmailContact.schema, ENTITY_TYPE.EMAIL_CONTACT)
regionScopePlugin(EmailContact.schema)

export default EmailContact
