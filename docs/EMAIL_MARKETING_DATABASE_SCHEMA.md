# Email Marketing — Database Schema

> **Decisions were made on 19 November 2026. Read [EMAIL_MARKETING_DECISIONS.md](EMAIL_MARKETING_DECISIONS.md) first.**
> The build targets Vercel Hobby, campaigns of up to 100 recipients, Gmail SMTP and no queue service.
> Where this document differs from that one, that one wins. This document holds the research and the full design.

MongoDB with Mongoose 9. Every model follows the conventions already in `src/models`.

---

## 0. House rules this schema obeys

Taken from the existing models, not invented here.

1. **Four-space indentation, strict TypeScript.** An `I<Name>` interface, then the schema, then the plugins, then the `mongoose.models.X || mongoose.model(...)` export with the plugins re-applied to `Model.schema`. Copy the shape of `src/models/LeadSource.ts`.
2. **`regionScopePlugin` on everything a person reads.** It filters every `find`, `countDocuments`, `distinct` and `aggregate`, and stamps `region` on create. Nothing else is needed for region safety.
3. **`softDeletePlugin` where a person can delete.** Campaigns, templates, audiences, assets. Not on job rows.
4. **`ensureAuditPlugin(schema, ENTITY_TYPE.X)` where a person edits.** The existing activity log then covers it, with no new code.
5. **Numeric status codes in `src/constants`, stepping by 10,** with a `*_META` map for labels and Tailwind classes. The database stores numbers only.
6. **No embedded unbounded arrays.** `LeadSource.activity` is embedded because a call list has a handful of entries. 500 recipients and 50,000 tracking events are not that.

---

## 1. Collections

Thirteen were proposed in the brief. Here are sixteen, with the differences explained.

| # | Collection | Purpose | Region scoped | Soft delete | Audited | TTL |
|---|---|---|---|---|---|---|
| 1 | `EmailCampaign` | One campaign | yes | yes | yes | no |
| 2 | `EmailTemplate` | A named template, points at its current version | yes | yes | yes | no |
| 3 | `EmailTemplateVersion` | Immutable MJML + compiled HTML | yes | no | no | no |
| 4 | `EmailAudience` | A saved, reusable audience definition | yes | yes | yes | no |
| 5 | `EmailContact` | A recipient who is not a Lead or Client | yes | yes | yes | no |
| 6 | `CampaignRecipient` | **The job unit.** One row per recipient per campaign | yes | no | no | no |
| 7 | `EmailBatch` | Grouping of 100 recipients, for reporting | yes | no | no | no |
| 8 | `EmailDeliveryAttempt` | One send attempt and its SMTP response | yes | no | no | 90 days |
| 9 | `EmailTrackingEvent` | Open, click, bounce, complaint, unsubscribe | yes | no | no | 365 days |
| 10 | `EmailSuppression` | Do-not-send list | yes | no | yes | no |
| 11 | `EmailAsset` | Image in the asset library | yes | yes | yes | no |
| 12 | `EmailSenderIdentity` | From name, from address, reply-to, postal address | yes | yes | yes | no |
| 13 | `EmailProviderConfig` | SMTP credentials, provider limits, kill switch | yes | no | yes | no |
| 14 | `EmailDeliveryConfig` | Every tunable number, in one place | yes | no | yes | no |
| 15 | `EmailRateCounter` | Distributed rate-limiter buckets | **no** | no | no | 2 min |
| 16 | `EmailDispatchLock` | Dispatcher mutex | **no** | no | no | no |

### Changes from the brief's list

