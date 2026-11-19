# Email Marketing — Infrastructure Research

> **Decisions were made on 19 November 2026. Read [EMAIL_MARKETING_DECISIONS.md](EMAIL_MARKETING_DECISIONS.md) first.**
> The build targets Vercel Hobby, campaigns of up to 100 recipients, Gmail SMTP and no queue service.
> Where this document differs from that one, that one wins. This document holds the research and the full design.

All figures checked 19 November 2026. Sources at the bottom. Prices in USD, before tax.

---

## 1. Recommendation, first

| Layer | Choice | Cost |
|---|---|---|
| Hosting | **Vercel Pro** | $20 / month |
| Heartbeat | **Upstash QStash schedule**, every 60s, pay-as-you-go | about $0.45 / month |
| Queue | **QStash**, behind a `QueueAdapter` interface | about $0.05 / campaign |
| Scheduler state | **MongoDB** (existing Atlas cluster) | $0 extra |
| SMTP | **Amazon SES** | about $0.05 per 500-recipient campaign |
| Assets | **ImageKit** (already in the app) | $0 extra |
| Editor | **GrapesJS + grapesjs-mjml**, MJML pinned to 4.18.0 | $0, BSD-3-Clause |

**Total new spend: about $21 per month** plus roughly 5 cents per campaign.

Vercel Pro is the only meaningful cost, and it is required for commercial use whether or not this module ships.

---

## 2. Vercel: what is actually available

### 2.1 Hobby is not an option

Vercel's Terms of Service, section 4, Hobby Plan:

> "You shall only use the Services under a Hobby plan for your personal or non-commercial use."

Zan CRM is a company's internal tool. That is commercial use. This is not a grey area and it is not about traffic volume.

### 2.2 Function limits

| Setting | Hobby | Pro |
|---|---|---|
| Max duration | 300s | 300s default, up to 800s configurable; 1800s in beta |
| Memory / CPU | 2 GB / 1 vCPU (Standard) | Standard or Performance |
| Multi-region | No | Up to 3 |
| Included invocations | 1,000,000 / month | usage-based |
| Included Active CPU | 4 CPU-hours / month | usage-based |
| Included Provisioned Memory | 360 GB-hours / month | usage-based |
| Over the included amount | **feature pauses for 30 days** | pay as you go |

The brief's assumption of "2 GB memory, 1 vCPU, up to 300 seconds with Fluid Compute" is confirmed for Hobby. Pro gives the same defaults with more headroom.

The Hobby pause behaviour is worth stating plainly: there is no overage billing. Exceed the limit and the feature stops until the next 30-day window. For a tool the sales team depends on, that is an outage with no purchase option.

### 2.3 Fluid Compute

Enabled by default for projects created after 23 April 2025.

What matters for this design:

- **Several invocations can share one instance and one process.** So a module-scope Nodemailer pool is reused across concurrent invocations on a warm instance. Good.
- **It is not guaranteed across instances.** So in-process rate limiting is still wrong at the system level. This is why the design uses a MongoDB counter.
- `waitUntil` continues background work after the response is sent. Useful for tracking-event writes, not for sending.
- An uncaught exception does not kill sibling requests on the same instance.

### 2.4 Scheduling: the hard blocker on Hobby

Vercel is migrating Cron Jobs to a newer product called Schedules, currently in public beta.

**Cron Jobs (legacy):**

| | Jobs per project | Minimum interval | Precision |
|---|---|---|---|
| Hobby | 100 | **once per day** | per-hour, ±59 min |
| Pro | 100 | once per minute | per-minute |

Vercel's docs are explicit: on Hobby, a cron expression that would run more than once a day fails at deploy time with `Hobby accounts are limited to daily cron jobs.`

**Schedules (beta):**

| | Max frequency | Jitter | Runs per billing period |
|---|---|---|---|
| Hobby | every 15 min | always 15 min | 5,000 |
| Pro | every minute | 1 min default | not capped the same way |

A 15-minute schedule with a 15-minute jitter window means a campaign set for 10:00 can go out at 10:29. On Hobby that is the best achievable. It is not a scheduling engine.

