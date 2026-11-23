import { Types, type Model, type PipelineStage } from "mongoose"
import {
    AD_KIND_META,
    AD_MODEL_KIND,
    type AdKind,
    type AdModelName,
} from "@/constants/adTracking"
import { LEAD_STATUS } from "@/constants/leadStatus"
import { parseObjectId } from "@/lib/lead-sources/access"
import { LeadSourceError } from "@/lib/lead-sources/http"
import { escapeRegex } from "@/lib/search/escapeRegex"
import Ad from "@/models/Ad"
import AdCampaign from "@/models/AdCampaign"
import AdSet from "@/models/AdSet"
import Lead from "@/models/Lead"
import LeadForm from "@/models/LeadForm"
import type {
    AdLeadStats,
    AdRecordDetail,
    AdRecordLead,
    AdRecordLink,
    AdRecordRow,
    LeadAdSource,
} from "@/types/adTracking"

/**
 * Reads for the Ad Tracking pages.
 *
 * ## How a lead is counted for a campaign
 *
 * A lead points at the most specific record it has, usually the Ad. So
 * "leads of this campaign" means: leads that point at the campaign itself,
 * at any of its ad sets, or at any of its ads. nodesFor() collects those
 * ids, one aggregation counts leads per id, and the counts are added up
 * per campaign. Three queries for a whole page of campaigns.
 *
 * A lead form is counted by Lead.leadForm instead, which every lead with a
 * form has, paid or organic.
 *
 * Every Lead query here goes through the Lead model, so the region scope
 * and soft delete apply: each person counts only the leads they can see.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AD_MODELS: Record<AdKind, Model<any>> = {
    campaign: AdCampaign,
    adSet: AdSet,
    ad: Ad,
    form: LeadForm,
}

type Lean = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const EMPTY_STATS: AdLeadStats = { total: 0, open: 0, converted: 0, lost: 0, lastLeadAt: null }

interface Nodes {
    field: "sourceReference" | "leadForm"
    /** Every id a lead may point at, to the record it counts for. */
    toTarget: Map<string, string>
}

/** The ids whose leads count for each record. See the note at the top. */
async function nodesFor(kind: AdKind, ids: Types.ObjectId[]): Promise<Nodes> {
    const toTarget = new Map(ids.map((id) => [String(id), String(id)]))

    if (kind === "form") return { field: "leadForm", toTarget }

    if (kind === "adSet") {
        const ads = await Ad.find({ adSet: { $in: ids } }).select("_id adSet").lean<Lean[]>()
        for (const ad of ads) toTarget.set(String(ad._id), String(ad.adSet))
    }

    if (kind === "campaign") {
        const [adSets, ads] = await Promise.all([
            AdSet.find({ campaign: { $in: ids } }).select("_id campaign").lean<Lean[]>(),
            Ad.find({ campaign: { $in: ids } }).select("_id campaign").lean<Lean[]>(),
        ])
        for (const s of adSets) toTarget.set(String(s._id), String(s.campaign))
        for (const ad of ads) toTarget.set(String(ad._id), String(ad.campaign))
    }

    return { field: "sourceReference", toTarget }
}

function nodeIds(nodes: Nodes): Types.ObjectId[] {
    return [...nodes.toTarget.keys()].map((id) => new Types.ObjectId(id))
}

/** Lead counts for each record, by id. */
export async function leadStatsFor(kind: AdKind, ids: Types.ObjectId[]): Promise<Map<string, AdLeadStats>> {
    const out = new Map<string, AdLeadStats>()
    if (ids.length === 0) return out

    const nodes = await nodesFor(kind, ids)
    const groups = await Lead.aggregate<{ _id: Types.ObjectId; total: number; converted: number; lost: number; last: Date | null }>([
        { $match: { [nodes.field]: { $in: nodeIds(nodes) } } },
        {
            $group: {
                _id: `$${nodes.field}`,
                total: { $sum: 1 },
                converted: { $sum: { $cond: [{ $eq: ["$status", LEAD_STATUS.CONVERTED] }, 1, 0] } },
                lost: { $sum: { $cond: [{ $eq: ["$status", LEAD_STATUS.LOST] }, 1, 0] } },
                last: { $max: { $ifNull: ["$submittedAt", "$createdAt"] } },
            },
        },
    ])

    for (const g of groups) {
        const target = nodes.toTarget.get(String(g._id))
        if (!target) continue
        const s = out.get(target) ?? { ...EMPTY_STATS }
        s.total += g.total
        s.converted += g.converted
        s.lost += g.lost
        const last = g.last ? new Date(g.last).toISOString() : null
        if (last && (!s.lastLeadAt || last > s.lastLeadAt)) s.lastLeadAt = last
        out.set(target, s)
    }

    for (const s of out.values()) s.open = s.total - s.converted - s.lost
    return out
}