- **`CampaignAuditLog` is dropped.** The existing `ActivityLog` already does this. Adding `ENTITY_TYPE.EMAIL_CAMPAIGN` and calling `ensureAuditPlugin` gives campaign history for free, in the screen the team already uses. A second audit log would be a second place to look.
- **`EmailSenderIdentity` is split out of `EmailProviderConfig`.** One SMTP connection can send as several identities ("Zan Services", "Zan Sales"). Merging them would force a duplicate credential row per from-address.
- **`EmailDeliveryConfig` is split out too.** The brief asked for tunables that change "without changing application logic". Keeping them beside encrypted credentials means the tuning screen and the credentials screen are the same screen, with the same permissions. They should not be.
- **`EmailRateCounter` and `EmailDispatchLock` are added.** They are infrastructure, not domain data. They are deliberately **not** region-scoped: the rate limit is a property of the SMTP provider, which is shared across regions, and the dispatcher is one process for the whole deployment. Putting them under the region plugin would break them silently.

---

## 2. Status codes

New file `src/constants/emailStatus.ts`. Same shape as `leadSourceStatus.ts`.

```ts
export const CAMPAIGN_STATUS = {
    DRAFT: 10,
    SCHEDULED: 20,
    QUEUEING: 30,
    SENDING: 40,
    PAUSED: 50,
    HALTED: 60,
    COMPLETED: 70,
    COMPLETED_WITH_FAILURES: 80,
    CANCELLED: 90,
    FAILED: 100,
    ARCHIVED: 110,
} as const

export const RECIPIENT_STATUS = {
    PENDING: 10,
    QUEUED: 20,
    PROCESSING: 30,
    SUBMITTED: 40,
    DELIVERED: 50,
    RETRYING: 60,
    FAILED: 70,
    BOUNCED: 80,
    SUPPRESSED: 90,
    CANCELLED: 100,
    UNKNOWN_OUTCOME: 110,
} as const

export const TRACKING_EVENT = {
    OPEN: 10,
    CLICK: 20,
    BOUNCE_HARD: 30,
    BOUNCE_SOFT: 40,
    COMPLAINT: 50,
    UNSUBSCRIBE: 60,
    DELIVERED: 70,
} as const

export const ERROR_CLASS = {
    PERMANENT: 10,
    TRANSIENT: 20,
    THROTTLE: 30,
    AUTH: 40,
    UNKNOWN: 50,
} as const

export const SUPPRESSION_REASON = {
    UNSUBSCRIBED: 10,
    HARD_BOUNCE: 20,
    COMPLAINT: 30,
    MANUAL: 40,
    INVALID: 50,
} as const
```

Add to `src/constants/entityTypes.ts`:

```ts
EMAIL_CAMPAIGN: 11,
EMAIL_TEMPLATE: 12,
EMAIL_AUDIENCE: 13,
EMAIL_CONTACT: 14,
EMAIL_ASSET: 15,
EMAIL_SUPPRESSION: 16,
EMAIL_SENDER_IDENTITY: 17,
EMAIL_PROVIDER_CONFIG: 18,
```

---

## 3. The important three

The other thirteen are routine. These three carry the design.

### 3.1 `CampaignRecipient` — the job unit

This is the busiest collection. One row per recipient per campaign. For 500-recipient campaigns at ten campaigns a month, that is 5,000 rows a month. At 50,000-recipient campaigns it is 500,000 a month, and still fine, because nothing scans it unindexed.

```ts
export interface ICampaignRecipient extends Document {
    region: RegionCode
    campaignId: Types.ObjectId
    batchId: Types.ObjectId

    // Identity, snapshotted. Never read back from Lead/Client at send time.
    email: string              // as entered, for display
    emailNormalized: string    // lowercase, trimmed. The dedupe key.
    name?: string
    sourceType: number         // ENTITY_TYPE.LEAD | CLIENT | EMAIL_CONTACT
    sourceId?: Types.ObjectId

    /** Merge values, frozen at snapshot time. See architecture section 9. */
    mergeData: Map<string, string>

    status: number             // RECIPIENT_STATUS
    attempts: number
    maxAttempts: number

    // Lease. Only meaningful while status is PROCESSING.
    claimId?: Types.ObjectId
    leaseOwner?: string
    leaseUntil?: Date | null

    /** We generate this before sending, so a crash still leaves a handle. */
    messageId?: string

    lastError?: string
    lastErrorClass?: number    // ERROR_CLASS
    lastSmtpCode?: number
    nextAttemptAt?: Date | null

    queuedAt?: Date
    submittedAt?: Date
    deliveredAt?: Date
    finishedAt?: Date

    /** HMAC, used in the pixel and click URLs. Not an ObjectId. */
    trackingToken: string

    openCount: number
    clickCount: number
    firstOpenAt?: Date
    firstClickAt?: Date
    unsubscribedAt?: Date | null

    createdAt: Date
    updatedAt: Date
}
```

