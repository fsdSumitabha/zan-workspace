import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema({

    name: String,

    email: String,

    phone: String,

    address: String,

    status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE", "ON_HOLD"],
        default: "ACTIVE"
    },

    notes: String

}, { timestamps: true })

export default mongoose.model("Client", ClientSchema)