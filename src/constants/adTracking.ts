/**
 * Ad tracking: where a lead came from, and the bulk lead import.
 *
 * See docs/ad-tracking.md for the model relations and the import rules.
 */

/**
 * The ad platform a lead or an ad record belongs to.
 *
 * Stored as text, not a number, because the same value is sent to and read
 * from the platforms' own APIs later. Do not rename a value that has data.
 */
export const AD_PLATFORM = {
    META: "META",
    GOOGLE: "GOOGLE",
    OTHER: "OTHER",
} as const

export type AdPlatform = (typeof AD_PLATFORM)[keyof typeof AD_PLATFORM]

export const AD_PLATFORMS = Object.values(AD_PLATFORM) as AdPlatform[]

export const AD_PLATFORM_META: Record<AdPlatform, { label: string; short: string; chip: string; importable: boolean }> = {
    META: {
        label: "Meta (Facebook and Instagram)",
        short: "Meta",
        chip: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
        importable: true,
    },
    GOOGLE: {
        label: "Google Ads",
        short: "Google",
        chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
        // No Google sheet format is supported yet. The value exists so the
        // models and the Lead enum need no change when it is added.
        importable: false,
    },
    OTHER: {
        label: "Other (a list with no ad columns)",
        short: "Other",
        chip: "bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-300",
        importable: true,
    },
}

export function isAdPlatform(value: unknown): value is AdPlatform {
    return AD_PLATFORMS.includes(value as AdPlatform)
}

/**
 * The four kinds of ad record.
 *
 *   Campaign  ->  Ad set  ->  Ad   (each one belongs to the one before)
 *   Lead form                     (used by ads, belongs to none of them)
 *
 * `model` is the Mongoose model name. It is also the value saved in
 * Lead.sourceReferenceModel, so never rename it.
 * `segment` is the URL part of the pages and the API.
 */
export const AD_KIND = {
    CAMPAIGN: "campaign",
    AD_SET: "adSet",
    AD: "ad",
    FORM: "form",
} as const

export type AdKind = (typeof AD_KIND)[keyof typeof AD_KIND]

export const AD_KIND_META: Record<
    AdKind,
    { model: AdModelName; label: string; plural: string; segment: string }
> = {
    campaign: { model: "AdCampaign", label: "Campaign", plural: "Campaigns", segment: "campaigns" },
    adSet: { model: "AdSet", label: "Ad set", plural: "Ad sets", segment: "ad-sets" },
    ad: { model: "Ad", label: "Ad", plural: "Ads", segment: "ads" },
    form: { model: "LeadForm", label: "Lead form", plural: "Lead forms", segment: "forms" },
}

export const AD_KINDS = Object.keys(AD_KIND_META) as AdKind[]

/** The URL segment back to the kind, or null. "ad-sets" gives "adSet". */
export function adKindFromSegment(segment: string): AdKind | null {
    return AD_KINDS.find((k) => AD_KIND_META[k].segment === segment) ?? null
}

/**
 * The models a Lead can point at through `sourceReference`.
 *
 * The order is the order of preference. A lead points at the most specific
 * record of the ad chain it has: the Ad, else the Ad set, else the Campaign.
 * Only a lead with none of those (an organic lead) points at the Lead form.
 * Lead.leadForm holds the form separately, for every lead that has one.
 */
export const SOURCE_REFERENCE_MODELS = ["Ad", "AdSet", "AdCampaign", "LeadForm"] as const

export type AdModelName = (typeof SOURCE_REFERENCE_MODELS)[number]

export const AD_MODEL_KIND: Record<AdModelName, AdKind> = {
    AdCampaign: "campaign",
    AdSet: "adSet",
    Ad: "ad",
    LeadForm: "form",
}

/** The result of one sheet row in a lead import report. */
export const LEAD_IMPORT_ROW_RESULT = {
    IMPORTED: 10,
    WARNED: 20,
    DUPLICATE: 30,
    FAILED: 40,
} as const

export type LeadImportRowResult =
    (typeof LEAD_IMPORT_ROW_RESULT)[keyof typeof LEAD_IMPORT_ROW_RESULT]

export const LEAD_IMPORT_ROW_RESULT_META: Record<
    LeadImportRowResult,
    { label: string; preview: string; chip: string; row: string; excelFill: string }
> = {
    10: {
        label: "Imported",
        preview: "Will import",
        chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
        row: "",
        excelFill: "#E2F5EA",
    },
    20: {
        label: "Imported with warnings",
        preview: "Will import, with warnings",
        chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
        row: "bg-amber-50/60 dark:bg-amber-500/5",
        excelFill: "#FFF4D6",
    },
    30: {
        label: "Duplicate",
        preview: "Duplicate",
        chip: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
        row: "bg-sky-50/60 dark:bg-sky-500/5",
        excelFill: "#E0F0FB",
    },
    40: {
        label: "Failed",
        preview: "Will fail",
        chip: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
        row: "bg-rose-50/70 dark:bg-rose-500/5",
        excelFill: "#FDE2E2",
    },
}

export function isImportedResult(result: number): boolean {
    return result === LEAD_IMPORT_ROW_RESULT.IMPORTED || result === LEAD_IMPORT_ROW_RESULT.WARNED
}

/** Status of one import. Same codes as UPLOAD_STATUS of lead sources. */
export const LEAD_IMPORT_STATUS = {
    PROCESSING: 10,
    DONE: 20,
    FAILED: 30,
} as const

export type LeadImportStatus = (typeof LEAD_IMPORT_STATUS)[keyof typeof LEAD_IMPORT_STATUS]

/** Counts of one import. Kept in one place so the model, API and UI agree. */
export interface LeadImportCounts {
    read: number
    imported: number
    warned: number
    duplicates: number
    failed: number
    /**
     * Duplicates whose lead had no ad yet, and was linked to the ad on its
     * row. Leads that came in through the Facebook webhook are the usual case.
     */
    linked: number
}

/** How many ad records an import created, by kind. */
export interface AdSourceCounts {
    campaigns: number
    adSets: number
    ads: number
    forms: number
}

export const EMPTY_IMPORT_COUNTS: LeadImportCounts = { read: 0, imported: 0, warned: 0, duplicates: 0, failed: 0, linked: 0 }
export const EMPTY_SOURCE_COUNTS: AdSourceCounts = { campaigns: 0, adSets: 0, ads: 0, forms: 0 }
