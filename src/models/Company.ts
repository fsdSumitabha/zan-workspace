import mongoose from "mongoose";

const CompanySchema = new mongoose.Schema({

    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Client",
        required: true
    },

    name: String,

    industry: String,

    website: String,

    size: String

}, { timestamps: true })

export default mongoose.model("Company", CompanySchema)