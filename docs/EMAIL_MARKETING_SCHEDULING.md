# Email Marketing — setting up the scheduler

The scheduler is a URL. Anything that can send an HTTP request to it on a
timer will do, which is why moving off Vercel later needs no code change.

```
POST  https://<your-app>/api/jobs/email/dispatch
      x-job-secret: <EMAIL_JOB_SECRET>
```

---

## What actually needs a scheduler

Less than it looks.

| | Needs the scheduler? |
|---|---|
| **Send now** | **No.** The route builds the snapshot and wakes a worker itself. |
| Campaigns scheduled for later | Yes |
| Retrying a temporary failure | Yes |
| Recovering a worker that died | Yes |
| Closing a finished campaign | Yes |

So a broken scheduler does not stop anybody sending. It delays scheduled
campaigns and slows recovery, and the next tick catches up on everything it
missed. Nothing is lost, because MongoDB holds the state and the dispatcher
is written to find whatever is outstanding.

---

## Option 1: Vercel Cron, once a day (included in `vercel.json`)

`vercel.json` already declares this. On the Hobby plan a cron may run
**once per day**, so it is a backstop, not a scheduler: it recovers stuck
work and closes finished campaigns, but a campaign scheduled for 10:00 will
not go out at 10:00.

To make Vercel's own scheduler authorised, set `CRON_SECRET` in the project's
environment variables. Vercel sends it as `Authorization: Bearer <value>`,
which the dispatch route accepts. **Without `CRON_SECRET` set, Vercel's cron
request is rejected**, because an unguarded endpoint that can email a hundred
people is worse than one that does not run.

---

## Option 2: Vercel Schedules, every 15 minutes

Vercel Schedules is in beta and allows, on Hobby:

- a run every **15 minutes** at most,
- a **15-minute jitter window** that cannot be reduced,
- 5,000 runs per billing period.

A 15-minute schedule uses about 2,880 runs a month, which fits. **Only create
one schedule**; two would exceed the cap.

Worst case a campaign goes out **30 minutes** after its chosen time: fifteen
for the interval, fifteen for the jitter. The campaign screens say so, taking
the number from `heartbeatIntervalMinutes` in Settings, so change that if you
change the schedule.

---

## Option 3: a free external pinger (the most accurate on Hobby)

Any uptime or cron service that can send a POST with a custom header:

```
URL      https://<your-app>/api/jobs/email/dispatch
Method   POST
Header   x-job-secret: <EMAIL_JOB_SECRET>
Every    1 to 5 minutes
```

This gives better precision than Vercel Schedules on Hobby and costs
nothing. Set `heartbeatIntervalMinutes` in Settings to match, so the
campaign screens quote the right figure.

---

## The environment variables

| Variable | What it does | Required |
|---|---|---|
| `EMAIL_JOB_SECRET` | Guards the dispatcher and worker. 16+ characters. | Yes |
| `EMAIL_PUBLIC_ORIGIN` | How the app reaches its own worker, and the origin in tracking links. | Yes in production |
| `EMAIL_SECRET_KEY` | Encrypts the stored SMTP password. 64 hex characters. | Yes |
| `EMAIL_TRACKING_SECRET` | Signs open and click tokens. | Yes before tracking ships |
| `CRON_SECRET` | Only if Vercel's own scheduler is used. | No |

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Checking it works

```powershell
curl -X POST "https://<your-app>/api/jobs/email/dispatch" -H "x-job-secret: <EMAIL_JOB_SECRET>"
```

A healthy idle response:

```json
{ "success": true, "data": { "skipped": false, "started": [], "failed": [], "resumed": 0, "swept": { "expiredLeases": 0, "retriesReady": 0, "closed": 0 }, "durationMs": 180 } }
```

`"skipped": true` means another dispatcher held the lock, which is normal
when two ticks land together and is not an error.

A 401 means the secret does not match. A 503 means `EMAIL_JOB_SECRET` is
not set on the deployment.