**Indexes, and what each one is for:**

```ts
// The claim query. campaignId + status, _id for stable ordering.
// This is the hot path. Everything else is secondary.
Schema.index({ campaignId: 1, status: 1, _id: 1 })

// Deduplication. Unique, so a bulk insert skips repeats instead of erroring.
Schema.index({ campaignId: 1, emailNormalized: 1 }, { unique: true })

// The sweeper: find PROCESSING jobs whose lease has died.
Schema.index({ status: 1, leaseUntil: 1 })

// Retry pickup: RETRYING jobs whose backoff has elapsed.
Schema.index({ status: 1, nextAttemptAt: 1 })

// Pixel and click lookup. Sparse because only materialised rows have one.
Schema.index({ trackingToken: 1 }, { unique: true, sparse: true })

// "Which campaigns went to this person?" on a Lead detail page.
Schema.index({ region: 1, emailNormalized: 1, createdAt: -1 })

// The recipients tab, filtered by status, newest first.
Schema.index({ campaignId: 1, status: 1, finishedAt: -1 })
```

**Why `claimId` exists.** The claim is three operations (see architecture 6.3). `updateMany` does not return the documents it changed. Stamping a `claimId` and then querying it is how the worker learns exactly which jobs it won, with no race.

**Why there is no `attempts` array here.** Attempt history lives in `EmailDeliveryAttempt`. Embedding five attempts per recipient would be fine at five, and would be an unbounded array at the edges. The separate collection also gets a TTL, which an embedded array cannot.

### 3.2 `EmailCampaign`

```ts
export interface IEmailCampaign extends Document {
    region: RegionCode
    name: string
    description?: string
    status: number                   // CAMPAIGN_STATUS

    // Content
    subject: string
    preheader?: string
    templateId?: Types.ObjectId
    /** Pinned. Editing the template later does not change a sent campaign. */
    templateVersionId?: Types.ObjectId
    senderIdentityId: Types.ObjectId
    mergeFallbacks: Map<string, string>

    // Audience
    audienceId?: Types.ObjectId
    /** A copy of the rules at schedule time, for the report. */
    audienceSnapshot?: Record<string, unknown>

    // Schedule. Three fields, see architecture section 5.
    scheduledAt?: Date | null        // UTC. The only field queries use.
    scheduleWall?: string            // "2026-12-01T09:30"
    scheduleZone?: string            // "Asia/Kolkata"
    sendImmediately: boolean

    // Progress. Denormalised counters, maintained with $inc.
    counts: {
        total: number
        pending: number
        queued: number
        processing: number
        submitted: number
        delivered: number
        failed: number
        bounced: number
        suppressed: number
        cancelled: number
        unknown: number
    }
    engagement: {
        uniqueOpens: number
        totalOpens: number
        uniqueClicks: number
        totalClicks: number
        unsubscribes: number
        complaints: number
    }

    // Lifecycle
    startedAt?: Date
    finishedAt?: Date
    haltedReason?: string
    pausedBy?: Types.ObjectId
    cancelledBy?: Types.ObjectId

    // Approval, if the workflow is switched on
    approvalRequired: boolean
    approvedBy?: Types.ObjectId
    approvedAt?: Date

    /** Per-campaign overrides of EmailDeliveryConfig. Usually empty. */
    deliveryOverrides?: Record<string, number>

    createdBy: Types.ObjectId
    archivedAt?: Date | null
    deletedAt: Date | null
    deletedBy?: Types.ObjectId
}
```

