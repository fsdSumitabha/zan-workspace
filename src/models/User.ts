import { Query } from "mongoose"
import { UserRole } from "@/constants/userRoles"
import mongoose, { Schema, Document } from "mongoose"
import { USER_ROLE_META } from "@/constants/userRoles"
import { ensureAuditPlugin } from "@/lib/activity-log/ensureAuditPlugin"

export interface IUser extends Document {
    name: string
    email: string
    password: string

    role: UserRole

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

ensureAuditPlugin(UserSchema, "USER")

const User =
    mongoose.models.User || mongoose.model<IUser>("User", UserSchema)

ensureAuditPlugin(User.schema, "USER")

export default User