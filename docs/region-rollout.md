# Region rollout

Multi-region support for leads, clients and projects.
Last updated 2026-09-21.

Region codes are the strings in `src/lib/region.ts`: `"IN" | "US" | "AE"`.
Not dial codes. Dial code 1 is the US and Canada, so it is not a unique id,
and a sales region is not a phone country.

---

## 1. How it works

A user holds a `regions` array. A record holds one `region` string.
`requireAuth` puts the user's regions into AsyncLocalStorage, and a Mongoose
plugin adds the filter to every query. Routes do not mention regions at all.

| Piece | File |
|---|---|
| Region catalogue | `src/lib/region.ts` |
| Per-request scope | `src/lib/region-scope/regionContext.ts` |
| The Mongoose plugin | `src/lib/region-scope/regionScopePlugin.ts` |
| Region for new top-level records | `src/lib/region-scope/resolveWriteRegion.ts` |
| Backfill | `src/scripts/backfill-region.ts` |
| Proof that it filters | `src/scripts/test-region-scope.ts` |
| Grant and switch rules | `src/scripts/test-region-grant.ts` |
| UI checks before merge | `docs/region-ui-test-plan.md` |
| Adversarial API testing | `docs/region-test-brief.md` |

Scoped models: Lead, Client, Project, Interaction, Meeting, Call, Quotation,
Document, User.

### Reads