Also note: a 15-minute Hobby schedule burns 2,880 runs a month against a 5,000 cap. Two such schedules would exceed it.

**Conclusion:** precise scheduling requires Pro, or an external heartbeat. The design uses an external heartbeat anyway, which is better, because it also removes the Vercel dependency.

### 2.5 Vercel Queues (beta)

Available in beta on all plans.

| Limit | Value |
|---|---|
| Message retention (TTL) | 60s min, **7 days max**, 24h default |
| Delay before visible | up to 7 days, capped at TTL |
| Visibility timeout | up to 60 minutes, 60s default |
| Messages per receive | 1 to **10** |
| Max concurrency per consumer group | 1 to unlimited |
| Max message size | 100 MB |
| Delivery | at-least-once |
| Idempotency key on send | supported, billed at 2x |
| Included (Hobby) | 1,000,000 operations |

**Assessment: good primitive, not yet the right choice.**

For it: at-least-once delivery, per-consumer-group max concurrency (a genuine global throttle), idempotency keys, native to the platform.

Against it: it is beta, and the 7-day retention cap means it can never hold a long-dated schedule. The 10-messages-per-receive cap would bound batch size if we claimed work from the queue — our design claims from MongoDB instead, so it does not bind us, but that is a reason the design is shaped the way it is.

**Plan:** write the adapter interface so Vercel Queues can be switched on later with one file. Do not depend on a beta product for the first release.

### 2.6 Vercel Workflow

Durable step execution on top of Queues. Hobby includes 50,000 workflow events and 1 GB data written per month. Vercel's own docs point to Workflows for work that needs to "pause, resume, and maintain state for minutes to months without duration limits."

**Assessment: wrong shape for this problem.**

A workflow is a good fit for one long-running orchestration with distinct steps. Our problem is 500 independent, individually-retryable units that need recipient-level state in a queryable database for reporting and exports. Modelling 500 recipients as workflow steps means:

- Recipient state lives in the workflow engine, not in MongoDB, so reports and Excel exports have nowhere to read from.
- Event count scales with recipients. 500 recipients at several events each would consume the 50,000 Hobby allowance in about 20 campaigns.
- A vendor-specific programming model, which is the opposite of the portability requirement.

Reconsider only if the module later grows multi-step drip automation, where the step model actually fits.

---

## 3. Queue and scheduler comparison

| | Vercel Queues | Upstash QStash | Inngest | MongoDB + external heartbeat | Dedicated worker |
|---|---|---|---|---|---|
| Status | Beta | GA | GA | n/a, it is our own code | n/a |
| Delivery | at-least-once | at-least-once | at-least-once | exactly what we write | ours |
| Max delay | 7 days | 7 days free, 1 year paid | 30-day sleep on Free | **unlimited** | unlimited |
| Retention | 7 days max | logs 3 days free | 24h traces on Free | unlimited | unlimited |
| Retries | built in | built in, each attempt billed | built in | ours | ours |
| Concurrency control | per consumer group | max parallelism 10 free, 100 paid | 5 concurrent steps on Free | ours | ours |
| Scheduling precision | via Schedules | **per-minute** | per-minute | depends on heartbeat | exact |
| Free tier | 1M ops (Hobby) | 1,000 msg/day, 10 schedules | 50K executions, 500K events | n/a | n/a |
| Entry paid price | usage-based | $1 / 100K messages | from $75-99 / month | n/a | $5-10 / month VPS |
| Commercial use | yes on Pro | yes | yes | yes | yes |
| Operational complexity | low | low | medium | medium | high |
| Migration away | easy behind adapter | easy behind adapter | hard, SDK is invasive | n/a | n/a |
| Vendor lock-in | high | low | **high** | none | none |

### Why QStash

- **$1 per 100,000 messages.** A 60-second heartbeat is about 43,200 messages a month, roughly $0.43. Worker wake-ups add a few dozen per campaign.
- **Max delay of 1 year on paid**, which covers retry backoff and delayed chaining without any ceiling we would hit.
- **It is just an HTTP POST.** QStash calls our endpoint. The endpoint does not import a QStash SDK to do its work. Replacing QStash means changing the caller, not the worker.
- The free tier (1,000 messages a day, 10 schedules) is enough for development and for low campaign volume, but a 60-second heartbeat alone is 1,440 a day, so production needs pay-as-you-go. At under a dollar a month that is not a real decision.

