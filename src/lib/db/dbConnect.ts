import mongoose from "mongoose";
import { registerAuditPluginsOnModels } from "@/lib/activity-log/registerModels";
import { registerStatsInvalidatorOnModels } from "@/lib/stats/registerStatsInvalidator";

// Load models so registerAuditPluginsOnModels can attach hooks in Next.js
import "@/models/User";
import "@/models/Lead";
import "@/models/Client";
import "@/models/Project";
import "@/models/Interaction";
import "@/models/Call";
import "@/models/Meeting";
import "@/models/Document";
import "@/models/Quotation";
import "@/models/ActivityLog";
import "@/models/StatsSnapshot";
import "@/models/LeadSource";
import "@/models/LeadSourceUpload";

// Email marketing. These must be imported here too, or
// `mongoose.modelNames()` does not see them and `npm run db:indexes`
// silently skips every index they declare. The unique index on
// CampaignRecipient { campaignId, emailNormalized } is what stops a person
// being emailed twice by one campaign, so it has to exist before the first
// send. See docs/EMAIL_MARKETING_DATABASE_SCHEMA.md section 7.
import "@/models/EmailCampaign";
import "@/models/CampaignRecipient";
import "@/models/EmailTemplate";
import "@/models/EmailTemplateVersion";
import "@/models/EmailAudience";
import "@/models/EmailContact";
import "@/models/EmailDeliveryAttempt";
import "@/models/EmailTrackingEvent";
import "@/models/EmailSuppression";
import "@/models/EmailAsset";
import "@/models/EmailSenderIdentity";
import "@/models/EmailProviderConfig";
import "@/models/EmailDeliveryConfig";
import "@/models/EmailRateCounter";
import "@/models/EmailDispatchLock";

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
    throw new Error("Please define MONGODB_URI in .env.local");
}

interface MongooseCache {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

// Extend global type
declare global {
    var mongooseCache: MongooseCache | undefined;
}

const cached = global.mongooseCache || {
    conn: null,
    promise: null
};

global.mongooseCache = cached;

export default async function dbConnect() {
    if (cached.conn) {
        registerAuditPluginsOnModels();
        registerStatsInvalidatorOnModels();
        return cached.conn;
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false
        });
    }

    cached.conn = await cached.promise;
    registerAuditPluginsOnModels();
    registerStatsInvalidatorOnModels();
    return cached.conn;
}