`regionScopePlugin` registers `find`, `countDocuments`, `distinct`,
`aggregate`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany` and
`replaceOne`.

A single `pre(/^find/)` hook is not enough. That regex matches `find`,
`findOne`, `findOneAndUpdate`, `findOneAndDelete` and `findOneAndReplace`
only. Every paginated list route calls `countDocuments` for its total, so
without the extra hook a user would see 8 rows and a total of 358, and every
page after the first would be empty.

### Writes

A new record gets its region in this order:

1. A region the route set. The route knows best.
2. The parent record's region. A call logged on an IN lead is an IN call,
   whoever typed it.
3. The signed-in user's region, when they hold exactly one.

If none of those produce a value the save throws. An unstamped record would
match no region filter, so nobody, not even an admin, would ever see it again.

Parent lookups are wired per model: Interaction, Meeting, Call and Quotation
use `entityType` + `entityId`; Client uses `leadId`; Project uses `clientId`;
Document uses `projectId` then `clientId`.

### No context means deny

With no region in context the filter matches nothing.

An empty list is a bug somebody reports within an hour. A leak is a bug
nobody reports.

### User administration is a separate axis

Who may administer staff accounts is decided by role. Which regions a person
may read data from is decided by `regions`. They are not the same question.

HR covers India for leads and clients but hires for every region. So the roles
in `CROSS_REGION_USER_ADMIN_ROLES` (`src/constants/userRoles.ts`, currently
Admin 10 and HR 20) get two things:

1. They may grant any region, not only the ones they hold.
2. The `/users` list and detail routes read outside the region scope for them.
   Without that, HR would create a US account and watch it vanish from the
   list, unable to edit it.

This widens nothing else. Leads, clients, projects and the assignee picker
stay region-scoped for these roles like everyone else. The picker in
particular must stay scoped: you should not be able to assign an IN lead to
someone who cannot open it.

A scoped list with an unscoped total would read "0 of 12", so the row query
and the count use the same wrapper.

### The bypass

`runWithoutRegionScope` skips the filter. Every use is a hole in the wall, so
the list is short and each call site carries a comment:

- `getUserFromRequest` and `login`. They look a user up before the scope
  exists, so they cannot be filtered by it.
- `auth/me` and the three `auth/profile` routes. They decode the token
  themselves instead of going through `requireAuth`, so no context exists.
  Each reads only the signed-in user's own row.
- The email uniqueness checks in the users routes. The unique index on email
  is global, so a scoped check would miss a user in another region and the
  insert would fail with a driver error instead of a clean 409.
- The booking host lookup. The host is a config value, not user data.

Public intake does **not** use the bypass. `public/leads`, `public/booking`
and the Facebook webhook call `enterRegionContext` with the deploy region
instead, so they get a real scope and their writes are stamped normally.

### The lazy-callback trap

A Mongoose query is lazy. `() => User.findById(id)` builds a Query and runs
nothing.

`AsyncLocalStorage.run()` restores the previous context as soon as the
callback returns, so a callback that returns an un-awaited Query leaves the
context before the query executes. Every such call was denied, including the
one that loads the signed-in user.

`runWithRegionContext` now awaits inside `run()`, so the short form is safe.
`test-region-scope.ts` has a check for this. Do not remove it.

---

## 2. Running it

```bash
npm run db:backfill-region                # dry run, reads only
npm run db:backfill-region -- --apply     # writes
npm run db:indexes                        # builds the new region indexes
npm run db:test-region-scope              # proves the filter filters
```

The backfill prints every user with the regions it would give them, based on
role. Read that table before using `--apply`.

| Role | Regions |
|---|---|
| 10 Admin | all |
| 90 System user | all |
| 65 US Sales Agent | US |
| 69 US Leads Manager | US |
| everyone else | the default region |

---

## 3. Still to do

### 3.1 Make the fields required

`region` and `regions` are optional in the schemas today, so the backfill can
run before the app starts enforcing anything.

Once `npm run db:backfill-region` reports nothing left, add `required: true`
to `region` on each model. `regions` on User is already required.

### 3.2 A region picker for leads and clients

An admin holds three regions, so there is no single region to stamp. The API
already handles this: `POST /leads` and `POST /clients` accept a `region`
field, checked against the caller's own regions by `resolveWriteRegion`.

The lead and client forms do not send it yet. Until they do, an admin creating
a lead by hand gets "Pick a region. Your account covers: IN, US, AE."

Someone who holds one region never sees the field.

**The user forms are done.** Create, edit and the user card all handle regions.
`RegionSelect` and `RegionBadges` in
`src/components/admin/operations/region/` are reusable for the lead and client
forms. The grant rules live in `src/lib/region-scope/regionGrant.ts` and are
covered by `npm run db:test-region-grant`.

### 3.2a The active region, and what "All regions" means

`src/contexts/RegionContext.tsx` holds what the signed-in person is looking
at. It used to read NEXT_PUBLIC_REGION, one region per deployment. It now
reads the user.

Two values, and the difference matters:

- `active` — what they are looking at. `"ALL"` when they hold more than one
  region and have not narrowed it. Someone with one region gets that region
  and has nothing to switch to.
- `config` — the single region for anything that needs exactly one, such as
  parsing a phone number typed with no country code. `"ALL"` resolves to
  India.

`ALL_REGIONS` is deliberately not a `RegionCode`. No record is stored with
it and no query filter uses it, so it cannot reach the database by being
passed to the wrong function.

None of this is a security boundary. The server decides what a query returns,
from the user row. A person could change `active` in their browser and still
read only their own regions.

`RegionIndicator` shows it next to the logo in the sidebar and the mobile
header. Flag plus code, or a globe and "All regions".

**Decided:** in "All regions" mode a create form preselects **India** and
lets the admin change it. The value is on screen rather than hidden, so it is
a default and not a silent assumption. The cost is that an admin who meant US
and did not look gets an India lead.

Side effect worth knowing: phone parsing follows `config`. A US rep typing a
local number now gets +1 instead of failing as an Indian number. An admin in
"All regions" typing a US number without +1 still gets India.

### 3.3 Notifications still pick recipients by role

`src/lib/notifications/resolveRecipients.ts` queries
`User.find({ role: { $in: roles } })`. User is a scoped model, so that query
is now filtered by the **actor's** regions.

That is most of the fix. It is not all of it: an admin who creates a US lead
holds every region, so staff in every region are notified.

The real fix is to pass the record's region into `resolveRecipients` and
filter on that instead of on the actor. Small change, worth doing.

### 3.4 Activity log and heatmap are not scoped

`ActivityLog` has no region field and no plugin. IN staff can read US lead
names in the audit feed.

It was left out because the entity-to-region mapping is ambiguous for User
rows: a user has several regions, a log row has one entity. Decide that first.

`heatmap` uses `aggregate` and `meta` uses `distinct`. Both are covered by the
plugin once ActivityLog gets one.

### 3.5 The phone unique index is global

`Lead.phone` is unique across every region.

A US rep entering a number that already belongs to an IN lead is told
"Another lead already has this phone number." They cannot see that lead and
cannot proceed.

This is not a leak. `findLeadByPhone` returns only the message, never the
lead. It is a dead end for the user. Make the message say the number belongs
to another region and to contact an admin.

Two call sites read the raw driver to check this index, and both must stay
unfiltered. Adding a region filter would make the check pass and the insert
then hit the index, turning a clear message into a 500:

- `src/lib/leads/findLeadByPhone.ts`
- `src/app/api/public/booking/route.ts`

Both carry a comment saying so.

### 3.6 Facebook Lead Ads needs a real region rule

The webhook currently uses the deploy region. One deploy can receive forms
from several regions. Map `form_id` to a region when that happens.

---

## 4. Subdomains — parked

The plan was `us.zan-workspace.vercel.app`. That will not work. Vercel
assigns `<project>.vercel.app` and does not let you add a nested subdomain
under it. A custom domain is needed first.

Three things to remember when that happens:

1. The login cookie in `src/app/api/auth/login/route.ts` has no `domain`
   option, so it is host-only. A user who signs in on one host is signed out
   on another. Set `domain: ".yourdomain.com"`.

2. A user hitting another region's subdomain must get the `/unauthorized`
   page, not a login form. There is one account per user, not one per region.
   Asking a signed-in user to sign in again teaches them the app is broken.

3. The JWT already carries `regions` for this. `src/proxy.ts` runs at the edge
   and cannot read the database, so it needs the token copy. API routes must
   keep ignoring it and reading the user row, because the token lasts 7 days
   and a revoked region would otherwise stay live for a week.

The subdomain is a view selector. It is not a security boundary.

When the admin region switch arrives, it narrows `regions` and `writeRegion`
in the region context and nothing else changes.
