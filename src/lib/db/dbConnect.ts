import mongoose from "mongoose";
import { registerAuditPluginsOnModels } from "@/lib/activity-log/registerModels";

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
        return cached.conn;
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false
        });
    }

    cached.conn = await cached.promise;
    registerAuditPluginsOnModels();
    return cached.conn;
}