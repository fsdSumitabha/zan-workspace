import mongoose, { Schema, Document, Types } from "mongoose"


// One row per browser that receives push notifications.
export interface IPushDevice extends Document {
    user: Types.ObjectId;

    // Firebase Installation ID (FID). Firebase gives one to each browser.
    fid: string;

    createdAt: Date;                 // from timestamps
    updatedAt: Date;                 // moves forward on every visit
}

const PushDeviceSchema = new Schema<IPushDevice>({
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fid:  { type: String, required: true, unique: true },   // a browser belongs to one user at a time
}, { timestamps: true });

PushDeviceSchema.index({ user: 1 });                                                   // the send lookup
PushDeviceSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });  // drop browsers not seen for 60 days


export default mongoose.models.PushDevice ||
    mongoose.model<IPushDevice>("PushDevice", PushDeviceSchema);
