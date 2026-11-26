import { LEAD_STATUS } from "@/constants/leadStatus"
import Ad from "@/models/Ad"
import AdCampaign from "@/models/AdCampaign"
import AdSet from "@/models/AdSet"
import Lead from "@/models/Lead"
import LeadForm from "@/models/LeadForm"
import LeadImport from "@/models/LeadImport"
import type { AdTrackingOverview } from "@/types/adTracking"
import { serializeImportSummary, type RawLeadImport } from "./importView"
import { listRecords } from "./records"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The Ad Tracking front page: how many records of each kind, how many leads
 * came from ads, the five campaigns with the most leads, and the latest
 * imports. Lead numbers are region-scoped, like every Lead query.
 */
export async function getOverview(): Promise<AdTrackingOverview> {
    const since = new Date(Date.now() - 30 * DAY_MS)

    const [campaigns, adSets, ads, forms, leadGroups, top, imports] = await Promise.all([
        AdCampaign.countDocuments({}),
        AdSet.countDocuments({}),
        Ad.countDocuments({}),
        LeadForm.countDocuments({}),
        Lead.aggregate<{ total: number; organic: number; converted: number; last30Days: number }>([
            { $match: { sourceReference: { $ne: null } } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    organic: { $sum: { $cond: [{ $eq: ["$sourceReferenceModel", "LeadForm"] }, 1, 0] } },
                    converted: { $sum: { $cond: [{ $eq: ["$status", LEAD_STATUS.CONVERTED] }, 1, 0] } },
                    last30Days: {
                        $sum: { $cond: [{ $gte: [{ $ifNull: ["$submittedAt", "$createdAt"] }, since] }, 1, 0] },
                    },
                },
            },
        ]),
        listRecords("campaign", { page: 1, limit: 5, sort: "leads" }),
        LeadImport.find({})
            .select("-rows -columns -breakdown")
            .populate("uploadedBy", "name")
            .sort({ createdAt: -1 })
            .limit(5)
            .lean<RawLeadImport[]>(),
    ])

    const g = leadGroups[0] ?? { total: 0, organic: 0, converted: 0, last30Days: 0 }

    return {
        totals: { campaigns, adSets, ads, forms },
        leads: {
            total: g.total,
            last30Days: g.last30Days,
            paid: g.total - g.organic,
            organic: g.organic,
            converted: g.converted,
        },
        topCampaigns: top.rows.filter((r) => r.stats.total > 0),
        recentImports: imports.map(serializeImportSummary),
    }
}
