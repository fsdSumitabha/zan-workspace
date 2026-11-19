# Email Marketing — Implementation Plan

> **Decisions were made on 19 November 2026. Read [EMAIL_MARKETING_DECISIONS.md](EMAIL_MARKETING_DECISIONS.md) first.**
> The build targets Vercel Hobby, campaigns of up to 100 recipients, Gmail SMTP and no queue service.
> Where this document differs from that one, that one wins. This document holds the research and the full design.

Read `EMAIL_MARKETING_ARCHITECTURE.md` first. This document covers navigation, screens, capacity numbers, milestones and testing.

---

## 1. Repository audit — what exists and what we reuse

Everything below is already in the repo. The module adds to it; it does not replace anything.

### 1.1 Stack

| Area | Version |
|---|---|
| Next.js | 16.1.6, App Router |
| React | 19.2.3 |
| TypeScript | 5, `strict: true` |
| Mongoose | 9.3.0 |
| Tailwind | 4, via `@tailwindcss/postcss` |
| Nodemailer | 8.0.7 (already a dependency) |
| Zod | 4.3.6 |
| Package manager | npm, `package-lock.json` committed |

### 1.2 What we reuse, unchanged

| Need | Existing code | Notes |
|---|---|---|
| Auth | `requireRole(req, roles)` | Returns 401/403, sets audit and region context |
| Region isolation | `regionScopePlugin` | Add to each new schema. Nothing else needed. |
| Soft delete | `softDeletePlugin` | Hides deleted rows from find, count, distinct and aggregate |
| Audit log | `ensureAuditPlugin(schema, ENTITY_TYPE.X)` | Campaign history for free |
| Time zones | `wallTimeToUtc`, `zoneForRegion`, `ZONE_CHOICES` in `src/lib/time/zone.ts` | The scheduler needs no new time code |
| Notifications | `emitNotification` | Deliverability alerts land in the bell and as push |
| File storage | `imagekit.upload(...)` | Same pattern as `quotations/route.ts` |
| Excel | `write-excel-file/node`, `src/lib/lead-sources/sheet/workbook.ts` | Copy `attachmentHeader`, `XLSX_MIME`, the header style and the text-cell rule |
| Excel import | `read-excel-file`, `src/lib/lead-sources/sheet/readSheet.ts` | For CSV/XLSX contact import |
| Error responses | `LeadSourceError` + `errorResponse` in `src/lib/lead-sources/http.ts` | Copy the shape as `EmailError` + `errorResponse` |
| Rate limiting (public routes) | `checkRateLimit` in `src/lib/security/rateLimit.ts` | In-memory, per process. Fine for tracking endpoints. |
| API key comparison | `timingSafeKey` | For the job endpoint secret |
| Toasts | `sonner` | Already mounted in the root layout |
| Charts | `recharts` and `chart.js` | Both present. Use `recharts`, as `overall-stats` does. |
| Pagination | `src/components/admin/operations/Pagination.tsx` | |
| Tabs, filters, grid | `lead-sources/ViewTabs.tsx`, `LeadSourceFilters.tsx`, `ReportGrid.tsx` | The closest existing pattern to what we need |

### 1.3 Lead Source is the reference module

The brief named it, and it is the right reference. What to copy:

- **Route shape.** `GET /lead-sources` returns `data`, `pagination`, `counts` and `progress` in one response, so the tab counts and the table arrive together. Campaigns do the same.
- **Query parsing.** `parseListParams` validates and clamps everything from the URL: page capped at 100,000, limit capped at 100, search truncated at 100 characters, ObjectIds regex-checked. Copy it exactly.
- **Access filter.** `accessFilter(user)` narrows the query by role before anything else. Campaigns need the same for "my campaigns" versus "all campaigns".
- **Role constants.** `src/constants/leadSourceRoles.ts` defines MANAGE / WORK / CONVERT lists in one file that the API, `proxy.ts`, the sidebar and the buttons all read. Copy this file's structure precisely for email.
- **Status constants.** `leadSourceStatus.ts` with codes stepping by 10 and a `*_META` map holding the label, the Tailwind classes and a `closed` flag.
- **List state in the URL.** `?view=`, `?page=`, `?search=`. A reload or a shared link reopens the same view.

### 1.4 Two things in the existing app that this module must work around

**The operations layout is a fixed three-column grid.** `src/app/admin/operations/layout.tsx` wraps every page in `max-w-7xl` with a sticky right rail holding `StatsPanel` and `UpcomingMeetingsPanel`. A full-screen MJML editor cannot live inside it.

