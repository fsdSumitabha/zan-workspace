import mongoose, { Schema } from "mongoose"
import { addAdRecordIndexes, adRecordFields, type IAdRecord } from "./adRecord"

/**
 * A lead form (Meta calls it an Instant Form).
 *
 * A form belongs to a Facebook page, not to an ad. Many ads can open the
 * same form, so a form has no parent here. The Ad points at the form.
 * See docs/ad-tracking.md section 2.
 *
 * Not to be confused with src/components/admin/operations/LeadForm.tsx,
 * which is the screen for adding a lead by hand.
 */
export interface ILeadFormQuestion {
    /** The column header in the export, such as "when_are_you_looking_to_start?". */
    key: string
    /** The question as a person reads it: "When are you looking to start?". */
    label: string
}

export interface ILeadForm extends IAdRecord {
    /** The Facebook page that owns the form. Filled by an API sync. */
    pageId?: string
    locale?: string
    privacyPolicyUrl?: string
    /** The custom questions of the form, collected from the sheets that carried answers to them. */
    questions: ILeadFormQuestion[]
}

const QuestionSchema = new Schema<ILeadFormQuestion>(
    {
        key: { type: String, required: true },
        label: { type: String, required: true },
    },
    { _id: false }
)

const LeadFormSchema = new Schema<ILeadForm>(
    {
        ...adRecordFields,

        pageId: String,
        locale: String,
        privacyPolicyUrl: String,
        questions: { type: [QuestionSchema], default: [] },
    },
    { timestamps: true }
)

addAdRecordIndexes(LeadFormSchema)

const LeadForm =
    (mongoose.models.LeadForm as mongoose.Model<ILeadForm>) ||
    mongoose.model<ILeadForm>("LeadForm", LeadFormSchema)

export default LeadForm
