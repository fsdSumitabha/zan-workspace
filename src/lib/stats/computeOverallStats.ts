import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import Meeting from "@/models/Meeting"
import User from "@/models/User"

import { LEAD_STATUS } from "@/constants/leadStatus"
import { CLIENT_STATUS } from "@/constants/clientStatus"
import { PROJECT_STATUS } from "@/constants/projectStatus"
import { MEETING_STATUS } from "@/constants/meetingStatus"

const RUNNING_PROJECT_STATUSES = [
    PROJECT_STATUS.CONFIRMED,
    PROJECT_STATUS.IN_PROGRESS,
    PROJECT_STATUS.DEPLOYED,
    PROJECT_STATUS.MAINTENANCE,
] as const

interface StatusRow {
    _id: number
    count: number
}

function lookupCount(rows: StatusRow[], status: number): number {
    return rows.find((r) => r._id === status)?.count ?? 0
}

function firstValue(rows: Array<{ v?: number }> | undefined): number {
    if (!rows || rows.length === 0) return 0
    return rows[0].v ?? 0
}

function firstSum(rows: Array<{ sum?: number }> | undefined): number {
    if (!rows || rows.length === 0) return 0
    return rows[0].sum ?? 0
}

/**
 * Computes per-entity counts + named rollups across leads, clients,
 * projects, meetings, and users. Runs five `$facet` aggregations in
 * parallel — one collection scan per model.
 */
