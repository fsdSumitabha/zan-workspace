/**
 * Every numeric code the email marketing module uses.
 *
 * Same rules as leadSourceStatus.ts: the database stores numbers only,
 * labels and colours live in a *_META map, and codes step by 10 so a new
 * value fits between two old ones. Never reuse a retired code.
 */

/* ------------------------------------------------------------------ */
/* Campaign                                                            */
/* ------------------------------------------------------------------ */

/**
 * Where a campaign is in its life.
 *
 * QUEUEING is its own state on purpose. Building the recipient snapshot
 * takes time, and without a state between SCHEDULED and SENDING a second
 * heartbeat would start building the same snapshot again.
 *
 * HALTED is not PAUSED. PAUSED is a person's choice. HALTED is the safety
 * system stopping the campaign because the provider started refusing mail.
 * They need different alerts and different resume rules.
 */
export const CAMPAIGN_STATUS = {
    /** Being written. Nothing is scheduled. */
    DRAFT: 10,
    /** Has a time. Waiting for the dispatcher. */
    SCHEDULED: 20,
    /** The dispatcher is building the recipient snapshot. */
    QUEUEING: 30,
    /** Workers are sending. */
    SENDING: 40,
    /** A person pressed pause. */
    PAUSED: 50,
    /** The safety system stopped it. See `haltedReason`. */
    HALTED: 60,
    /** Every recipient reached a terminal state, none failed. */
    COMPLETED: 70,
    /** Every recipient reached a terminal state, some failed. */
    COMPLETED_WITH_FAILURES: 80,
    /** A person cancelled it. Unsent recipients are CANCELLED. */
    CANCELLED: 90,
    /** The snapshot could not be built. Nothing was sent. */
    FAILED: 100,
    /** Hidden from the main list. Still readable. */
    ARCHIVED: 110,
} as const

export type CampaignStatus =
    (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS]

export const CAMPAIGN_STATUS_META: Record<
    CampaignStatus,
    { label: string; color: string; dot: string; terminal: boolean }
> = {
    10: { label: "Draft", color: "bg-slate-500 text-white", dot: "bg-slate-400", terminal: false },
    20: { label: "Scheduled", color: "bg-violet-600 text-white", dot: "bg-violet-500", terminal: false },
    30: { label: "Preparing", color: "bg-sky-600 text-white", dot: "bg-sky-500", terminal: false },
    40: { label: "Sending", color: "bg-blue-600 text-white", dot: "bg-blue-500", terminal: false },
    50: { label: "Paused", color: "bg-amber-500 text-amber-950", dot: "bg-amber-500", terminal: false },
    60: { label: "Halted", color: "bg-orange-600 text-white", dot: "bg-orange-500", terminal: false },
    70: { label: "Completed", color: "bg-emerald-600 text-white", dot: "bg-emerald-500", terminal: true },
    80: { label: "Completed with failures", color: "bg-yellow-600 text-white", dot: "bg-yellow-500", terminal: true },
    90: { label: "Cancelled", color: "bg-rose-600 text-white", dot: "bg-rose-500", terminal: true },
    100: { label: "Failed", color: "bg-red-700 text-white", dot: "bg-red-600", terminal: true },
    110: { label: "Archived", color: "bg-neutral-500 text-white", dot: "bg-neutral-400", terminal: true },
}

export const CAMPAIGN_STATUSES = Object.values(CAMPAIGN_STATUS) as CampaignStatus[]

export function isCampaignStatus(value: unknown): value is CampaignStatus {
    return (CAMPAIGN_STATUSES as readonly number[]).includes(Number(value))
}

