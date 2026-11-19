/**
 * What the email marketing API sends to the browser.
 *
 * The SMTP password is not in any of these shapes, on purpose. There is no
 * way to read it back through the API: the settings screen shows whether
 * one is saved, and to change it you send a new one.
 */

/** The SMTP connection, as the settings screen sees it. */
export interface EmailProviderView {
    _id: string
    name: string
    providerKey: string
    host: string
    port: number
    secure: boolean
    user: string
    /** True when a password is stored. The password itself is never sent. */
    hasPassword: boolean
    maxConnections: number
    maxMessages: number
    globalPerSecond: number
    globalPerDay: number
    killSwitch: boolean
    killSwitchReason: string
    reportsDelivery: boolean
    reportsBounces: boolean
    lastTestAt: string | null
    lastTestOk: boolean | null
    lastTestMessage: string
}

export interface EmailSenderIdentityView {
    _id: string
    fromName: string
    fromEmail: string
    replyTo: string
    postalAddress: string
    verifiedAt: string | null
    verificationNote: string
    isDefault: boolean
}

/** Every tunable number, with what it is now and what the default was. */
export interface DeliverySettingsView {
    logicalBatchSize: number
    maxJobsPerInvocation: number
    sendConcurrency: number
    workerDurationBudgetMs: number
    workerSafetyFraction: number
    leaseDurationMs: number
    maxAttemptsTransient: number
    maxAttemptsPermanent: number
    backoffBaseMs: number
    backoffMaxMs: number
    globalCampaignConcurrency: number
    unknownOutcomePolicy: number
    unknownOutcomeWindowMs: number
    suppressionRecheckBeforeSend: boolean
    heartbeatIntervalMinutes: number
    bounceRateThreshold: number
    bounceRateMinSample: number
}

/**
 * The whole settings screen in one response.
 *
 * A union, not one interface with optional fields. These settings are per
 * region: one SMTP connection, one set of limits. When the session is
 * looking at several regions at once there is genuinely nothing to show,
 * so the screen asks for one. Making that a separate shape means the
 * client cannot read a provider that was never sent.
 */
export type EmailSettingsResponse =
    | EmailSettingsNeedRegion
    | EmailSettingsLoaded

export interface EmailSettingsNeedRegion {
    needsRegionPick: true
    /** The regions the session can see, for the message. */
    regionsInView: string[]
    canEdit: boolean
}

export interface EmailSettingsLoaded {
    needsRegionPick: false
    regionsInView: string[]
    region: string
    provider: EmailProviderView | null
    identities: EmailSenderIdentityView[]
    delivery: DeliverySettingsView
    deliveryDefaults: DeliverySettingsView
    deliveryHelp: Record<string, string>
    /** Whether EMAIL_SECRET_KEY is set and the right length. */
    secretKeyReady: boolean
    /** Suggested host, port and user from the existing SMTP_* env vars. */
    suggestion: {
        host: string
        port: number
        secure: boolean
        user: string
    } | null
    /** What this provider can and cannot report, in plain words. */
    capabilityNote: string
    /**
     * How late a scheduled campaign can be, in minutes. The campaign
     * screens show this next to the time picker.
     */
    schedulePrecisionMinutes: number
    /** True when the person may edit SMTP settings, not only read them. */
    canEdit: boolean
}

export interface SmtpTestResult {
    ok: boolean
    message: string
    testedAt: string
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/**
 * One row of the template library.
 *
 * It deliberately carries no MJML and no HTML. A library of forty
 * templates would otherwise be megabytes. The editor asks for a full
 * version by its own endpoint.
 */
export interface EmailTemplateRow {
    _id: string
    name: string
    description: string
    category: number
    tags: string[]
    thumbnailUrl: string
    currentVersionId: string | null
    /** The current version number, or 0 when nothing is published yet. */
    currentVersion: number
    versionCount: number
    /** True when there are unsaved editor changes newer than the version. */
    hasDraft: boolean
    draftSavedAt: string | null
    createdAt: string
    updatedAt: string
}

export interface EmailTemplateVersionView {
    _id: string
    templateId: string
    version: number
    /** Empty unless the endpoint was asked for the source. */
    mjml: string
    html: string
    linkHosts: string[]
    mergeTokens: string[]
    compileWarnings: string[]
    htmlBytes: number
    note: string
    createdAt: string
}

/** What the editor loads when it opens a template. */
export interface EmailEditorPayload {
    template: EmailTemplateRow
    /** The draft if there is one, otherwise the current version's MJML. */
    mjml: string
    /** True when `mjml` came from the autosaved draft, not a saved version. */
    fromDraft: boolean
    currentVersion: EmailTemplateVersionView | null
    versions: EmailTemplateVersionView[]
    mergeTokens: Array<{
        key: string
        label: string
        sample: string
        description: string
    }>
    starterBlocks: Array<{
        id: string
        label: string
        category: string
        content: string
    }>
    assets: EmailAssetView[]
    canEdit: boolean
}

export interface EmailAssetView {
    _id: string
    name: string
    url: string
    thumbnailUrl: string
    width: number | null
    height: number | null
    sizeBytes: number
    mimeType: string
    altTextDefault: string
    category: number
    tags: string[]
    createdAt: string
}

/** The result of compiling MJML on the server. */
export interface CompileResponse {
    html: string
    text: string
    linkHosts: string[]
    mergeTokens: string[]
    unknownTokens: string[]
    warnings: string[]
    htmlBytes: number
}
