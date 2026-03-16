import mongoose from "mongoose"

const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    role: {
        type: String,
        enum: ["ADMIN", "MANAGER", "DEVELOPER", "MARKETING", "HR", "SALES", "SUPPORT"],
    }
}, { timestamps: true })

export default mongoose.model("User", UserSchema)