# Region rollout — open work

Status notes for the multi-region change. Written 2026-09-21.

The plan: a `regions` array on User, a `region` field on each record, and one
set of Mongoose hooks that filters every query by the signed-in user's regions.
Admin holds all region codes, so admin sees everything.

Region codes stay the existing strings in `src/lib/region.ts`:
`"IN" | "US" | "AE"`. Not dial codes. Dial code 1 is the US and Canada, so it
is not a unique id, and a sales region is not a phone country.

---

## 1. Deferred — fix after the main work lands

These do not block the rollout. They will show wrong data until fixed.
None of them change the shape of the code, so fixing them later is cheap.

### 1.1 Notifications go to the wrong region — this one is a leak

`src/lib/notifications/resolveRecipients.ts:16` picks recipients by role only.

An IN staff member will get a bell notification reading "New lead: John Smith"
for a US lead. The lead name is inside the notification text. Clicking it gives
a 403, because the lead itself is filtered.

So it leaks the name and leaves a broken link.

Fix: add `region` to the `User.find({ role: { $in: roles } })` query, and pass
the parent record's region into `resolveRecipients`.

This is the highest priority item in this file.

### 1.2 Stats snapshot is one global document

`src/models/StatsSnapshot.ts` uses a fixed string `_id`. There is one row for
the whole app. Every region would read the same cached counts.

The dashboard is the first screen everyone opens, so the wrong numbers are
visible from day one.

Fix: put the region in the `_id`, for example `global:US`. Also check
`src/lib/stats/invalidateStats.ts` so a write in one region does not clear
another region's cache.

### 1.3 Activity log and heatmap are not scoped

`/api/admin/operations/activity-logs` and its `heatmap` and `meta` routes read
every row. IN staff would read US lead names in the audit feed.

Decide whether audit rows are region-scoped. They probably should be.

`heatmap` uses `aggregate` and `meta` uses `distinct`. Neither is covered by a
`pre(/^find/)` hook. See section 2.

### 1.4 The phone unique index is global

`src/models/Lead.ts` has a unique index on `phone` that covers every region.

A US rep entering a number that already belongs to an IN lead gets
"Another lead already has this phone number." They cannot see that lead and
cannot proceed.

This is not a leak. `src/lib/leads/findLeadByPhone.ts` returns only the message,
never the lead name.

It is a dead end for the user. Fix: make the message say the number belongs to
another region and to contact an admin.

---

## 2. Not deferred — the query gap

A Mongoose `pre(/^find/)` hook matches `find`, `findOne`, `findOneAndUpdate`
and `findOneAndDelete`. It does not match everything else.

This gap already exists in the current soft-delete hook. Deleted leads are
counted in pagination totals today. For `deletedAt` that is a small bug. For
region it is a leak.

| Call | Uses in `src` | What happens without a fix |
|---|---|---|
| `countDocuments` | 21 | Pagination totals count other regions. A user sees 8 rows and a total of 358. Later pages are empty. |
| `aggregate` | 6 | `computeOverallStats` and the activity heatmap read every region. |
| `Lead.collection.findOne` | 2 | Raw driver. Skips every Mongoose hook. |
| `ActivityLog.distinct` | 1 | Same. |

Raw driver call sites:

- `src/app/api/public/booking/route.ts:103`
- `src/lib/leads/findLeadByPhone.ts:26`

Both read deleted leads on purpose, which is why they bypass Mongoose. They
need the region filter added by hand.

### What to build

Three hooks per model, not one:

1. `pre(/^find/)` — the existing pattern.
2. `pre("countDocuments")` — same filter.
3. `pre("aggregate")` — `unshift` a `$match` stage at the front of the pipeline.

Then fix the two raw calls and the one `distinct` by hand.

### Default to deny

The region comes from AsyncLocalStorage, the same way the audit actor does in
`src/lib/activity-log/auditContext.ts`. That module uses `enterWith`, so the
context is set for the rest of the request after `requireAuth` runs.

If a route ever queries before calling `requireAuth`, there is no context.

When there is no region in context, the hook must return nothing.

An empty list is a bug someone reports within an hour. A leak is a bug nobody
reports.

---

## 3. Still to decide

### 3.1 Public intake has no signed-in user

Three endpoints create leads with nobody signed in:

- `POST /api/public/leads` — the client portal
- `POST /api/public/booking` — the booking page
- `/api/webhooks/facebook/leads` — Facebook Lead Ads

The hook will have no region in context for any of them.

For the portal and the booking page, the deploy region works.

For Facebook Lead Ads there is no obvious answer. Map the form id to a region,
or fall back to the phone country. Pick one before shipping. The alternative is
200 leads landing with no region and nobody noticing for a week.

### 3.2 Writes are not covered by the read hooks

The hooks filter reads. They do not stamp `region` on create.

A `pre("save")` default that reads the same context covers most writes.
`insertMany` and any raw insert skip it.

### 3.3 Region must survive conversion

Lead to client to project. The convert route has to carry `region` forward.

### 3.4 Child records

`Interaction`, `Meeting`, `Call`, `Quotation`, `Document` and `Notification`
all hang off a parent. Copy `region` onto each of them rather than joining to
the parent on every read. It costs one field and saves a lookup everywhere.

---

## 4. Subdomains — parked

The plan was `us.zan-workspace.vercel.app`. That will not work. Vercel assigns
`<project>.vercel.app` and does not let you add a nested subdomain under it.
A custom domain is needed first.

Two things to remember when that happens:

1. The login cookie in `src/app/api/auth/login/route.ts` has no `domain`
   option, so it is host-only. A user who signs in on one host is signed out on
   another. Set `domain: ".yourdomain.com"`.

2. A user hitting another region's subdomain must get the `/unauthorized` page,
   not a login form. There is one account per user, not one per region. Asking a
   signed-in user to sign in again teaches them the app is broken.

The subdomain is a view selector. It is not a security boundary.