Fix: put the editor at `src/app/admin/email-studio/[templateId]/page.tsx` — outside `operations`, with its own minimal layout. One new top-level route, no change to the shared layout, no risk to any existing page.

**The sidebar is a flat list.** `SideBar.tsx` maps a flat `navItems` array. Email Marketing needs a group with children.

Fix: extend the item type with an optional `children` array and render a collapsible group when it is present. Items without `children` render exactly as they do now. Roughly 30 lines, additive, and no existing entry changes.

---

## 2. Navigation and screens

### 2.1 Sidebar

```
Dashboard
Leads
Lead Sources
Clients
Projects
Meetings
Email Marketing          <- new group, collapsible
  Overview
  Campaigns
  Templates
  Audiences
  Contacts
  Assets
  Reports
  Delivery Activity
  Suppression
  Settings
Overall Stats
Users
Activity Log
```

"Create Campaign" is not a sidebar item. It is a primary button on Overview and on Campaigns. A sidebar entry that is really a button is a navigation smell, and the brief's list of eleven would push the sidebar past the fold.

### 2.2 Routes

| URL | Screen |
|---|---|
| `/admin/operations/email` | Overview dashboard |
| `/admin/operations/email/campaigns` | Campaign list |
| `/admin/operations/email/campaigns/new` | Wizard, 6 steps |
| `/admin/operations/email/campaigns/[id]` | Campaign detail, 6 tabs |
| `/admin/operations/email/templates` | Template library |
| `/admin/email-studio/[templateId]` | **Full-screen MJML editor** |
| `/admin/operations/email/audiences` | Audience list |
| `/admin/operations/email/audiences/[id]` | Audience builder |
| `/admin/operations/email/contacts` | Contact list |
| `/admin/operations/email/contacts/import` | CSV / XLSX import |
| `/admin/operations/email/assets` | Asset library |
| `/admin/operations/email/reports` | Cross-campaign reporting and comparison |
| `/admin/operations/email/activity` | Delivery activity, operational |
| `/admin/operations/email/suppression` | Suppression list |
| `/admin/operations/email/settings` | SMTP, identities, limits, tracking |

Public, unauthenticated:

| URL | Purpose |
|---|---|
| `/api/e/o/[token].gif` | Open pixel |
| `/api/e/c/[token]` | Click redirect |
| `/e/u/[token]` | Unsubscribe page |
| `/api/e/webhook/[provider]` | Bounce and complaint webhook |

Job endpoints, secret header required:

| URL | Purpose |
|---|---|
| `/api/jobs/email/dispatch` | Heartbeat target |
| `/api/jobs/email/work` | Worker |

### 2.3 Overview

Four groups, in this order. The order is the point: a person opening this screen wants to know whether anything is broken before they want to know their open rate.

**Row 1 — pipeline state.** Draft, Scheduled, Sending, Completed, Failed. Five tiles, each a link to a filtered campaign list.

**Row 2 — delivery health.** This is the row that must never mislead.

```
Submitted      Confirmed delivered      Bounced      Failed
   4,812              4,655               98           59
                   [96.7% of submitted]
```

Submitted and Confirmed delivered are side by side, never summed, with a tooltip on each. If the provider sends no delivery webhooks, "Confirmed delivered" reads "not reported by your provider" instead of 0.

**Row 3 — engagement.** Unique opens, unique clicks, unsubscribes. The opens tile carries a permanent note: "Opens are approximate. Privacy proxies inflate them and image blocking hides them."

**Row 4 — what needs attention.**

- Upcoming scheduled campaigns, next five, with local time and zone.
- Recent failures, last ten, each linking to the recipient row.
- A red banner if the kill switch is on or any campaign is HALTED.

Plus a performance chart (recharts, sends and opens over 30 days) and a "New campaign" button.

### 2.4 Campaign list

Status tabs with counts: All, Draft, Scheduled, Sending, Completed, Failed, Archived. Search by name and subject. Filters for owner, date range and template. Sort by created, scheduled or name.

Each row: name, status pill, recipient count, scheduled time in the viewer's zone, a progress bar while sending, and a row menu with the valid actions for that status only. A Completed campaign does not show "Pause" greyed out; it does not show it at all.

### 2.5 Campaign wizard

Six steps, a progress bar across the top, and the rule that you can always go back without losing anything. The draft is saved on every step change.

| Step | Contents | Can advance when |
|---|---|---|
| 1. Details | Name, subject, preheader, sender identity | Name and subject present, identity chosen |
| 2. Content | Pick a template, duplicate one, or open the editor | A template version is pinned |
| 3. Audience | Saved audience, or build one. Live count with a breakdown of exclusions. | Count is 1 or more |
| 4. Personalise | Merge tokens used, fallback per token, preview against three real recipients, test send | Always (test send is optional) |
| 5. Schedule | Now, or date + time + IANA zone. Shows the UTC equivalent and the estimated duration. | A valid future time |
| 6. Review | Full summary. Confirm. | - |

