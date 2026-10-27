import mongoose, { Schema, Document, Types } from "mongoose"
import { PUSH_PLATFORM, type PushPlatform } from "@/constants/pushDevice"


// One row per browser or phone app that receives push notifications.
export interface IPushDevice extends Document {
    user: Types.ObjectId;

    // Firebase Installation ID (FID). Firebase gives one to each browser and
    // to each install of the phone app.
    fid: string;

    platform: PushPlatform;          // PUSH_PLATFORM code. Rows saved before this field are browsers.
    appVersion?: string;             // the phone app's version, e.g. "1.4.0". Browsers send none.

    createdAt: Date;                 // from timestamps
    updatedAt: Date;                 // moves forward on every visit or app start
}

const PushDeviceSchema = new Schema<IPushDevice>({
    user:       { type: Schema.Types.ObjectId, ref: "User", required: true },
    fid:        { type: String, required: true, unique: true },   // a device belongs to one user at a time
    platform:   { type: Number, enum: Object.values(PUSH_PLATFORM), default: PUSH_PLATFORM.WEB },
    appVersion: { type: String, maxlength: 40 },
}, { timestamps: true });

PushDeviceSchema.index({ user: 1 });                                                   // the send lookup
PushDeviceSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });  // drop devices not seen for 60 days


export default mongoose.models.PushDevice ||
    mongoose.model<IPushDevice>("PushDevice", PushDeviceSchema);