**Indexes:**

```ts
// The dispatcher's query. The only index that must be fast under load.
Schema.index({ status: 1, scheduledAt: 1 })

// The campaign list: region, status tab, newest first.
Schema.index({ region: 1, status: 1, createdAt: -1 })

// "My campaigns" for a non-manager.
Schema.index({ region: 1, createdBy: 1, createdAt: -1 })

// Name search.
Schema.index({ region: 1, name: 1 })
```

**Note on the dispatcher index.** It is deliberately **not** prefixed with `region`. The dispatcher runs outside any region scope — it is a system process — and must see due campaigns in every region in one query. The route for it calls `runWithoutRegionScope`, exactly as `getUserFromRequest` already does for the user lookup.

**Counters can drift.** `$inc` on eleven counters across concurrent workers will eventually disagree with reality, usually because of a crash between the recipient write and the counter write. The sweeper recomputes them from `CampaignRecipient` when a campaign closes, and an admin can trigger a recount from the campaign detail page. The counters are for speed; the recipient rows are the truth.

### 3.3 `EmailSuppression`

Small, boring and the most important collection for staying out of trouble.

```ts
export interface IEmailSuppression extends Document {
    region: RegionCode
    emailNormalized: string
    reason: number                 // SUPPRESSION_REASON
    /** Which campaign caused it, when it was an unsubscribe or bounce. */
    sourceCampaignId?: Types.ObjectId
    note?: string
    addedBy?: Types.ObjectId
    createdAt: Date
}

Schema.index({ region: 1, emailNormalized: 1 }, { unique: true })
Schema.index({ region: 1, reason: 1, createdAt: -1 })
```

**Never TTL this collection.** An unsubscribe is permanent. A suppression row that expires is a legal problem, not a storage saving.

**Checked twice.** Once when the snapshot is built, once in the worker immediately before `sendMail`. The gap between those two can be hours for a scheduled campaign, and somebody can unsubscribe in it. The worker's check is a single indexed lookup per recipient, which is cheap next to an SMTP round trip.

---

## 4. The remaining collections, in brief

### `EmailTemplate` and `EmailTemplateVersion`

```ts
// EmailTemplate
region, name, description, category: number, tags: string[],
currentVersionId: ObjectId, draftMjml?: string, draftSavedAt?: Date,
thumbnailUrl?: string, createdBy, deletedAt, deletedBy

Schema.index({ region: 1, name: 1 })
Schema.index({ region: 1, category: 1, updatedAt: -1 })

// EmailTemplateVersion - immutable once written
region, templateId: ObjectId, version: number,
mjml: string,              // the source of truth
html: string,              // compiled, server-side, with mjml@4.18.0
linkHosts: string[],       // allow-list for the click redirect
mergeTokens: string[],     // what this version uses, for the preview UI
compileWarnings: string[],
createdBy, createdAt

Schema.index({ templateId: 1, version: -1 }, { unique: true })
```

`linkHosts` is the security-relevant field. It is extracted from the compiled HTML at save time and is the only allow-list the click redirect consults. See architecture section 10.

### `EmailAudience`

```ts
region, name, description,
rules: {
    leads?:   { all?: boolean, ids?: ObjectId[], status?: number[],
                source?: string[], assignedTo?: ObjectId[] },
    clients?: { all?: boolean, ids?: ObjectId[], status?: number[] },
    contacts?: { listIds?: ObjectId[], ids?: ObjectId[] },
    manual?:  string[],        // pasted addresses
    exclude?: { emails?: string[], audienceIds?: ObjectId[] }
},
lastCount?: number, lastCountedAt?: Date,
createdBy, deletedAt, deletedBy

Schema.index({ region: 1, name: 1 })
```

The rules are a closed shape, not a raw Mongo query. Nothing a person types becomes a query operator. The resolver maps each rule to a filter it builds itself.