**Step 3's exclusion breakdown is not a nice-to-have.** When 712 leads match the filter and 486 will be sent to, the person must see why:

```
Matched leads                              712
  no email address                       -  94
  duplicate address                      -  31
  on the suppression list                -  18
  invalid address                        -   7
  no marketing consent                   -  76
                                          ----
  Will receive this campaign               486
```

Without it, somebody will believe the campaign failed.

**Step 6 confirmation**, exactly as the brief requires:

```
Audience        486 recipients
From            Zan Services <news@zanservices.com>
Subject         Your December project update
Template        Monthly Update v7
Scheduled       1 December 2026, 9:30 AM  Asia/Kolkata
                (2026-12-01 04:00 UTC)
Estimated       about 2 minutes at the current send rate of 10/sec

[ Back ]                              [ Schedule campaign ]
```

### 2.6 MJML editor

Full screen, at `/admin/email-studio/[templateId]`.

```
+----------------------------------------------------------------------+
| < Back   Monthly Update        [undo][redo]  [desktop|mobile]        |
|                                [Preview] [Test send] [Save]  Saved 12s|
+------------+-------------------------------------------+-------------+
| Blocks     |                                           | Properties  |
|            |            Email canvas                   |             |
| Layout     |   +-----------------------------------+   | Typography  |
|  1 col     |   |  Header                           |   |  font       |
|  2 col     |   +-----------------------------------+   |  size       |
|  3 col     |   |                                   |   |  colour     |
|            |   |  Hello {{first_name}},            |   |             |
| Content    |   |                                   |   | Spacing     |
|  Text      |   |  [ Read more ]                    |   |  padding    |
|  Image     |   |                                   |   |  margin     |
|  Button    |   +-----------------------------------+   |             |
|  Divider   |   |  Footer + unsubscribe             |   | Background  |
|  Spacer    |   +-----------------------------------+   |             |
|  Social    |                                           |             |
|            |                                           |             |
| [Layers]   |                                           |             |
| [Assets]   |                                           |             |
+------------+-------------------------------------------+-------------+
```

- **Left**: block palette, with a Layers tab for the document tree and an Assets tab for the image library.
- **Centre**: the canvas.
- **Right**: contextual properties for the selected block.
- **Top**: back, title, undo/redo, device toggle, preview, test send, save, autosave status.

**Small screens.** Under 1024 px the two side panels become bottom sheets, opened by a toolbar button. Under 768 px the editor shows a read-only preview and a message saying editing needs a wider screen. Dragging email blocks on a phone is not a usable experience, and pretending otherwise produces broken templates.

**Unsaved changes.** A `beforeunload` handler plus an in-app confirm on route change. Autosave every 20 seconds writes `draftMjml`; it does not create a version. Only explicit save creates a version, and only after the server recompiles successfully.

### 2.7 Audience builder

A visual rule builder. Nobody writes a query.

```
Include
  [ Leads    v ]  where
      Status     is any of   [ Contacted x ] [ Meeting x ]  [+]
      Source     is any of   [ Facebook x ]                 [+]
      Owner      is any of   [ Priya x ]                    [+]
   [ + Add condition ]

  [ + Add another group ]        ( Leads / Clients / Contacts / Paste list )

Exclude
      Addresses in   [ Bounced November x ]
   [ + Add exclusion ]

----------------------------------------------------------
  486 recipients           [ Show the 712 - 486 breakdown ]
  [ Preview 10 recipients ]        [ Save as audience ]
```

The count refreshes 400 ms after the last change, debounced. The resolver maps each named rule to a filter it builds itself; no value from the UI becomes a Mongo operator.

### 2.8 Campaign detail — six tabs

| Tab | Contents |
|---|---|
| Overview | Status, the delivery-health row, timeline of lifecycle events, actions |
| Recipients | Searchable table, status filter, per-recipient history, retry one |
| Batches | 100-row groups, progress, counts |
| Activity | Lifecycle audit, read from the existing ActivityLog |
| Analytics | Opens, clicks, link-by-link breakdown, bounce reasons |
| Settings | Delivery overrides, visible to managers only |

### 2.9 Delivery Activity — the operations screen

A flat table of `EmailDeliveryAttempt` rows across all campaigns. This is what an engineer opens at 11 pm when a campaign looks stuck.