/**
 * Which status may follow which. The only place this is written down.
 *
 * `transitionCampaign` reads it and refuses anything else, so a concurrent
 * pause and cancel cannot both win.
 */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
    10: [20, 30, 90],                 // DRAFT -> scheduled, send now, cancel
    20: [10, 30, 90],                 // SCHEDULED -> unschedule, due, cancel
    30: [40, 100],                    // QUEUEING -> sending, failed
    40: [50, 60, 70, 80, 90],         // SENDING -> pause, halt, finish, cancel
    50: [40, 90],                     // PAUSED -> resume, cancel
    60: [40, 90],                     // HALTED -> admin resume, cancel
    70: [110],                        // COMPLETED -> archive
    80: [110],                        // COMPLETED_WITH_FAILURES -> archive
    90: [110],                        // CANCELLED -> archive
    100: [110],                       // FAILED -> archive
    110: [],                          // ARCHIVED is the end
}

/** Statuses where workers may still claim and send. */
export const CAMPAIGN_ACTIVE_STATUSES: CampaignStatus[] = [
    CAMPAIGN_STATUS.QUEUEING,
    CAMPAIGN_STATUS.SENDING,
]

/* ------------------------------------------------------------------ */
/* Recipient                                                           */
/* ------------------------------------------------------------------ */

/**
 * One recipient's own state. This is the unit that is claimed, leased,
 * retried and reported.
 *
 * SUBMITTED and DELIVERED are different things and must never be added
 * together. SUBMITTED means the SMTP server answered 250. DELIVERED means
 * the provider's webhook confirmed the mail arrived. Gmail reports no
 * deliveries, so with Gmail DELIVERED stays at zero and the UI says the
 * provider does not report it.
 *
 * UNKNOWN_OUTCOME is the honest answer to a worker that crashed between the
 * SMTP accept and the database write. See docs/EMAIL_MARKETING_ARCHITECTURE.md
 * section 6.7. It is never retried by default.
 */
export const RECIPIENT_STATUS = {
    /** In the snapshot. The campaign has not started. */
    PENDING: 10,
    /** Ready to be claimed. */
    QUEUED: 20,
    /** A worker holds a lease on it right now. */
    PROCESSING: 30,
    /** The SMTP server accepted it. Not proof it arrived. */
    SUBMITTED: 40,
    /** The provider confirmed delivery. */
    DELIVERED: 50,
    /** Failed, but it will be tried again after the backoff. */
    RETRYING: 60,
    /** Failed for good. */
    FAILED: 70,
    /** The provider reported a bounce. */
    BOUNCED: 80,
    /** On the suppression list, no consent, or no valid address. */
    SUPPRESSED: 90,
    /** The campaign was cancelled before this one was sent. */
    CANCELLED: 100,
    /** The worker died mid-send. We cannot say whether it went out. */
    UNKNOWN_OUTCOME: 110,
} as const

export type RecipientStatus =
    (typeof RECIPIENT_STATUS)[keyof typeof RECIPIENT_STATUS]

export const RECIPIENT_STATUS_META: Record<
    RecipientStatus,
    { label: string; color: string; dot: string; terminal: boolean }
> = {
    10: { label: "Pending", color: "bg-slate-500 text-white", dot: "bg-slate-400", terminal: false },
    20: { label: "Queued", color: "bg-sky-600 text-white", dot: "bg-sky-500", terminal: false },
    30: { label: "Sending", color: "bg-blue-600 text-white", dot: "bg-blue-500", terminal: false },
    40: { label: "Submitted", color: "bg-emerald-600 text-white", dot: "bg-emerald-500", terminal: true },
    50: { label: "Delivered", color: "bg-emerald-700 text-white", dot: "bg-emerald-600", terminal: true },
    60: { label: "Retrying", color: "bg-amber-500 text-amber-950", dot: "bg-amber-500", terminal: false },
    70: { label: "Failed", color: "bg-rose-600 text-white", dot: "bg-rose-500", terminal: true },
    80: { label: "Bounced", color: "bg-red-700 text-white", dot: "bg-red-600", terminal: true },
    90: { label: "Suppressed", color: "bg-neutral-500 text-white", dot: "bg-neutral-400", terminal: true },
    100: { label: "Cancelled", color: "bg-neutral-600 text-white", dot: "bg-neutral-500", terminal: true },
    110: { label: "Unknown", color: "bg-orange-600 text-white", dot: "bg-orange-500", terminal: true },
}