### `EmailContact`

```ts
region, email, emailNormalized, firstName?, lastName?, company?,
marketingConsent: boolean,
consentSource?: string,        // "csv:leads-nov.xlsx", "manual", "form"
consentAt?: Date,
importBatchId?: ObjectId,
customFields: Map<string, string>,
deletedAt, deletedBy

Schema.index({ region: 1, emailNormalized: 1 }, { unique: true })
Schema.index({ region: 1, marketingConsent: 1, createdAt: -1 })
```

Only for people who are not Leads or Clients. A Lead's email is read from the Lead. This collection does not duplicate the CRM.

### `EmailBatch`

```ts
region, campaignId, index: number, size: number, status: number,
counts: { submitted, failed, bounced, pending },
startedAt?, finishedAt?

Schema.index({ campaignId: 1, index: 1 }, { unique: true })
```

Reporting only. No worker reads it to decide what to do.

### `EmailDeliveryAttempt`

```ts
region, campaignId, recipientId, attemptNo: number,
workerId: string, startedAt: Date, finishedAt?: Date, durationMs?: number,
outcome: number, smtpCode?: number, smtpResponse?: string,
errorClass?: number, errorMessage?: string, messageId?: string,
expiresAt: Date       // TTL

Schema.index({ recipientId: 1, attemptNo: 1 })
Schema.index({ campaignId: 1, outcome: 1, startedAt: -1 })
Schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

90-day TTL. This is the Delivery Activity screen's data source and the raw material for the P50/P95/P99 latency figures.

### `EmailTrackingEvent`

```ts
region, campaignId, recipientId, type: number, at: Date,
url?: string,              // clicks only
ipHash?: string,           // SHA-256 of IP + salt. Never the raw IP.
userAgent?: string,
providerMessageId?: string,
raw?: Record<string, unknown>,   // webhook payload, for bounces
expiresAt: Date

Schema.index({ campaignId: 1, type: 1, at: -1 })
Schema.index({ recipientId: 1, at: -1 })
Schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

365-day TTL. The IP is hashed, not stored. We do not need to know where someone read an email, and storing it would be a DPDP liability for no product value.

### `EmailAsset`

```ts
region, name, url, imagekitFileId, thumbnailUrl,
width, height, sizeBytes, mimeType, altTextDefault?,
category: number, tags: string[], uploadedBy, deletedAt, deletedBy

Schema.index({ region: 1, category: 1, createdAt: -1 })
Schema.index({ region: 1, tags: 1 })
```

Files go to ImageKit, exactly like avatars and quotations do today. Nothing is written to the function filesystem.

### `EmailSenderIdentity`

```ts
region, fromName, fromEmail, replyTo?,
postalAddress: string,         // required. CAN-SPAM.
verifiedAt?: Date, verificationNote?: string,
isDefault: boolean, deletedAt, deletedBy

Schema.index({ region: 1, fromEmail: 1 }, { unique: true })
```

`postalAddress` is required at the schema level, not just in a form. A campaign cannot be sent from an identity without one.

### `EmailProviderConfig`

```ts
region, name, provider: string,
host, port, secure: boolean, user: string,
passCipher: string,            // AES-256-GCM. Never leaves the server.
passIv: string, passTag: string,
maxConnections: number, maxMessages: number,
globalPerSecond: number, globalPerDay: number,
killSwitch: boolean, killSwitchReason?: string, killSwitchAt?: Date,
lastTestAt?: Date, lastTestOk?: boolean, lastTestMessage?: string,
isDefault: boolean
```

A `toJSON` transform deletes `passCipher`, `passIv` and `passTag`. The field never reaches a response body, even if a route forgets to project it out.

### `EmailDeliveryConfig`

One document per region. Every tunable in the system, in one place, changeable from the settings screen with no deploy.