### Why not Inngest

Inngest is a good product and the wrong one here. Its value is the durable-step programming model, which means writing functions in Inngest's SDK. That is exactly the vendor coupling the brief asked to avoid. The Free tier's 5 concurrent steps would also throttle a 500-recipient campaign, and the first paid tier is $75-99 a month against QStash's $0.45.

### Why not a dedicated worker yet

A $5 VPS running a Node process with BullMQ and Redis would be the most capable option. It is also a second deployment target, a second set of secrets, a second thing to patch, and a second thing that can be down. At 500 recipients a campaign it buys nothing the design above does not already provide. The architecture is built so this is a later swap, not a rewrite.

---

## 4. SMTP provider

### 4.1 Gmail cannot do this

Google Workspace, per user:

| Limit | Value |
|---|---|
| Messages per day | 2,000 (1,500 mail merge, 500 on trial) |
| Recipients per message over SMTP (POP/IMAP) | **100** |
| External recipients per day | 3,000 |
| Total recipients per day | 10,000 |
| Unique recipients per day | 3,000, of which 2,000 external |
| Over the limit | sending blocked for up to 24 hours |

One 500-recipient campaign fits inside 2,000 messages a day. Four do not. And the account that gets blocked is the same account that sends booking confirmations and staff notifications.

There is a separate SMTP relay service (`smtp-relay.gmail.com`) with higher limits, but the sources disagree on the numbers and Google's own page defers to a different article. Even at the highest figure quoted, Gmail is not built for marketing mail and offers no bounce webhook, no delivery confirmation and no suppression list. Those three gaps alone rule it out for this module.

**Keep Gmail for transactional mail** (registration, booking). Add a separate provider for marketing. They are different jobs.

### 4.2 The candidates

| | Amazon SES | Brevo | Resend |
|---|---|---|---|
| Price at 10,000 / month | about $1 | $9 tier | $20 Pro tier |
| Price at 100,000 / month | about $10 | about $69-82 | about $35 |
| Free tier | 200/day in sandbox; the old 3,000/month tier is closed to new accounts | 300 / day | 3,000 / month, 100 / day |
| SMTP endpoint | yes | yes | yes |
| Bounce webhook | yes, via SNS | yes | yes |
| Complaint webhook | yes | yes | yes |
| Delivery confirmation | yes | yes | yes |
| Message lookup by ID | yes | partial | partial |
| Suppression list | account-level, built in | built in | built in |
| Setup effort | **high** - domain verification, DKIM, SNS topics, sandbox exit request | low | low |
| Sending rate | 14/sec default, raise on request | tier-dependent | tier-dependent |

### 4.3 Recommendation: Amazon SES

Three reasons, in order:

1. **It confirms delivery and reports bounces properly.** The architecture distinguishes SUBMITTED from DELIVERED. Without a provider that reports delivery, DELIVERED is permanently zero and half the dashboard is empty.
2. **Message lookup by ID closes the UNKNOWN_OUTCOME gap.** After a worker crash we know the Message-ID we generated. SES lets us ask what happened to it. That turns an unresolvable count into a resolvable one.
3. **Cost.** $0.10 per thousand. A 500-recipient campaign costs 5 cents. Brevo's entry tier is $9 a month for a volume we would not reach.

**The cost of choosing SES:** a day of setup. Domain verification, DKIM records, a DMARC policy, an SNS topic for bounces, and a written request to leave the sandbox (which takes 24 hours or so and is sometimes refused on the first try). Budget this into milestone 1, not milestone 5.

**Choose Brevo instead if** you want the setup done in an hour and are comfortable paying $9-15 a month. It is a legitimate trade. Deliverability on a shared Brevo IP is adequate at this volume.

**Do not choose Resend** for this. It is excellent for transactional mail from code, but its marketing side is a separate product priced by contacts, which duplicates what we are building.

### 4.4 Domain and reputation work, whichever provider

This is not optional and it is not a detail:

