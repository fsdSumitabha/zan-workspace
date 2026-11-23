import type {
    AdKind,
    AdModelName,
    AdPlatform,
    AdSourceCounts,
    LeadImportCounts,
} from "@/constants/adTracking"

/** One past import, without its rows. */
export interface LeadImportSummary {
    _id: string
    region: string
    platform: AdPlatform
    source: string
    fileName: string
    status: number
    error?: string
    uploadedBy: { _id: string; name: string } | null
    counts: LeadImportCounts
    newSources: AdSourceCounts
    createdAt: string
}

export interface LeadImportColumnView {
    key: string
    header: string
    label: string
    /** false for a question column. */
    known: boolean
}

export interface LeadImportRowView {
    n: number
    values: string[]
    result: number
    messages: string[]
    leadId?: string
}

export interface LeadImportBreakdownView {
    _id: string
    externalId: string
    name: string
    imported: number
    duplicates: number
    failed: number
}

export interface LeadImportReport extends LeadImportSummary {
    sheetName?: string
    headerRow?: number
    columns: LeadImportColumnView[]
    fileNotes: string[]
    rows: LeadImportRowView[]
    breakdown: {
        campaigns: LeadImportBreakdownView[]
        adSets: LeadImportBreakdownView[]
        ads: LeadImportBreakdownView[]
        forms: LeadImportBreakdownView[]
    }
}

/** What the check step returns. Nothing is saved yet. */
export interface LeadImportCheck {
    check: true
    fileName: string
    sheetName: string
    headerRow: number
    platform: AdPlatform
    columns: LeadImportColumnView[]
    fileNotes: string[]
    rows: LeadImportRowView[]
    counts: LeadImportCounts
    newSources: AdSourceCounts
}

export interface LeadImportDone {
    check: false
    importId: string
    counts: LeadImportCounts
    newSources: AdSourceCounts
}

/** Lead counts for one ad record. Region-scoped: only leads the viewer can see. */
export interface AdLeadStats {
    total: number
    open: number
    converted: number
    lost: number
    lastLeadAt: string | null
}

export interface AdRecordLink {
    _id: string
    kind: AdKind
    name: string
    externalId: string
}

/** One row of a list page. */
export interface AdRecordRow {
    _id: string
    kind: AdKind
    platform: AdPlatform
    externalId: string
    name: string
    status?: string
    /** The records above this one, top first: campaign, then ad set. */
    parents: AdRecordLink[]
    /** For an ad: the form it opens. */
    form?: AdRecordLink | null
    stats: AdLeadStats
    lastSeenAt: string | null
    createdAt: string
}

export interface AdRecordLead {
    _id: string
    name: string
    phone: string
    status: number
    source: string
    submittedAt: string | null
    createdAt: string
    /** The record the lead points at, when it is not this one (a child). */
    via?: AdRecordLink | null
}

export interface AdRecordDetail extends AdRecordRow {
    aliases: string[]
    /** Fields an API sync fills: objective, budgets, dates and so on. Empty today. */
    platformFields: Array<{ label: string; value: string }>
    syncedAt: string | null
    createdBy: { _id: string; name: string } | null
    /** Lead counts by LEAD_STATUS code. */
    byStatus: Record<string, number>
    /** For a form: leads with no ad (organic) and with an ad (paid). */
    organic?: number
    paid?: number
    /** Campaign: its ad sets. Ad set: its ads. Form: the ads that open it. */
    children: { kind: AdKind; rows: AdRecordRow[] } | null
    /** Form: the questions seen on its leads. */
    questions?: Array<{ key: string; label: string }>
}

/** The ad a lead came from, for the lead page. */
export interface LeadAdSource {
    platform: AdPlatform | null
    /** The model sourceReference points at. */
    referenceModel: AdModelName | null
    campaign: AdRecordLink | null
    adSet: AdRecordLink | null
    ad: AdRecordLink | null
    form: AdRecordLink | null
    /** No ad: the person found the form without an ad. */
    organic: boolean
    submittedAt: string | null
    importId: string | null
    externalLeadId: string | null
}

export interface AdTrackingOverview {
    totals: { campaigns: number; adSets: number; ads: number; forms: number }
    leads: { total: number; last30Days: number; paid: number; organic: number; converted: number }
    topCampaigns: AdRecordRow[]
    recentImports: LeadImportSummary[]
}
