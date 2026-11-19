# Email Marketing — Decisions

Approved 19 November 2026. This file is the source of truth for what is being built.

The other four documents hold the research and the full design. Where they differ from this file, **this file wins**. They were written before these decisions were made.

---

## 1. The decisions

| # | Decision | Chosen | Was proposed |
|---|---|---|---|
| 1 | Hosting | **Vercel Hobby** | Vercel Pro |
| 2 | Scheduling precision | **Not important. About 30 minutes is acceptable.** | Per-minute |
| 3 | Campaign size | **Up to 100 recipients** | 500 |
| 4 | SMTP, for testing | **Gmail, already configured** | Amazon SES |
| 5 | SMTP, for real sending | Brevo Starter or SES, later | - |
| 6 | Queue service | **None. Direct HTTP call.** | Upstash QStash |
| 7 | Marketing consent | **Handled. Contacts are compiled with consent.** | Open question |
| 8 | Milestones | All seven | - |
| 9 | Roles | As proposed in the implementation plan, section 3 | - |
| 10 | Test runner | `node --test` with `tsx` | - |

The user is aware of Vercel's Hobby terms and has chosen Hobby deliberately for this build.

---

## 2. What changes because of Hobby

### 2.1 Send now needs no scheduler at all

This is the biggest simplification. "Send now" runs the dispatcher inline from the POST handler. The campaign goes out immediately, with no heartbeat involved.

The heartbeat is only needed for two things:

1. Campaigns scheduled for a later time.
2. Recovering stuck jobs, expired leases and retries.

Both tolerate delay.

### 2.2 Heartbeat

The heartbeat is an HTTP POST to `/api/jobs/email/dispatch`. Anything can send it.

| Option | Precision | Setup |
|---|---|---|
| **Vercel Schedules on Hobby** (chosen) | every 15 min, ±15 min jitter | none, already on the platform |
| Free external pinger | 1–5 min | one account |
| Vercel Cron on Hobby | once a day | recovery only |

Worst case a scheduled campaign goes out 30 minutes late. That is accepted.

**The UI must say so.** Next to the time picker, from config: "Campaigns send within about 30 minutes of the chosen time."

Only **one** schedule may exist. Hobby allows 5,000 schedule runs per billing period, and a 15-minute schedule uses 2,880. A second schedule would exceed the cap. So dispatch and sweep run in the same tick.

### 2.3 No queue service

100 recipients at one per second is 100 seconds. The Hobby function limit is 300 seconds. The whole campaign finishes in one invocation.

So the `direct` adapter is the production adapter. It is a plain HTTP call to our own worker route. No QStash, no `@upstash/qstash` dependency, no second account.

The `QueueAdapter` interface stays. QStash and Vercel Queues drop in later with one new file and one env variable.

This is safe because of the rule that has not changed: **MongoDB is the truth.** If a worker dies mid-campaign, its lease expires and the next heartbeat picks the work up.

### 2.4 Usage budget

Hobby has no overage billing. Exceeding a limit pauses the feature for 30 days.

| Resource | Hobby allowance | Email module | Share |
|---|---|---|---|
| Function invocations | 1,000,000 / month | ~3,000 | 0.3% |
| Provisioned memory | 360 GB-hours | ~1.8 | 0.5% |
| Active CPU | 4 CPU-hours | ~0.09 | 2.3% |

Assumes a 15-minute heartbeat and 20 campaigns a month. The CRM's own page loads use far more.

### 2.5 Safety machinery stays, and matters more

On Pro, a runaway retry loop costs money. On Hobby it pauses the whole project for 30 days, taking leads, meetings and the booking page down with it.

So these are **not** optional:

- Global daily send budget.
- Kill switch.
- Halt on SMTP auth failure, with no retry.
- Bounded retry attempts with jitter.

### 2.6 `EmailDeliveryAttempt` matters more, not less