function link(kind: AdKind, doc: Lean | null | undefined): AdRecordLink | null {
    if (!doc || typeof doc !== "object" || !("externalId" in doc)) return null
    return { _id: String(doc._id), kind, name: doc.name ?? "", externalId: doc.externalId ?? "" }
}

/** Fills the parent links a row shows. */
function populateParents(kind: AdKind, query: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (kind === "adSet") return query.populate("campaign", "name externalId")
    if (kind === "ad") {
        return query
            .populate("campaign", "name externalId")
            .populate("adSet", "name externalId")
            .populate("leadForm", "name externalId")
    }
    return query
}

function toRow(kind: AdKind, doc: Lean, stats: AdLeadStats | undefined): AdRecordRow {
    const parents: AdRecordLink[] = []
    if (kind === "adSet" || kind === "ad") {
        const campaign = link("campaign", doc.campaign)
        if (campaign) parents.push(campaign)
    }
    if (kind === "ad") {
        const adSet = link("adSet", doc.adSet)
        if (adSet) parents.push(adSet)
    }

    return {
        _id: String(doc._id),
        kind,
        platform: doc.platform,
        externalId: doc.externalId,
        name: doc.name ?? "",
        ...(doc.status ? { status: doc.status } : {}),
        parents,
        ...(kind === "ad" ? { form: link("form", doc.leadForm) } : {}),
        stats: stats ?? { ...EMPTY_STATS },
        lastSeenAt: doc.lastSeenAt ? new Date(doc.lastSeenAt).toISOString() : null,
        createdAt: new Date(doc.createdAt).toISOString(),
    }
}

export type ListSort = "recent" | "leads" | "name"

/** Most records a "most leads" sort ranks. More than any account here has. */
const RANK_CAP = 5000

export async function listRecords(
    kind: AdKind,
    opts: { search?: string; page: number; limit: number; sort: ListSort }
): Promise<{ rows: AdRecordRow[]; total: number }> {
    const model = AD_MODELS[kind]
    const filter: Record<string, unknown> = {}

    const search = opts.search?.trim()
    if (search) {
        const re = { $regex: escapeRegex(search), $options: "i" }
        filter.$or = [{ name: re }, { aliases: re }, { externalId: re }]
    }

    if (opts.sort === "leads") {
        const all = await model.find(filter).select("_id").limit(RANK_CAP).lean<Lean[]>()
        const ids = all.map((d) => d._id as Types.ObjectId)
        const stats = await leadStatsFor(kind, ids)
        const ranked = ids
            .map((id) => ({ id, total: stats.get(String(id))?.total ?? 0 }))
            .sort((a, b) => b.total - a.total)
        const pageIds = ranked.slice((opts.page - 1) * opts.limit, opts.page * opts.limit).map((r) => r.id)
        const docs = await populateParents(kind, model.find({ _id: { $in: pageIds } })).lean()
        const byId = new Map((docs as Lean[]).map((d) => [String(d._id), d]))
        return {
            rows: pageIds.map((id) => byId.get(String(id))).filter(Boolean).map((d) => toRow(kind, d as Lean, stats.get(String((d as Lean)._id)))),
            total: ids.length,
        }
    }

    const sort: Record<string, 1 | -1> = opts.sort === "name" ? { name: 1, _id: 1 } : { lastSeenAt: -1, _id: -1 }

    const [docs, total] = await Promise.all([
        populateParents(kind, model.find(filter).sort(sort).skip((opts.page - 1) * opts.limit).limit(opts.limit)).lean(),
        model.countDocuments(filter),
    ])

    const list = docs as Lean[]
    const stats = await leadStatsFor(kind, list.map((d) => d._id as Types.ObjectId))
    return { rows: list.map((d) => toRow(kind, d, stats.get(String(d._id)))), total }
}