Columns: time, campaign, recipient, attempt number, outcome, SMTP code, SMTP response, duration, worker id, next retry.

Filters: campaign, outcome, error class, time range. One button: "Retry all failed in this view", with a confirmation showing the count.

### 2.10 Settings

Four sections, each a card:

1. **SMTP connection.** Host, port, user, password (write-only; shows dots once saved), test-connection button showing the real server response.
2. **Sender identities.** From name, from address, reply-to, postal address. Postal address is required.
3. **Delivery limits.** Every field of `EmailDeliveryConfig`, each with its current value, its default, and one sentence saying what raising it does.
4. **Safety.** The global kill switch, bounce-rate threshold, and the alert recipient list.

SMTP credentials never appear in any API response. The `toJSON` transform on the model deletes them, so a route that forgets to project them out still cannot leak them.

---

## 3. Roles

New file `src/constants/emailRoles.ts`, shaped like `leadSourceRoles.ts`. This is a proposal — confirm or change it.

```ts
export const EMAIL_ROLES = {
    /** Everything, including SMTP settings and the kill switch. */
    ADMIN: [10, 15],

    /** Create, edit, schedule, send, pause, cancel. No SMTP settings. */
    MANAGE: [10, 15, 50],          // + Digital Marketer

    /** Create and edit drafts. Cannot schedule or send. */
    AUTHOR: [10, 15, 50, 60],      // + BDE

    /** Read campaigns and reports only. */
    VIEW: [10, 15, 50, 60, 65, 69, 70],
} as const
```

The reasoning: role 50 is Digital Marketer, which is who this module is for. Role 60 (BDE) and 65 (US Sales Agent) should see results but not send to 500 people unsupervised. Roles 10 and 15 keep full control, as everywhere else.

Add the page guards to `src/proxy.ts` in the same block as the lead-source entries, most specific pattern first:

```ts
{ pattern: /^\/admin\/operations\/email\/settings(\/|$)/, roles: EMAIL_ADMIN_ROLES },
{ pattern: /^\/admin\/email-studio(\/|$)/,                roles: EMAIL_AUTHOR_ROLES },
{ pattern: /^\/admin\/operations\/email(\/|$)/,           roles: EMAIL_ACCESS_ROLES },
```

---

## 4. Capacity and throughput

### 4.1 The constraint is the provider, not the function

A 300-second function at 10 sends per second could handle 3,000 recipients in one invocation. The function is not the limit. Amazon SES at 14 per second is.

So batch sizes should be derived from the rate budget, not guessed:

```
jobs per invocation  =  min(
    maxJobsPerInvocation,                            // a hard safety cap
    globalPerSecond / expectedConcurrentWorkers * targetSeconds
)
```

With `globalPerSecond = 10`, two concurrent workers and a 45-second target, that is 225. Capped by `maxJobsPerInvocation`, which exists so that a crash loses a bounded amount of progress.

### 4.2 Starting values

The brief's provisional numbers are in the first column. The second is what the reasoning above gives. **Run the benchmark with the brief's values first**, so the comparison is real rather than asserted.

| Setting | Brief's provisional | Proposed after benchmark | Why |
|---|---|---|---|
| Logical batch size | 100 | 100 | Reporting granularity only. 5 batches for 500 recipients reads well. No reason to change. |
| Jobs per worker invocation | 5 | **25** | At 5, a 300s function sends 5 emails in about 3 seconds and exits. That wastes an invocation and discards a warm SMTP connection. At 25, a crash still loses at most 25 jobs' progress, and all 25 are recoverable by lease expiry. |
| SMTP connections per worker | 1 | 1 | Keep at 1. Concurrent connections multiply across instances and that is how provider connection limits get hit. |
| Send concurrency per worker | 2 | 2 | With one pooled connection, concurrency above 2 just queues inside Nodemailer. Raise only if the benchmark shows connection idle time. |
| Worker duration budget | 45-60s | 180s | Pro allows 300s. 180s of work with a 70% safety threshold at 210s leaves 30s to finish in-flight sends and write results. The worker chains a successor rather than running to the ceiling. |
| Safety threshold | 70% of max | 70% of max | Correct. Keep. |
| Retry attempts | 3-5 | 5 transient, 1 permanent | A permanent 550 must never be retried. A transient 421 deserves five tries over about 15 minutes. |
| Backoff | exponential + jitter | base 2s, max 15 min, full jitter | Full jitter, not half. 50 jobs failing together must not retry together. |
| Lease duration | - | 120s | Longer than the longest plausible single send (SMTP timeouts are typically 30-60s), short enough that a crashed worker's jobs recover within two heartbeats. |
| Global per-second rate | - | 10 | Below SES's 14/sec default, leaving headroom for transactional mail on the same account. |
| Global per-day budget | - | 5,000 | A guard against a runaway loop, not a product limit. |
| Global campaign concurrency | - | 2 | Two campaigns sending at once share the same 10/sec budget. A third waits. |