Hobby keeps runtime logs for **one hour**. A campaign that ran this morning has no Vercel logs left. Our own attempt log in MongoDB, with its 90-day retention, is the only record. Keep it.

---

## 3. Configuration values for this build

These replace the table in the implementation plan, section 4.2.

| Setting | Value | Why |
|---|---|---|
| `maxJobsPerInvocation` | 100 | The whole campaign in one claim |
| `sendConcurrency` | 2 | One pooled connection; more just queues inside Nodemailer |
| `maxConnections` (SMTP) | 1 | Connections multiply across instances |
| `maxMessages` (SMTP) | 100 | Nodemailer default |
| `globalPerSecond` | 2 | Gentle on Gmail. Raise for a real provider. |
| `globalPerDay` | 500 | A guard against a loop, well under Gmail's 2,000 |
| `workerDurationBudgetMs` | 180,000 | Of a 300,000 ceiling |
| `workerSafetyFraction` | 0.70 | Stop claiming at 210s, leave 90s to finish |
| `leaseDurationMs` | 120,000 | Longer than any single send, short enough to recover fast |
| `maxAttemptsTransient` | 5 | |
| `maxAttemptsPermanent` | 1 | A 550 is never retried |
| `backoffBaseMs` | 2,000 | |
| `backoffMaxMs` | 900,000 | 15 minutes |
| `globalCampaignConcurrency` | 1 | One campaign at a time |
| `unknownOutcomePolicy` | never resend | Safe default |
| `heartbeatIntervalMinutes` | 15 | Drives the UI's precision note |

At `globalPerSecond: 2`, a 100-recipient campaign takes about 50 seconds.

All of these live in `EmailDeliveryConfig` in MongoDB. Changing them is a settings edit, not a deploy.

---

## 4. Schema change

**`EmailBatch` is dropped.** With campaigns of 100 it would always be one batch. Progress reads better as "47 of 100 sent" straight from the campaign counters.

15 collections, not 16. `CampaignRecipient.batchId` is kept as an optional field so batches can be added later without a migration.

---

## 5. SMTP staging

**Now, for testing:** Gmail, through the existing `SMTP_*` environment variables. No setup.

What this costs: Gmail reports no bounces and confirms no deliveries. So `DELIVERED` and `BOUNCED` stay at zero. The UI already handles this — those tiles read "not reported by your provider" instead of showing a false number.

**Later, for real marketing:** Brevo Starter at $9/month, or Amazon SES after its sandbox is lifted. Brevo's free tier puts the Brevo logo on every email and shares its 300/day between campaigns and transactional mail, so it is not suitable for branded marketing.

**One caution for either stage.** Sending marketing from the same Workspace address that sends booking confirmations puts both at risk if a recipient marks it as spam. Use a dedicated sender address even while testing.

---

## 6. Revised timeline

About 9 weeks, down from 12.

| Milestone | Weeks | Change |
|---|---|---|
| 1. Foundation | 1.5 | 15 models instead of 16 |
| 2. Templates and MJML editor | 2 | unchanged |
| 3. Audiences and contacts | 1 | unchanged |
| 4. Delivery engine | 2 | was 3; no queue service, single-invocation path |
| 5. Tracking and deliverability | 1.5 | unchanged |
| 6. Reporting and exports | 1 | unchanged |
| 7. Hardening and benchmark | 0.5 | 100-recipient simulation, 300 for headroom |

The MJML editor is unchanged and is still the largest single piece of work. `mjml` is still pinned to 4.18.0.

---

## 7. The path back to Pro

Nothing here blocks an upgrade. Moving to Pro later means:

1. Change the Vercel Schedules cron to every minute and drop the jitter.
2. Change `heartbeatIntervalMinutes` to 1. The UI's precision note updates itself.
3. Optionally set `EMAIL_QUEUE_ADAPTER=qstash` and add the token.
4. Raise `globalPerSecond` once the sending provider allows it.

Three config changes and one optional file. No redesign.
