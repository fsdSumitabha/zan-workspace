import mongoose, { Schema } from "mongoose"

/**
 * Single-document collection that caches the operations-dashboard stat
 * counters. There's only ever one row (fixed string `_id`); the route
 * handler refreshes it lazily on a TTL.
 */

export interface IStatsSnapshot {
    _id: string
    leads: number
    activeClients: number
    projectsRunning: number
    meetingsThisWeek: number
    createdAt: Date
    updatedAt: Date
}

const StatsSnapshotSchema = new Schema<IStatsSnapshot>(
    {
        _id: { type: String, required: true },
        leads: { type: Number, default: 0 },
        activeClients: { type: Number, default: 0 },
        projectsRunning: { type: Number, default: 0 },
        meetingsThisWeek: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        collection: "stats_snapshots",
    }
)

const StatsSnapshot =
    mongoose.models.StatsSnapshot ||
    mongoose.model<IStatsSnapshot>("StatsSnapshot", StatsSnapshotSchema)

export default StatsSnapshot
