import mongoose, { Schema, Document, Query } from "mongoose"
import { PROJECT_STATUS } from "@/constants/projectStatus"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { statsInvalidatePlugin } from "@/lib/stats/statsInvalidatePlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { regionScopePlugin } from "@/lib/region-scope"
import type { Types } from "mongoose"

export interface IProject extends Document {
    // Which sales region owns this record. Denormalised from the parent so
    // reads never need a join. See docs/region-rollout.md.
    region?: RegionCode
    clientId: mongoose.Types.ObjectId
    companyName?: string
    title: string
    description?: string
    serviceType?: string

    status: number

    budget?: number

    lastInteractionAt?: Date
    lastInteractionId?: mongoose.Types.ObjectId
    createdBy?: mongoose.Types.ObjectId
    deletedAt: Date | null
    deletedBy?: mongoose.Types.ObjectId
}

const ProjectSchema = new Schema<IProject>(
    {
        // Not required yet. Existing rows are backfilled by
        // `npm run db:backfill-region`. Stamped on create by regionScopePlugin.
        region: {
            type: String,
            enum: REGION_CODES,
            index: true
        },
        clientId: {
            type: Schema.Types.ObjectId,
            ref: "Client",
            required: true
        },
        companyName: String,
        title: { type: String, required: true },
        description: String,
        serviceType: String,

        status: {
            type: Number,
            default: PROJECT_STATUS.DISCUSSION,
            required: true
        },

        budget: Number,

        lastInteractionAt: Date,
        lastInteractionId: {
            type: Schema.Types.ObjectId,
            ref: "Interaction"
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        deletedAt: { type: Date, default: null },
        deletedBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
    },
    { timestamps: true }
)

ProjectSchema.pre(/^find/, function (this: Query<any, IProject>) {
    this.where({ deletedAt: null })
})

ensureAuditPlugin(ProjectSchema, ENTITY_TYPE.PROJECT)
statsInvalidatePlugin(ProjectSchema)

regionScopePlugin(ProjectSchema, {
    inheritFrom: (doc) =>
        doc.clientId ? { model: "Client", id: doc.clientId as Types.ObjectId } : null,
})

const Project =
    mongoose.models.Project ||
    mongoose.model<IProject>("Project", ProjectSchema)

ensureAuditPlugin(Project.schema, ENTITY_TYPE.PROJECT)
statsInvalidatePlugin(Project.schema)

regionScopePlugin(Project.schema, {
    inheritFrom: (doc) =>
        doc.clientId ? { model: "Client", id: doc.clientId as Types.ObjectId } : null,
})

export default Project