### 4.3 What 500 recipients looks like

With the proposed values:

| Measure | Expected |
|---|---|
| Rate-limited send time | 500 / 10 per second = 50 seconds |
| Wall clock, including claim and write overhead | 70-110 seconds |
| Worker invocations | 2 to 4 |
| Active CPU | mostly waiting on SMTP, so well under 1 CPU-minute |
| MongoDB writes | about 1,500 (claim, result, counter) |
| Queue messages | about 5 wake-ups |
| SES cost | $0.05 |

Scheduling precision: the heartbeat is every 60 seconds, so a campaign set for 09:30:00 starts between 09:30:00 and 09:31:00. Add snapshot time for the first batch. **Document the promise as "within two minutes of the scheduled time"** and do not promise to the second.

### 4.4 Scaling to 10,000

Nothing in the design changes. The numbers do:

| Measure | 10,000 recipients |
|---|---|
| At 10/sec | about 17 minutes |
| Worker invocations | about 8 |
| If SES rate raised to 50/sec | about 3.5 minutes |
| `CampaignRecipient` rows | 10,000, about 15 MB |
| Cost | $1.00 |

The lever is `globalPerSecond`, in the database, after SES grants a higher rate. No code change, no deploy.

---

## 5. Milestones

Seven milestones. Each ends with something that works and can be shown.

### Milestone 1 — Foundation (week 1-2)

**Objective:** models, constants, navigation and SMTP, with nothing sending yet.

**Dependencies to install:** none. `nodemailer` and `zod` are already there.

**Files to create:**
```
src/constants/emailStatus.ts
src/constants/emailRoles.ts
src/models/EmailCampaign.ts
src/models/EmailTemplate.ts
src/models/EmailTemplateVersion.ts
src/models/EmailAudience.ts
src/models/EmailContact.ts
src/models/CampaignRecipient.ts
src/models/EmailBatch.ts
src/models/EmailDeliveryAttempt.ts
src/models/EmailTrackingEvent.ts
src/models/EmailSuppression.ts
src/models/EmailAsset.ts
src/models/EmailSenderIdentity.ts
src/models/EmailProviderConfig.ts
src/models/EmailDeliveryConfig.ts
src/models/EmailRateCounter.ts
src/models/EmailDispatchLock.ts
src/lib/email/http.ts                       EmailError + errorResponse
src/lib/email/config/deliveryConfig.ts      read with defaults
src/lib/email/config/crypto.ts              AES-256-GCM for SMTP secrets
src/lib/email/delivery/transport.ts         pooled transporter factory
src/app/api/admin/operations/email/settings/route.ts
src/app/api/admin/operations/email/settings/test/route.ts
src/app/admin/operations/email/settings/page.tsx
src/app/admin/operations/email/settings/SettingsClient.tsx
src/types/email.ts
```

**Files to modify:**
```
src/constants/entityTypes.ts          add codes 11-18
src/lib/db/dbConnect.ts               import every new model
src/components/admin/operations/SideBar.tsx   collapsible group support
src/components/admin/operations/MobileNav.tsx link in the profile sheet
src/proxy.ts                          three new route guards
env.example                           EMAIL_* variables
```

**Tests:** model validation; region scoping on a new model; encrypt and decrypt round trip; SMTP test connection against a real inbox.

**Risks:** the sidebar change touches a file every page uses. Keep it additive — items without `children` must render through exactly the same code path as today.

**Deliverable:** settings screen saves SMTP credentials, test-connection returns the real server greeting, sidebar shows the new group, `npm run db:indexes` builds every index.

---

### Milestone 2 — Templates and the MJML editor (week 3-4)

**Objective:** a designer can build, save and preview an MJML email.

**Dependencies to install:**
```
npm install grapesjs@0.23.9 grapesjs-mjml@1.0.8 mjml@4.18.0
```
Pin all three exactly. `mjml@5` is **not** compatible with the plugin's `mjml-browser@^4.18.0`.