export const RECIPIENT_STATUSES = Object.values(RECIPIENT_STATUS) as RecipientStatus[]

export function isRecipientStatus(value: unknown): value is RecipientStatus {
    return (RECIPIENT_STATUSES as readonly number[]).includes(Number(value))
}

/** Nothing more will happen to a recipient in one of these. */
export const RECIPIENT_TERMINAL_STATUSES: RecipientStatus[] =
    RECIPIENT_STATUSES.filter((s) => RECIPIENT_STATUS_META[s].terminal)

/* ------------------------------------------------------------------ */
/* Delivery attempts and errors                                        */
/* ------------------------------------------------------------------ */

/**
 * How an SMTP failure is read. It decides whether we try again.
 *
 * AUTH never retries. A wrong password does not get better by being used
 * again, and on a provider that locks accounts it makes things worse.
 */
export const ERROR_CLASS = {
    /** 550, 553, bad address. Never retry. */
    PERMANENT: 10,
    /** 421, 451, timeout, connection reset. Retry with backoff. */
    TRANSIENT: 20,
    /** 454, provider rate error. Retry, and slow the global rate down. */
    THROTTLE: 30,
    /** 535 bad credentials. Halt the campaign and tell an admin. */
    AUTH: 40,
    /** Anything we could not match. Treated as transient, fewer tries. */
    UNKNOWN: 50,
} as const

export type ErrorClass = (typeof ERROR_CLASS)[keyof typeof ERROR_CLASS]

export const ERROR_CLASS_META: Record<ErrorClass, { label: string; retry: boolean }> = {
    10: { label: "Permanent", retry: false },
    20: { label: "Temporary", retry: true },
    30: { label: "Throttled", retry: true },
    40: { label: "Authentication", retry: false },
    50: { label: "Unknown", retry: true },
}

/** What one send attempt ended as. */
export const ATTEMPT_OUTCOME = {
    ACCEPTED: 10,
    REJECTED: 20,
    ERRORED: 30,
    /** The worker died before it could write the result. */
    ABANDONED: 40,
} as const

export type AttemptOutcome =
    (typeof ATTEMPT_OUTCOME)[keyof typeof ATTEMPT_OUTCOME]

export const ATTEMPT_OUTCOME_META: Record<AttemptOutcome, { label: string }> = {
    10: { label: "Accepted" },
    20: { label: "Rejected" },
    30: { label: "Error" },
    40: { label: "Abandoned" },
}

/* ------------------------------------------------------------------ */
/* Tracking                                                            */
/* ------------------------------------------------------------------ */

export const TRACKING_EVENT = {
    OPEN: 10,
    CLICK: 20,
    BOUNCE_HARD: 30,
    BOUNCE_SOFT: 40,
    COMPLAINT: 50,
    UNSUBSCRIBE: 60,
    DELIVERED: 70,
} as const

export type TrackingEvent = (typeof TRACKING_EVENT)[keyof typeof TRACKING_EVENT]

export const TRACKING_EVENT_META: Record<TrackingEvent, { label: string }> = {
    10: { label: "Opened" },
    20: { label: "Clicked" },
    30: { label: "Hard bounce" },
    40: { label: "Soft bounce" },
    50: { label: "Marked as spam" },
    60: { label: "Unsubscribed" },
    70: { label: "Delivered" },
}

export const TRACKING_EVENTS = Object.values(TRACKING_EVENT) as TrackingEvent[]

/* ------------------------------------------------------------------ */
/* Suppression                                                         */
/* ------------------------------------------------------------------ */

/**
 * Why an address is on the do-not-send list.
 *
 * Suppression rows are never deleted by a TTL. An unsubscribe is permanent,
 * and a row that expires is a legal problem, not a storage saving.
 */
export const SUPPRESSION_REASON = {
    UNSUBSCRIBED: 10,
    HARD_BOUNCE: 20,
    COMPLAINT: 30,
    /** Added by a person from the suppression screen. */
    MANUAL: 40,
    /** The address is not a valid address. */
    INVALID: 50,
} as const

