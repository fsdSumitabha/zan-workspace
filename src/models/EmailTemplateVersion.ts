import mongoose, { Schema, Document, Types } from "mongoose"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { regionScopePlugin } from "@/lib/region-scope"

/**
 * One saved version of a template. Immutable once written.
 *
 * ## MJML is the source of truth, HTML is a build artefact
 *
 * `mjml` is what the editor edits and what an import brings in. `html` is
 * what we send. The server compiles one into the other with mjml@4.18.0 and
 * refuses the save if it does not compile. The browser's own compile is for
 * the preview only; the client is never trusted to produce the HTML that
 * goes out.
 *
 * ## linkHosts is a security field
 *
 * It holds every host found in the compiled HTML. The click redirect will
 * only ever send a reader to a host in this list, whatever the query string
 * says. That is what closes open redirect. See
 * docs/EMAIL_MARKETING_ARCHITECTURE.md section 10.
 *
 * ## Why it is never edited
 *
 * A campaign pins a version id. If a version could change, a report would
 * describe mail that was never sent.
 */
export interface IEmailTemplateVersion extends Document {
    region: RegionCode
    templateId: Types.ObjectId
    /** 1, 2, 3... unique per template. */
    version: number

    /** The editable source. */
    mjml: string
    /** Compiled on the server. What we actually send. */
    html: string
    /** Plain-text alternative, generated from the HTML. */
    text?: string

    /** Every host in the compiled HTML. The click redirect allow-list. */
    linkHosts: string[]
    /** Merge tokens this version uses, for the personalisation screen. */
    mergeTokens: string[]
    /** Non-fatal messages from the MJML compiler. */
    compileWarnings: string[]

    /** Bytes of `html`. Gmail clips a message over about 102 KB. */
    htmlBytes: number

    note?: string
    createdBy?: Types.ObjectId
    createdAt: Date
    updatedAt: Date
}

const EmailTemplateVersionSchema = new Schema<IEmailTemplateVersion>(
    {
        region: {
            type: String,
            enum: REGION_CODES,
            required: true,
        },
        templateId: {
            type: Schema.Types.ObjectId,
            ref: "EmailTemplate",
            required: true,
        },
        version: { type: Number, required: true, min: 1 },

        mjml: { type: String, required: true },
        html: { type: String, required: true },
        text: String,

        linkHosts: { type: [String], default: [] },
        mergeTokens: { type: [String], default: [] },
        compileWarnings: { type: [String], default: [] },

        htmlBytes: { type: Number, default: 0 },

        note: { type: String, maxlength: 500 },
        createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
)

// One version number per template, and the "latest version" lookup.
EmailTemplateVersionSchema.index({ templateId: 1, version: -1 }, { unique: true })

// No soft delete and no audit plugin. A version is immutable, and it is
// deleted only with its template.
regionScopePlugin(EmailTemplateVersionSchema)

const EmailTemplateVersion =
    (mongoose.models.EmailTemplateVersion as mongoose.Model<IEmailTemplateVersion>) ||
    mongoose.model<IEmailTemplateVersion>(
        "EmailTemplateVersion",
        EmailTemplateVersionSchema
    )

regionScopePlugin(EmailTemplateVersion.schema)

export default EmailTemplateVersion