**Files to create:**
```
src/lib/email/template/compile.ts           server-side mjml2html + validate
src/lib/email/template/sanitize.ts          strip script, on* handlers
src/lib/email/template/extractLinks.ts      build the redirect allow-list
src/lib/email/template/blocks.ts            Zan-branded starter blocks
src/app/api/admin/operations/email/templates/route.ts
src/app/api/admin/operations/email/templates/[id]/route.ts
src/app/api/admin/operations/email/templates/[id]/versions/route.ts
src/app/api/admin/operations/email/templates/[id]/compile/route.ts
src/app/api/admin/operations/email/templates/[id]/duplicate/route.ts
src/app/api/admin/operations/email/assets/route.ts
src/app/admin/operations/email/templates/page.tsx
src/app/admin/operations/email/templates/TemplatesClient.tsx
src/app/admin/email-studio/layout.tsx       minimal, no operations chrome
src/app/admin/email-studio/[templateId]/page.tsx
src/components/admin/email/editor/MjmlEditor.tsx      dynamic, ssr:false
src/components/admin/email/editor/EditorToolbar.tsx
src/components/admin/email/editor/AssetPanel.tsx
src/components/admin/email/editor/MergeTokenMenu.tsx
src/components/admin/email/editor/PreviewFrame.tsx    sandboxed iframe
src/components/admin/email/editor/useAutosave.ts
src/components/admin/email/editor/useUnsavedGuard.ts
```

**Tests:** MJML compiles server-side; invalid MJML is refused with readable errors; a `<script>` in imported MJML does not survive sanitisation; the link extractor finds every href; autosave does not create a version; the unsaved-changes guard fires.

**Risks:**
- GrapesJS mounting under React 19 strict effects. Mitigate by destroying the editor in the cleanup function and guarding against double-mount.
- Editor bundle size. Load it only on the studio route, which is outside the operations layout, so no other page pays for it.
- The MJML 4/5 split. Pin and add a comment.

**Deliverable:** a template built by dragging, saved as version 1, previewed on desktop and mobile, with a valid HTML export.

---

### Milestone 3 — Audiences and contacts (week 5)

**Objective:** resolve a CRM audience to a deduplicated, validated recipient list with a visible exclusion breakdown.

**Files to create:**
```
src/lib/email/audience/resolve.ts           rules -> Mongo filters
src/lib/email/audience/normalize.ts         lowercase, trim
src/lib/email/audience/validate.ts          syntax + rejected domains
src/lib/email/audience/dedupe.ts
src/lib/email/audience/eligibility.ts       suppression + consent
src/lib/email/audience/preview.ts           count + breakdown + sample
src/lib/email/contacts/import.ts            reuses read-excel-file
src/app/api/admin/operations/email/audiences/route.ts
src/app/api/admin/operations/email/audiences/[id]/route.ts
src/app/api/admin/operations/email/audiences/preview/route.ts
src/app/api/admin/operations/email/contacts/route.ts
src/app/api/admin/operations/email/contacts/import/route.ts
src/app/api/admin/operations/email/suppression/route.ts
src/app/admin/operations/email/audiences/...
src/app/admin/operations/email/contacts/...
src/app/admin/operations/email/suppression/...
src/components/admin/email/audience/RuleBuilder.tsx
src/components/admin/email/audience/RecipientPreview.tsx
src/components/admin/email/audience/ExclusionBreakdown.tsx
```

**Tests:** 1,000 leads with 120 duplicates resolve to 880; a suppressed address is excluded and counted; a missing email is excluded and counted; mixed lead + client + manual audiences merge correctly; the breakdown adds up to the matched total; a CSV with a formula cell imports as text.

**Risks:** a wide rule on a large lead collection could be slow. Mitigate with a count-only query for the preview and a 2,000-row cap on the preview sample.

---

### Milestone 4 — Delivery engine (week 6-8)

**Objective:** campaigns actually send. This is the milestone that matters.

**Dependencies to install:**
```
npm install @upstash/qstash
```
One package, used only inside the QStash adapter. The worker does not import it.