- SPF record including the provider.
- DKIM signing on the sending domain.
- DMARC policy, starting at `p=none` and tightening.
- A **subdomain for marketing**, for example `news.zanservices.com`. Marketing complaints then cannot damage the reputation of `zanservices.com`, which carries quotations and booking confirmations.
- Warm-up. A brand new sending domain that emits 500 messages on day one looks exactly like a spam source. Start at 50 a day and double every few days.

---

## 5. MJML editor

### 5.1 Recommendation: GrapesJS + grapesjs-mjml

| Package | Version | Licence | Last published |
|---|---|---|---|
| `grapesjs` | 0.23.9 | BSD-3-Clause | 3 Nov 2026 |
| `grapesjs-mjml` | 1.0.8 | BSD-3-Clause | 29 Oct 2026 |
| `mjml` (server) | **pin to 4.18.0** | MIT | - |
| `mjml-browser` | 4.18.0, pulled in by the plugin | MIT | - |

Both are actively maintained, both are permissively licensed, and the plugin is the official one under the GrapesJS organisation, not a fork.

### 5.2 The version trap, stated plainly

`grapesjs-mjml@1.0.8` declares `"mjml-browser": "^4.18.0"`. The latest `mjml` is **5.4.1**, which is outside that range.

If the server installs `mjml@5` and the browser uses `mjml-browser@4.18`, the two compilers can produce different HTML from the same source. Nobody notices until a customer reports a broken layout.

**Install `mjml@4.18.0` exactly.** Pin it. Add a comment in `package.json`'s vicinity explaining why. Revisit only when `grapesjs-mjml` supports MJML 5.

### 5.3 Next.js integration

GrapesJS needs `window`. It must not render on the server:

```tsx
const MjmlEditor = dynamic(() => import("./MjmlEditor"), { ssr: false })
```

React 19 and Next 16 are fine with this. GrapesJS is not a React component; it mounts into a DOM node in `useEffect` and is destroyed on unmount. That is a well-trodden pattern and it does not fight React 19's stricter effects, as long as the destroy call is in the cleanup.

### 5.4 Alternatives considered

| Option | Why not |
|---|---|
| **Unlayer `react-email-editor`** (MIT, v2.1.3) | The editor itself is a hosted Unlayer iframe. Templates are Unlayer JSON, not MJML. The brief requires MJML as the editable source of truth. Rules it out. |
| **`@usewaypoint/email-builder`** (MIT, v0.0.9) | Clean React, block-based. But its document model is its own JSON, not MJML, and the last publish was January 2026. Version 0.0.9 is not a foundation for a core feature. |
| **react-email** (MIT) | Excellent, but it is components in code, not a drag-and-drop editor for non-developers. Wrong audience. |
| **Maizzle** | A build tool, not an editor. |
| **Stripo / Unlayer hosted** | Commercial licence, per-user pricing, and the template lives on their servers. |

### 5.5 What we have to build ourselves

The plugin gives blocks, drag-and-drop, the style manager and MJML import/export. It does not give:

- Merge-variable insertion UI (a toolbar that inserts `{{first_name}}`).
- The asset library panel wired to ImageKit.
- Version history and the save/autosave lifecycle.
- Device preview toggles beyond what GrapesJS ships.
- Test send.

Budget about a week for the editor shell on top of the plugin. Do not budget zero because the plugin "does everything".

---

## 6. MongoDB

Nothing new is needed. Mongoose 9.3.0 and the existing Atlas cluster are sufficient.

What the design relies on, all standard:

- `findOneAndUpdate` with a filter guard, for the dispatch lock and state transitions. Atomic on a single document, which is all we need.
- `updateMany` with a status guard, for bulk job claiming. See the architecture doc, section 6.3.
- `$inc` on counters, for tracking aggregates.
- TTL indexes, for tracking events, delivery attempts and rate-limit buckets.
- Unordered `bulkWrite` for the recipient snapshot, so one duplicate does not abort 499 inserts.

**Transactions are not used.** They would need a replica set (Atlas has one, so it is available) but every operation here is single-document atomic. Adding transactions would buy nothing and cost latency. The one place that looks like it needs one — "mark campaign SENDING and write 500 recipients" — is handled by the QUEUEING state instead, which is simpler and recovers better.

