import mongoose, { Schema, Document, Types } from "mongoose"
import { EventType } from "@/constants/eventTypes";


export interface INotification extends Document {
    recipient: Types.ObjectId;
    event?: Types.ObjectId;

    type: EventType;                 // EVENT_TYPE code, e.g. 2210
    actor: Types.ObjectId | null;

    entityType: number;              // ENTITY_TYPE code
    entityId: Types.ObjectId;

    title: string;
    body?: string;
    url?: string;
    badge: string;
    imageUrl?: string;

    seenAt: Date | null;
    readAt: Date | null;

    channels: number[];
    meta?: Record<string, unknown>;

    createdAt: Date;                 // from timestamps
    updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>({
    recipient:  { type: Schema.Types.ObjectId, ref: "User", required: true },
    event:      { type: Schema.Types.ObjectId, ref: "Event" },   // optional back-reference

    type:       { type: Number, required: true },   // EVENT_TYPE code, e.g. 2210
    actor:      { type: Schema.Types.ObjectId, ref: "User", default: null },

    // what it's about (polymorphic via your numeric ENTITY_TYPE)
    entityType: { type: Number, required: true },
    entityId:   { type: Schema.Types.ObjectId, required: true },

    // rendered snapshot — your poll endpoint returns these directly, no populate/join
    title:      { type: String, required: true },
    body:       { type: String },
    url:        { type: String },                   // deep link to the entity
    badge:      { type: String, required: true },    // short text for badge counts, e.g. "5"
    imageUrl:   { type: String },                   // optional thumbnail

    // per-user state (split so you can clear the badge without marking read)
    seenAt:     { type: Date, default: null },
    readAt:     { type: Date, default: null },

    channels:   { type: [Number], default: [/* IN_APP */] },  // FCM/email later
    meta:       { type: Schema.Types.Mixed },
}, { timestamps: true });

NotificationSchema.index({ recipient: 1, createdAt: -1 });  // the poll feed
NotificationSchema.index({ recipient: 1, readAt: 1 });      // unread count
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30-day TTL


export default mongoose.models.Notification ||
    mongoose.model<INotification>("Notification", NotificationSchema);