**Files to create:**
```
src/lib/email/queue/types.ts                QueueAdapter interface
src/lib/email/queue/qstash.ts
src/lib/email/queue/direct.ts               local dev, direct fetch
src/lib/email/queue/index.ts                adapter selection from env
src/lib/email/campaign/transition.ts        the guarded state machine
src/lib/email/campaign/snapshot.ts          audience -> CampaignRecipient rows
src/lib/email/campaign/close.ts             recount and finalise
src/lib/email/delivery/rateLimiter.ts       MongoDB permits
src/lib/email/delivery/claim.ts             the three-step atomic claim
src/lib/email/delivery/send.ts              one recipient, one message
src/lib/email/delivery/classify.ts          SMTP error -> ERROR_CLASS
src/lib/email/delivery/backoff.ts
src/lib/email/delivery/messageId.ts         deterministic Message-ID
src/lib/email/delivery/safety.ts            thresholds and halt
src/lib/email/personalise/render.ts         whitelist merge replacer
src/lib/email/personalise/tokens.ts
src/lib/email/jobs/dispatcher.ts
src/lib/email/jobs/worker.ts
src/lib/email/jobs/sweeper.ts
src/lib/email/jobs/auth.ts                  x-job-secret check
src/app/api/jobs/email/dispatch/route.ts
src/app/api/jobs/email/work/route.ts
src/app/api/admin/operations/email/campaigns/route.ts
src/app/api/admin/operations/email/campaigns/[id]/route.ts
src/app/api/admin/operations/email/campaigns/[id]/schedule/route.ts
src/app/api/admin/operations/email/campaigns/[id]/send-now/route.ts
src/app/api/admin/operations/email/campaigns/[id]/pause/route.ts
src/app/api/admin/operations/email/campaigns/[id]/resume/route.ts
src/app/api/admin/operations/email/campaigns/[id]/cancel/route.ts
src/app/api/admin/operations/email/campaigns/[id]/duplicate/route.ts
src/app/api/admin/operations/email/campaigns/[id]/test-send/route.ts
```

**Files to modify:**
```
vercel.json                  create it; daily cron as the backstop
env.example                  QSTASH_TOKEN, EMAIL_JOB_SECRET
```

**Tests — the ones that matter:**

| Test | What it proves |
|---|---|
| Two dispatchers at the same instant | Only one claims the lock; the other returns `skipped` |
| Two workers claim the same campaign | No recipient is claimed twice |
| Kill the worker mid-send | Lease expires, job goes to UNKNOWN_OUTCOME, never back to QUEUED |
| Duplicate queue message | Dedupe key prevents a second snapshot |
| Pause during sending | Sending stops within one claim cycle; in-flight sends finish |
| Cancel during sending | QUEUED rows become CANCELLED; in-flight rows finish and record |
| Rate limit across 5 concurrent workers | Combined rate never exceeds `globalPerSecond` |
| One recipient 550s | Only that recipient fails; the other 499 send |
| SMTP auth failure | Campaign HALTs; admin is notified; no retry storm |
| Timezone with DST | A non-existent wall time is refused at schedule time |
| Schedule six weeks out | Nothing is in the queue; the dispatcher finds it on the day |

**Risks:**
- **This is where correctness bugs live.** Budget three weeks, not two, and write the concurrency tests before the happy path.
- The 500-recipient simulation must use a mail sink (MailHog locally, or SES sandbox with verified addresses), never real recipients.

**Deliverable:** a 500-recipient campaign sends end to end, with per-recipient status, retries, pause, resume and cancel all working.

---

### Milestone 5 — Tracking and deliverability (week 9-10)

**Files to create:**
```
src/lib/email/tracking/token.ts             HMAC sign and verify
src/lib/email/tracking/inject.ts            pixel + rewrite links
src/lib/email/tracking/record.ts            event write + counter $inc
src/lib/email/tracking/webhook/ses.ts       SNS signature verification
src/app/api/e/o/[token]/route.ts
src/app/api/e/c/[token]/route.ts
src/app/api/e/webhook/[provider]/route.ts
src/app/e/u/[token]/page.tsx                unsubscribe page
src/app/api/e/u/[token]/route.ts
src/app/admin/operations/email/activity/...
```

**Tests:** an invalid token still returns a GIF; a click to a host not in the template's allow-list is refused; the SNS signature is verified before any write; unsubscribe writes a suppression row and is honoured by the next campaign; a hard bounce adds a suppression row; `List-Unsubscribe` headers are present.

**Risks:** the webhook endpoint is public. Verify the provider's signature before touching the database, not after.

---

### Milestone 6 — Reporting and exports (week 11)

**Files to create:**
```
src/lib/email/report/aggregate.ts
src/lib/email/report/compare.ts
src/lib/email/report/workbook.ts            copies lead-sources/sheet/workbook.ts
src/app/api/admin/operations/email/campaigns/[id]/report/route.ts
src/app/api/admin/operations/email/campaigns/[id]/export/route.ts
src/app/api/admin/operations/email/reports/route.ts
src/app/admin/operations/email/page.tsx     Overview
src/app/admin/operations/email/reports/...
src/components/admin/email/report/...
```

Six export sheets: campaign summary, recipients, failures, bounces, engagement, delivery attempts. All server-side, streamed, using the same `attachmentHeader` and text-cell rules as the lead-source workbook so a cell starting with `=` is never run as a formula.

---

### Milestone 7 — Hardening and benchmark (week 12)