export async function computeOverallStats() {
    const now = new Date()

    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)

    const weekFromNow = new Date(now)
    weekFromNow.setDate(weekFromNow.getDate() + 7)

    const [leadAgg, clientAgg, projectAgg, meetingAgg, userAgg] =
        await Promise.all([
            Lead.aggregate([
                { $match: { deletedAt: null } },
                {
                    $facet: {
                        total: [{ $count: "v" }],
                        byStatus: [
                            { $group: { _id: "$status", count: { $sum: 1 } } },
                        ],
                    },
                },
            ]),

            Client.aggregate([
                {
                    $facet: {
                        total: [{ $count: "v" }],
                        byStatus: [
                            { $group: { _id: "$status", count: { $sum: 1 } } },
                        ],
                    },
                },
            ]),

            Project.aggregate([
                {
                    $facet: {
                        total: [{ $count: "v" }],
                        byStatus: [
                            { $group: { _id: "$status", count: { $sum: 1 } } },
                        ],
                        budgetRunning: [
                            {
                                $match: {
                                    status: { $in: RUNNING_PROJECT_STATUSES },
                                },
                            },
                            {
                                $group: {
                                    _id: null,
                                    sum: {
                                        $sum: {
                                            $ifNull: ["$budget", 0],
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
            ]),

            Meeting.aggregate([
                {
                    $facet: {
                        total: [{ $count: "v" }],
                        byStatus: [
                            { $group: { _id: "$status", count: { $sum: 1 } } },
                        ],
                        today: [
                            {
                                $match: {
                                    scheduledAt: {
                                        $gte: todayStart,
                                        $lte: todayEnd,
                                    },
                                },
                            },
                            { $count: "v" },
                        ],
                        thisWeek: [
                            {
                                $match: {
                                    scheduledAt: {
                                        $gte: now,
                                        $lte: weekFromNow,
                                    },
                                },
                            },
                            { $count: "v" },
                        ],
                        upcoming: [
                            {
                                $match: {
                                    scheduledAt: { $gte: now },
                                    status: { $ne: MEETING_STATUS.CANCELLED },
                                },
                            },
                            { $count: "v" },
                        ],
                    },
                },
            ]),

            User.aggregate([
                { $match: { deletedAt: null } },
                {
                    $facet: {
                        total: [{ $count: "v" }],
                        active: [
                            { $match: { isActive: true } },
                            { $count: "v" },
                        ],
                        inactive: [
                            { $match: { isActive: false } },
                            { $count: "v" },
                        ],
                        byRole: [
                            { $group: { _id: "$role", count: { $sum: 1 } } },
                        ],
                    },
                },
            ]),
        ])

    // ── Leads ──────────────────────────────────────────────────────
    const leadRows = (leadAgg[0]?.byStatus ?? []) as StatusRow[]
    const leadsByStatus = {
        new: lookupCount(leadRows, LEAD_STATUS.NEW),
        contacted: lookupCount(leadRows, LEAD_STATUS.CONTACTED),
        meeting: lookupCount(leadRows, LEAD_STATUS.MEETING),
        discussion: lookupCount(leadRows, LEAD_STATUS.DISCUSSION),
        negotiation: lookupCount(leadRows, LEAD_STATUS.NEGOTIATION),
        converted: lookupCount(leadRows, LEAD_STATUS.CONVERTED),
        lost: lookupCount(leadRows, LEAD_STATUS.LOST),
    }
    const leadTotal = firstValue(leadAgg[0]?.total)
    const leadActive =
        leadTotal - leadsByStatus.converted - leadsByStatus.lost
    const terminal = leadsByStatus.converted + leadsByStatus.lost
    const conversionRate =
        terminal > 0 ? leadsByStatus.converted / terminal : null

    // ── Clients ────────────────────────────────────────────────────
    const clientRows = (clientAgg[0]?.byStatus ?? []) as StatusRow[]
    const clientsByStatus = {
        active: lookupCount(clientRows, CLIENT_STATUS.ACTIVE),
        inactive: lookupCount(clientRows, CLIENT_STATUS.INACTIVE),
        onHold: lookupCount(clientRows, CLIENT_STATUS.ON_HOLD),
        completed: lookupCount(clientRows, CLIENT_STATUS.COMPLETED),
    }

    // ── Projects ───────────────────────────────────────────────────
    const projectRows = (projectAgg[0]?.byStatus ?? []) as StatusRow[]
    const projectsByStatus = {
        discussion: lookupCount(projectRows, PROJECT_STATUS.DISCUSSION),
        proposalSent: lookupCount(projectRows, PROJECT_STATUS.PROPOSAL_SENT),
        negotiation: lookupCount(projectRows, PROJECT_STATUS.NEGOTIATION),
        confirmed: lookupCount(projectRows, PROJECT_STATUS.CONFIRMED),
        inProgress: lookupCount(projectRows, PROJECT_STATUS.IN_PROGRESS),
        deployed: lookupCount(projectRows, PROJECT_STATUS.DEPLOYED),
        maintenance: lookupCount(projectRows, PROJECT_STATUS.MAINTENANCE),
        closed: lookupCount(projectRows, PROJECT_STATUS.CLOSED),
    }
    const projectPipeline =
        projectsByStatus.discussion +
        projectsByStatus.proposalSent +
        projectsByStatus.negotiation
    const projectRunning =
        projectsByStatus.confirmed +
        projectsByStatus.inProgress +
        projectsByStatus.deployed +
        projectsByStatus.maintenance

    // ── Meetings ───────────────────────────────────────────────────
    const meetingRows = (meetingAgg[0]?.byStatus ?? []) as StatusRow[]
    const meetingsByStatus = {
        scheduled: lookupCount(meetingRows, MEETING_STATUS.SCHEDULED),
        rescheduled: lookupCount(meetingRows, MEETING_STATUS.RESCHEDULED),
        cancelled: lookupCount(meetingRows, MEETING_STATUS.CANCELLED),
        missed: lookupCount(meetingRows, MEETING_STATUS.MISSED),
        completed: lookupCount(meetingRows, MEETING_STATUS.COMPLETED),
    }

    // ── Users ──────────────────────────────────────────────────────
    const userRoleRows = (userAgg[0]?.byRole ?? []) as StatusRow[]
    const usersByRole: Record<number, number> = {}
    for (const row of userRoleRows) {
        usersByRole[row._id] = row.count
    }

    return {
        leads: {
            total: leadTotal,
            byStatus: leadsByStatus,
            active: leadActive,
            converted: leadsByStatus.converted,
            lost: leadsByStatus.lost,
            conversionRate,
        },
        clients: {
            total: firstValue(clientAgg[0]?.total),
            byStatus: clientsByStatus,
        },
        projects: {
            total: firstValue(projectAgg[0]?.total),
            byStatus: projectsByStatus,
            pipeline: projectPipeline,
            running: projectRunning,
            closed: projectsByStatus.closed,
            totalBudgetRunning: firstSum(projectAgg[0]?.budgetRunning),
        },
        meetings: {
            total: firstValue(meetingAgg[0]?.total),
            byStatus: meetingsByStatus,
            today: firstValue(meetingAgg[0]?.today),
            thisWeek: firstValue(meetingAgg[0]?.thisWeek),
            upcoming: firstValue(meetingAgg[0]?.upcoming),
        },
        users: {
            total: firstValue(userAgg[0]?.total),
            active: firstValue(userAgg[0]?.active),
            inactive: firstValue(userAgg[0]?.inactive),
            byRole: usersByRole,
        },
        updatedAt: new Date().toISOString(),
    }
}