```ts
region,
logicalBatchSize: number,
maxJobsPerInvocation: number,
sendConcurrency: number,
workerDurationBudgetMs: number,
workerSafetyFraction: number,      // 0.70
leaseDurationMs: number,
maxAttemptsTransient: number,
maxAttemptsPermanent: number,      // 1
backoffBaseMs: number,
backoffMaxMs: number,
globalCampaignConcurrency: number,
unknownOutcomePolicy: number,      // 10 never resend, 20 resend after window
unknownOutcomeWindowMs: number,
suppressionRecheckBeforeSend: boolean,
updatedBy, updatedAt
```

Nothing in `src/lib/email` hard-codes any of these. They are read once per worker invocation and passed down.

### `EmailRateCounter` and `EmailDispatchLock`

```ts
// EmailRateCounter - _id is "providerKey:bucket"
_id: string, used: number, expiresAt: Date
Schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// EmailDispatchLock - one document, _id "dispatch"
_id: string, leaseUntil: Date | null, owner: string, updatedAt: Date
```

Neither is region-scoped. Neither is audited. Neither is soft-deleted. They are plumbing.

---

## 5. Data retention

| Collection | Policy | Why |
|---|---|---|
| `EmailCampaign` | keep forever, archivable | Reporting history is the point of the module |
| `CampaignRecipient` | keep forever | The only proof of what was sent to whom |
| `EmailTemplateVersion` | keep forever | A sent campaign points at one |
| `EmailSuppression` | **keep forever** | An unsubscribe does not expire |
| `EmailDeliveryAttempt` | TTL 90 days | Operational debugging data, not a record |
| `EmailTrackingEvent` | TTL 365 days | Aggregates on the recipient row survive it |
| `EmailRateCounter` | TTL 2 minutes | Plumbing |

Retention is set by the TTL index, so MongoDB does the deleting. There is no cleanup job to forget to run.

**Before any TTL expires, the aggregate is already safe.** `openCount` and `clickCount` live on `CampaignRecipient`, which never expires. Deleting a year-old open event does not change last year's open rate.

---

## 6. Document size

The 16 MB limit is never approached. Worst case per document:

| Document | Realistic size | Ceiling |
|---|---|---|
| `EmailCampaign` | 3 KB | fixed fields plus two small counter objects |
| `CampaignRecipient` | 1.5 KB | `mergeData` is capped at 20 keys |
| `EmailTemplateVersion` | 60-250 KB | MJML plus compiled HTML. A very large template might reach 1 MB. |
| `EmailTrackingEvent` | 1-4 KB | `raw` webhook payload is the only variable part |

`EmailTemplateVersion` is the only one worth watching. If a template version ever exceeds 2 MB, the right answer is to refuse the save and tell the designer the email is too heavy for inboxes anyway. Gmail clips messages over 102 KB.

---

## 7. Index creation

The project already has `npm run db:indexes`, which calls `createIndexes()` on every registered model.

Two things to do:

1. Add the new models to the import list in `src/lib/db/dbConnect.ts`, the same way `LeadSource` and `LeadSourceUpload` are imported there. Without that, `mongoose.modelNames()` does not see them and the script silently skips them.
2. Run `npm run db:indexes` after deploying. The unique index on `{ campaignId, emailNormalized }` must exist before the first snapshot, or duplicates get in and the index can never be built afterwards without cleaning rows.

---

## 8. Open questions on the schema

1. **Should `EmailContact` hold a list membership, or should lists be a separate join collection?** Proposed: `EmailAudience.rules.contacts.listIds` with a `listIds: ObjectId[]` array on the contact. Fine up to a few hundred lists per contact. A join collection is the answer if contact lists ever become a major feature.
2. **Should Leads and Clients get a `marketingOptOut` field?** It would let a salesperson mark one lead as do-not-market without creating a suppression row. Cleaner for the user, but it adds a field to two core models. Suppression by email covers the same need and touches nothing. Proposed: suppression only, revisit if the team asks.
3. **Consent default for existing CRM records.** This is the one that blocks launch, and it is a business decision. See the architecture document, section 14.