- The 500-recipient simulation, measured.
- A 2,000-recipient simulation if the provider rate allows.
- Tune `EmailDeliveryConfig` from the measurements.
- Load the operations screens with 50,000 recipient rows and check the indexes hold.
- Write `docs/email-marketing-operations.md`: how to pause everything, how to read Delivery Activity, what UNKNOWN_OUTCOME means, how to raise the SES rate.

---

## 6. Deferred to a later release

Deliberately not in the twelve weeks:

| Feature | Why later |
|---|---|
| A/B testing, subject lines | Needs a split-audience model and significance maths. A product in itself. |
| A/B testing, content | Same, plus a second template pin per campaign. |
| Drip automation and journeys | A different engine. This is one-shot campaign delivery. |
| Approval workflow | Schema field is included from day one (`approvalRequired`, `approvedBy`). The UI is a week on its own. |
| Scheduled campaign calendar | A month view of scheduled campaigns. Nice, not load-bearing. |
| Send-time optimisation per recipient | Needs engagement history we will not have for months. |

The schema has room for all of them. None needs a migration.

---

## 7. Testing strategy

### 7.1 There is no test runner in this project yet

`package.json` has no `test` script and no test framework. That is a decision to make, not something to assume.

**Proposal: `node --test` with `tsx`.** No new framework, no config file, no Jest or Vitest in a Next 16 app that currently has neither.

```json
"test": "tsx --test src/**/*.test.ts",
"test:email": "tsx --test src/lib/email/**/*.test.ts"
```

Tests that need MongoDB use a `zan_test` database on the existing Atlas cluster, or a local `mongod`. Tests that need SMTP use MailHog in Docker, or a null transport.

### 7.2 Focused by default

The brief asked to avoid running everything after every change, on an i5-8250U with 16 GB. So:

- During development: `npm run test:email -- --test-name-pattern=claim`.
- At a milestone boundary: `npm run test:email`, then `npm run build` once.
- Never: a watcher plus a dev server plus a build at the same time. That machine has four cores.

### 7.3 The 500-recipient simulation

```bash
npm run email:simulate -- --recipients=500 --sink=mailhog
```

Seeds 500 fake contacts in a `zan_test` database, builds a campaign, runs the dispatcher and worker in a loop, and prints:

```
Recipients          500
Wall clock          94.2s
Throughput          5.31/sec
SMTP latency        p50 312ms   p95 847ms   p99 1,284ms
Worker invocations  3
Worker duration     p50 31.4s   max 44.1s
Peak RSS            198 MB
Failures            0
Retries             2
Unknown outcome     0
```

**Never with real recipients.** The seeder only writes addresses on a reserved test domain, and the simulation refuses to run against a database whose name does not end in `_test`.

### 7.4 Fault injection

The concurrency tests in milestone 4 need deliberate failures. A `EMAIL_CHAOS` env var, read only in non-production, that can:

- kill the worker after SMTP accept but before the database write,
- return 421 for one in ten sends,
- delay a send past the lease duration,
- deliver the same queue message twice.

Each maps to one row of the milestone 4 test table.

---

## 8. Development resource management

Per the brief, for a 4-core / 16 GB machine:

- One dev server. `npm run dev`, left running.
- No production build during development. One `npm run build` per milestone.
- MailHog in Docker, 20 MB, instead of a real SMTP account during development.
- No browser automation unless a UI bug needs it.
- No seeding beyond 500 rows locally. The 50,000-row index test runs once, at milestone 7, against the test cluster.
- Three new dependencies total: `grapesjs`, `grapesjs-mjml`, `mjml`, plus `@upstash/qstash`. Four packages for a module this size is restraint, not minimalism.
- `package-lock.json` stays. npm stays. Four-space indentation. Strict types, no `any` in new code.

---

## 9. Summary of what needs your decision

| # | Decision | Default if you say nothing |
|---|---|---|
| 1 | Vercel Pro, $20/month | **Blocks everything.** Hobby forbids commercial use and cannot schedule. |
| 2 | Amazon SES or Brevo | SES. One day of setup, confirms delivery, 5 cents per campaign. |
| 3 | Marketing consent for existing Leads and Clients | **Blocks the first real campaign.** A business and legal decision. |
| 4 | Milestone scope: all seven, or stop after 4 | All seven. Milestones 5 and 6 are what make it a product rather than a sender. |
| 5 | The role lists in section 3 | As proposed. Digital Marketer sends, BDE authors, Admin controls settings. |
| 6 | Test runner: `node --test` + `tsx` | As proposed. No new framework. |

Nothing is built. No dependency is installed. No file is changed. Say which of the six you want different, and I will revise before writing any code.