export type SuppressionReason =
    (typeof SUPPRESSION_REASON)[keyof typeof SUPPRESSION_REASON]

export const SUPPRESSION_REASON_META: Record<
    SuppressionReason,
    { label: string; color: string }
> = {
    10: { label: "Unsubscribed", color: "bg-slate-600 text-white" },
    20: { label: "Hard bounce", color: "bg-red-700 text-white" },
    30: { label: "Marked as spam", color: "bg-rose-700 text-white" },
    40: { label: "Added by hand", color: "bg-neutral-600 text-white" },
    50: { label: "Invalid address", color: "bg-amber-600 text-white" },
}

export const SUPPRESSION_REASONS =
    Object.values(SUPPRESSION_REASON) as SuppressionReason[]

export function isSuppressionReason(value: unknown): value is SuppressionReason {
    return (SUPPRESSION_REASONS as readonly number[]).includes(Number(value))
}

/* ------------------------------------------------------------------ */
/* Templates and assets                                                */
/* ------------------------------------------------------------------ */

export const TEMPLATE_CATEGORY = {
    GENERAL: 10,
    NEWSLETTER: 20,
    ANNOUNCEMENT: 30,
    PROMOTION: 40,
    FOLLOW_UP: 50,
    TRANSACTIONAL: 60,
} as const

export type TemplateCategory =
    (typeof TEMPLATE_CATEGORY)[keyof typeof TEMPLATE_CATEGORY]

export const TEMPLATE_CATEGORY_META: Record<TemplateCategory, { label: string }> = {
    10: { label: "General" },
    20: { label: "Newsletter" },
    30: { label: "Announcement" },
    40: { label: "Promotion" },
    50: { label: "Follow up" },
    60: { label: "Transactional" },
}

export const TEMPLATE_CATEGORIES =
    Object.values(TEMPLATE_CATEGORY) as TemplateCategory[]

export const ASSET_CATEGORY = {
    GENERAL: 10,
    LOGO: 20,
    BANNER: 30,
    ICON: 40,
    PHOTO: 50,
} as const

export type AssetCategory = (typeof ASSET_CATEGORY)[keyof typeof ASSET_CATEGORY]

export const ASSET_CATEGORY_META: Record<AssetCategory, { label: string }> = {
    10: { label: "General" },
    20: { label: "Logo" },
    30: { label: "Banner" },
    40: { label: "Icon" },
    50: { label: "Photo" },
}

export const ASSET_CATEGORIES = Object.values(ASSET_CATEGORY) as AssetCategory[]

/* ------------------------------------------------------------------ */
/* Recipient source                                                    */
/* ------------------------------------------------------------------ */

/**
 * Where a recipient came from. Mirrors ENTITY_TYPE for leads and clients so
 * a report can link straight back to the CRM record.
 */
export const RECIPIENT_SOURCE = {
    LEAD: 10,
    CLIENT: 20,
    CONTACT: 30,
    /** Typed or pasted into the campaign, with no stored record. */
    MANUAL: 40,
} as const

export type RecipientSource =
    (typeof RECIPIENT_SOURCE)[keyof typeof RECIPIENT_SOURCE]

export const RECIPIENT_SOURCE_META: Record<RecipientSource, { label: string }> = {
    10: { label: "Lead" },
    20: { label: "Client" },
    30: { label: "Contact" },
    40: { label: "Typed in" },
}

/* ------------------------------------------------------------------ */
/* Unknown outcome policy                                              */
/* ------------------------------------------------------------------ */

/**
 * What to do with a recipient whose send outcome we cannot confirm.
 *
 * NEVER_RESEND is the default and the safe one. Resending risks a duplicate
 * email to a real person. Not resending risks one person not getting it.
 * The report shows the count either way, so nothing is hidden.
 */
export const UNKNOWN_OUTCOME_POLICY = {
    NEVER_RESEND: 10,
    RESEND_AFTER_WINDOW: 20,
} as const

export type UnknownOutcomePolicy =
    (typeof UNKNOWN_OUTCOME_POLICY)[keyof typeof UNKNOWN_OUTCOME_POLICY]
