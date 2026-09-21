import { Query } from "mongoose"
import { UserRole } from "@/constants/userRoles"
import mongoose, { Schema, Document } from "mongoose"
import { USER_ROLE_META } from "@/constants/userRoles"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { REGION_CODES, type RegionCode } from "@/lib/region"
import { regionScopePlugin } from "@/lib/region-scope"

export interface IUser extends Document {
    name: string
    email: string
    password: string

    role: UserRole

    // Regions this user may read and write. Admin holds every code.
    // Never empty: an empty array means the user sees nothing at all.
    regions: RegionCode[]

    isActive: boolean

    lastLoginAt?: Date
    createdBy?: mongoose.Types.ObjectId

    avatar?: string

    deletedAt: Date | null

    createdAt: Date
    updatedAt: Date
}

const UserSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        password: {
            type: String,
            required: true
        },

        role: {
            type: Number,
            required: true,
            validate: {
                validator: (val: number) => val in USER_ROLE_META,
                message: "Invalid user role"
            }
        },

        // Required on purpose, with no default.
        //
        // A user with no regions is denied every query by
        // regionScopePlugin. That is the safe failure, but it looks like
        // an empty database to the person signed in. Failing loudly at
        // create time is better than a silent lockout later.
        //
        // Existing rows are filled by `npm run db:backfill-region`.
        regions: {
            type: [String],
            enum: REGION_CODES,
            required: true,
            index: true,
            validate: {
                validator: (val: string[]) => Array.isArray(val) && val.length > 0,
                message: "A user needs at least one region"
            }
        },

        isActive: {
            type: Boolean,
            default: true
        },

        lastLoginAt: Date,

        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },

        avatar: String,

        deletedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
)

UserSchema.pre(/^find/, function (this: Query<any, IUser>) {
    this.where({ deletedAt: null })
})

ensureAuditPlugin(UserSchema, ENTITY_TYPE.USER)
regionScopePlugin(UserSchema, { field: "regions", stampOnCreate: false })

const User =
    mongoose.models.User || mongoose.model<IUser>("User", UserSchema)

ensureAuditPlugin(User.schema, ENTITY_TYPE.USER)
regionScopePlugin(User.schema, { field: "regions", stampOnCreate: false })

export default User