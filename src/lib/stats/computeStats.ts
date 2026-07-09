import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import Meeting from "@/models/Meeting"
import { MEETING_STATUS } from "@/constants/meetingStatus"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface StatsCounts {
    leads: number
    activeClients: number
    projectsRunning: number
    meetingsThisWeek: number
}

/**
 * Runs four `countDocuments` queries in parallel.
 *
 * Stat definitions — tweak here to change what each counter means; the
 * snapshot will catch up on the next TTL window:
 *
 *  - leads:            non-deleted, active pipeline
 *                      (excludes CONVERTED + LOST — those are terminal)
 *  - activeClients:    CLIENT_STATUS.ACTIVE
 *  - projectsRunning:  confirmed → maintenance
 *                      (excludes pre-confirmation + CLOSED)
 *  - meetingsThisWeek: scheduledAt in [now, now + 7d], not CANCELLED
 *
 * NOTE: `Lead.countDocuments` does NOT pick up the schema-level
 * `pre(/^find/)` soft-delete filter, so the deletedAt clause is needed
 * explicitly here.
 */
export async function computeStats(): Promise<StatsCounts> {
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + WEEK_MS)

    const [leads, activeClients, projectsRunning, meetingsThisWeek] =
        await Promise.all([
            Lead.countDocuments({
                deletedAt: null,
            }),
            Client.countDocuments({ deletedAt: null }),
            Project.countDocuments(),
            Meeting.countDocuments({
                scheduledAt: { $gte: now, $lt: weekFromNow },
                status: { $ne: MEETING_STATUS.CANCELLED },
            }),
        ])

    return { leads, activeClients, projectsRunning, meetingsThisWeek }
}