/** Shown on the detail page when an API sync has filled them. Empty after a sheet import. */
const PLATFORM_FIELDS: Array<{ key: string; label: string; kinds: AdKind[]; date?: boolean }> = [
    { key: "status", label: "Status", kinds: ["campaign", "adSet", "ad", "form"] },
    { key: "adAccountId", label: "Ad account", kinds: ["campaign", "adSet", "ad", "form"] },
    { key: "objective", label: "Objective", kinds: ["campaign"] },
    { key: "buyingType", label: "Buying type", kinds: ["campaign"] },
    { key: "optimizationGoal", label: "Optimisation goal", kinds: ["adSet"] },
    { key: "billingEvent", label: "Billing event", kinds: ["adSet"] },
    { key: "dailyBudget", label: "Daily budget", kinds: ["campaign", "adSet"] },
    { key: "lifetimeBudget", label: "Lifetime budget", kinds: ["campaign", "adSet"] },
    { key: "startTime", label: "Starts", kinds: ["campaign", "adSet"], date: true },
    { key: "stopTime", label: "Stops", kinds: ["campaign"], date: true },
    { key: "endTime", label: "Ends", kinds: ["adSet"], date: true },
    { key: "creativeId", label: "Creative id", kinds: ["ad"] },
    { key: "previewUrl", label: "Preview", kinds: ["ad"] },
    { key: "pageId", label: "Facebook page id", kinds: ["form"] },
    { key: "locale", label: "Language", kinds: ["form"] },
    { key: "privacyPolicyUrl", label: "Privacy policy", kinds: ["form"] },
]

export async function getRecordDetail(kind: AdKind, rawId: string): Promise<AdRecordDetail> {
    const id = parseObjectId(rawId, `${AD_KIND_META[kind].label.toLowerCase()} id`)
    const model = AD_MODELS[kind]

    const doc = (await populateParents(kind, model.findById(id)).populate("createdBy", "name").lean()) as Lean | null
    if (!doc) throw new LeadSourceError(`${AD_KIND_META[kind].label} not found.`, 404)

    const nodes = await nodesFor(kind, [id])
    const match: PipelineStage.Match = { $match: { [nodes.field]: { $in: nodeIds(nodes) } } }

    const [stats, statusGroups, modelGroups, children] = await Promise.all([
        leadStatsFor(kind, [id]),
        Lead.aggregate<{ _id: number; n: number }>([match, { $group: { _id: "$status", n: { $sum: 1 } } }]),
        kind === "form"
            ? Lead.aggregate<{ _id: string | null; n: number }>([match, { $group: { _id: "$sourceReferenceModel", n: { $sum: 1 } } }])
            : Promise.resolve([]),
        childrenOf(kind, id),
    ])

    const byStatus: Record<string, number> = {}
    for (const g of statusGroups) byStatus[String(g._id)] = g.n

    const platformFields = PLATFORM_FIELDS.filter((f) => f.kinds.includes(kind) && doc[f.key] != null && doc[f.key] !== "").map(
        (f) => ({
            label: f.label,
            value: f.date ? new Date(doc[f.key]).toISOString().slice(0, 10) : String(doc[f.key]),
        })
    )

    const createdBy = doc.createdBy && typeof doc.createdBy === "object" && "name" in doc.createdBy
        ? { _id: String(doc.createdBy._id), name: doc.createdBy.name ?? "" }
        : null

    const organic = modelGroups.find((g) => g._id === "LeadForm")?.n ?? 0
    const formTotal = modelGroups.reduce((n, g) => n + g.n, 0)

    return {
        ...toRow(kind, doc, stats.get(String(id))),
        aliases: (doc.aliases ?? []).filter((a: string) => a && a !== doc.name),
        platformFields,
        syncedAt: doc.syncedAt ? new Date(doc.syncedAt).toISOString() : null,
        createdBy,
        byStatus,
        ...(kind === "form" ? { organic, paid: formTotal - organic, questions: doc.questions ?? [] } : {}),
        children,
    }
}

/** Campaign: its ad sets. Ad set: its ads. Form: the ads that open it. */
async function childrenOf(kind: AdKind, id: Types.ObjectId): Promise<AdRecordDetail["children"]> {
    let childKind: AdKind
    let filter: Record<string, unknown>

    if (kind === "campaign") {
        childKind = "adSet"
        filter = { campaign: id }
    } else if (kind === "adSet") {
        childKind = "ad"
        filter = { adSet: id }
    } else if (kind === "form") {
        childKind = "ad"
        filter = { leadForm: id }
    } else {
        return null
    }

    const docs = (await populateParents(childKind, AD_MODELS[childKind].find(filter).sort({ lastSeenAt: -1 }).limit(200)).lean()) as Lean[]
    const stats = await leadStatsFor(childKind, docs.map((d) => d._id as Types.ObjectId))
    const rows = docs.map((d) => toRow(childKind, d, stats.get(String(d._id))))
    rows.sort((a, b) => b.stats.total - a.stats.total)
    return { kind: childKind, rows }
}