**Document size.** No recipients are embedded in a campaign. No tracking events are embedded in a recipient. The 16 MB limit is never approached. See `EMAIL_MARKETING_DATABASE_SCHEMA.md`.

---

## 7. Cost summary

### Monthly fixed

| Item | Cost |
|---|---|
| Vercel Pro | $20.00 |
| QStash heartbeat, 60s, pay-as-you-go | about $0.45 |
| MongoDB Atlas | existing, $0 extra |
| ImageKit | existing, $0 extra |
| **Total** | **about $20.45** |

### Per campaign, 500 recipients

| Item | Cost |
|---|---|
| Amazon SES, 500 emails | $0.05 |
| QStash worker wake-ups, about 30 | under $0.01 |
| Vercel function time, about 5 minutes of active CPU | within Pro's included credit |
| **Total** | **about $0.06** |

### At scale, 50,000 emails a month

| Item | Cost |
|---|---|
| Vercel Pro | $20.00 |
| QStash | about $1.00 |
| Amazon SES | $5.00 |
| **Total** | **about $26 / month** |

For comparison, Mailchimp at 50,000 sends is in the range of $75-150 a month and does not integrate with the CRM.

---

## 8. What is a hard limit and what is a choice

The brief asked for this distinction. It matters when tuning later.

### Hard platform limits — cannot be changed by us

- Vercel Pro function max duration: 300s default, 800s configurable, 1800s in beta.
- Vercel Hobby cron: once per day. Schedules: every 15 min, 15 min jitter.
- Vercel Queues retention: 7 days. Messages per receive: 10.
- QStash free: 1,000 messages/day, 10 schedules, 7-day delay.
- MongoDB document size: 16 MB.

### Provider limits — changeable by request or by paying

- SES sending rate: 14/sec default, raised on request.
- SES sandbox: 200/day to verified addresses until the exit request is granted.
- Gmail Workspace: 2,000 messages/day per user.
- QStash max parallelism: 10 free, 100 on pay-as-you-go.

### Application limits — our configuration, changeable in the database

Everything in `EmailDeliveryConfig`: logical batch size, jobs per invocation, send concurrency, SMTP connections, global per-second rate, daily budget, lease duration, retry counts, backoff, worker duration budget, global campaign concurrency.

### Benchmark-derived recommendations — to be confirmed by measurement

Every number in `EMAIL_MARKETING_IMPLEMENTATION_PLAN.md` section 5. They are reasoned starting points, not measurements. The 500-recipient simulation produces the real ones.

---

## Sources

- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)
- [Vercel Limits](https://vercel.com/docs/limits)
- [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
- [Vercel Terms of Service](https://vercel.com/legal/terms) — section 4, Hobby Plan
- [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute)
- [Vercel Cron Jobs: usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel Schedules: limits](https://vercel.com/docs/schedules/limits)
- [Vercel Queues](https://vercel.com/docs/queues)
- [Vercel Queues: pricing and limits](https://vercel.com/docs/queues/pricing)
- [Upstash QStash pricing](https://upstash.com/pricing/qstash)
- [Inngest usage limits](https://www.inngest.com/docs/usage-limits/inngest)
- [Gmail sending limits in Google Workspace](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace)
- [Nodemailer: pooled SMTP connections](https://nodemailer.com/smtp/pooled)
- [GrapesJS MJML plugin](https://github.com/GrapesJS/mjml) — npm `grapesjs-mjml@1.0.8`, BSD-3-Clause
- [Amazon SES free tier and rate card 2026](https://smtpedia.com/platforms/amazon-ses/pricing/)
- [Email API pricing comparison](https://www.buildmvpfast.com/api-costs/email)
- [Email Marketing Under DPDP: Consent Rules](https://nodguard.in/email-marketing-dpdp/)
- [DPDP Consent for Marketing on WhatsApp, SMS and Email](https://protectcomply.com/blog/dpdp-consent-whatsapp-sms-email-marketing/)

Provider pricing and beta limits move. Re-check Vercel Queues, Vercel Schedules and SES pricing before the first production campaign.