export async function listRecordLeads(
    kind: AdKind,
    rawId: string,
    page: number,
    limit: number
): Promise<{ leads: AdRecordLead[]; total: number }> {
    const id = parseObjectId(rawId, `${AD_KIND_META[kind].label.toLowerCase()} id`)
    const nodes = await nodesFor(kind, [id])
    const filter = { [nodes.field]: { $in: nodeIds(nodes) } }

    const [docs, total] = await Promise.all([
        Lead.find(filter)
            .select("name phone status source submittedAt createdAt sourceReference sourceReferenceModel")
            .sort({ submittedAt: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean<Lean[]>(),
        Lead.countDocuments(filter),
    ])

    // "via Ad X" for a lead that points at a child of this record. The
    // names of those children, in one query per model.
    const wanted = new Map<AdModelName, Set<string>>()
    for (const d of docs) {
        const ref = d.sourceReference ? String(d.sourceReference) : null
        if (!ref || ref === String(id) || !d.sourceReferenceModel || kind === "form") continue
        const set = wanted.get(d.sourceReferenceModel) ?? new Set<string>()
        set.add(ref)
        wanted.set(d.sourceReferenceModel, set)
    }
    const names = new Map<string, AdRecordLink>()
    await Promise.all(
        [...wanted].map(async ([modelName, set]) => {
            const childKind = AD_MODEL_KIND[modelName]
            const rows = await AD_MODELS[childKind]
                .find({ _id: { $in: [...set].map((s) => new Types.ObjectId(s)) } })
                .select("name externalId")
                .lean<Lean[]>()
            for (const r of rows) {
                const l = link(childKind, r)
                if (l) names.set(String(r._id), l)
            }
        })
    )

    return {
        leads: docs.map((d) => ({
            _id: String(d._id),
            name: d.name,
            phone: d.phone,
            status: d.status,
            source: d.source,
            submittedAt: d.submittedAt ? new Date(d.submittedAt).toISOString() : null,
            createdAt: new Date(d.createdAt).toISOString(),
            via: d.sourceReference ? names.get(String(d.sourceReference)) ?? null : null,
        })),
        total,
    }
}

/**
 * The ad a lead came from, walked up with populate:
 *
 *   Lead.sourceReference -> Ad -> AdSet -> AdCampaign
 *                            \-> LeadForm
 *
 * Returns null for a lead with no ad tracking at all (typed in by hand).
 */
export async function resolveLeadAdSource(lead: Lean): Promise<LeadAdSource | null> {
    const refModel = (lead.sourceReferenceModel ?? null) as AdModelName | null
    const ref = lead.sourceReference as Types.ObjectId | undefined
    if (!ref && !lead.leadForm && !lead.platform) return null

    let ad: AdRecordLink | null = null
    let adSet: AdRecordLink | null = null
    let campaign: AdRecordLink | null = null
    let form: AdRecordLink | null = null

    if (ref && refModel === "Ad") {
        const doc = await Ad.findById(ref)
            .populate("adSet", "name externalId")
            .populate("campaign", "name externalId")
            .populate("leadForm", "name externalId")
            .lean<Lean>()
        ad = link("ad", doc)
        adSet = link("adSet", doc?.adSet)
        campaign = link("campaign", doc?.campaign)
        form = link("form", doc?.leadForm)
    } else if (ref && refModel === "AdSet") {
        const doc = await AdSet.findById(ref).populate("campaign", "name externalId").lean<Lean>()
        adSet = link("adSet", doc)
        campaign = link("campaign", doc?.campaign)
    } else if (ref && refModel === "AdCampaign") {
        campaign = link("campaign", await AdCampaign.findById(ref).lean<Lean>())
    } else if (ref && refModel === "LeadForm") {
        form = link("form", await LeadForm.findById(ref).lean<Lean>())
    }

    // The form the person filled in. The ad's own form is a fallback only:
    // an ad's form can be changed later, the lead's cannot.
    if (lead.leadForm && String(lead.leadForm) !== form?._id) {
        form = link("form", await LeadForm.findById(lead.leadForm).lean<Lean>()) ?? form
    }

    return {
        platform: lead.platform ?? null,
        referenceModel: refModel,
        campaign,
        adSet,
        ad,
        form,
        organic: !ad && !adSet && !campaign,
        submittedAt: lead.submittedAt ? new Date(lead.submittedAt).toISOString() : null,
        importId: lead.importId ? String(lead.importId) : null,
        externalLeadId: lead.externalLeadId ?? null,
    }
}

