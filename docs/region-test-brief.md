# Region segregation — testing brief

For an agent testing branch `features/region-segregation` against `main`.

Your job is to break it. Assume the implementation is wrong until you have
shown otherwise. Prefer evidence from a real request or a real query over
reading the code and concluding it looks fine.

46 files changed, 1795 insertions. 5 commits. Working tree is clean.

---

## 1. What this branch does

The CRM was single-region. It now serves India, the US and the UAE from one
deployment, with the data separated by team.

- A user holds `regions: RegionCode[]`. Admin holds all three.
- A record holds one `region: RegionCode`.
- `requireAuth` puts the user's regions into AsyncLocalStorage.
- A Mongoose plugin adds the region filter to every query on every scoped model.

No route handler contains a region filter. That is the design: 46 routes could
not each be patched correctly by hand, so the filter lives in one place.

**Region codes are strings: `"IN" | "US" | "AE"`.** Not dial codes.

### Scoped models

Lead, Client, Project, Interaction, Meeting, Call, Quotation, Document, User.

User is scoped on `regions` (array overlap). The rest on `region` (single value).

ActivityLog and StatsSnapshot are **not** scoped. See section 6.

### Key files

| Purpose | File |
|---|---|
| Region catalogue | `src/lib/region.ts` |
| Per-request context | `src/lib/region-scope/regionContext.ts` |
| The plugin | `src/lib/region-scope/regionScopePlugin.ts` |
| Region for new top-level records | `src/lib/region-scope/resolveWriteRegion.ts` |
| Context setup | `src/lib/auth/requireAuth.ts` |
| Backfill | `src/scripts/backfill-region.ts` |
| Scope proof | `src/scripts/test-region-scope.ts` |

---

## 2. The three rules to attack

**Reads.** The plugin hooks `find`, `countDocuments`, `distinct`, `aggregate`,
`updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `replaceOne`. A
`pre(/^find/)` hook alone would miss most of those. Find a query kind it
misses.

**Writes.** A new record gets its region from, in order: the route, the parent
record, the user's single region. If none apply the save throws. Find a create
path that produces a record with no region. Such a record is invisible to
everyone forever, including admin.

**No context means deny.** With no region in context the filter matches
nothing. Find a path that reaches a scoped model with no context and returns
data anyway.

---

## 3. Current data — everything is IN

```
Lead         IN=27     Interaction  IN=176
Client       IN=10     Meeting      IN=43
Project      IN=8      Call         IN=14
Quotation    IN=8      Document     (empty)
```

**There is no US or AE data yet.** Create some before testing, or every "US
user sees nothing" result is a false pass.

### Accounts

| Email | Role | Regions | Use for |
|---|---|---|---|
| `operations@zanservices.com` | 10 Admin | IN, US, AE | sees everything; `writeRegion` is null |
| `support@zanservices.com` | 10 Admin | IN, US, AE | API ingestion bot |
| `subbu@gmail.com` | 10 Admin | IN, US, AE | third admin |
| `robin@zanservices.com` | 60 BDE | IN | normal single-region user |
| `tech@zanservices.com` | 69 US Leads Mgr | US | **the negative control** |
| `accountant@zanservices.com` | 70 | IN | |
| `marketing@zanservices.com` | 50 | IN | |

`tech@zanservices.com` is the important one. It must see zero IN records
everywhere. Any IN data reaching that account is a leak.

Passwords are not in the repo. Ask the human, or create a test user.

### Seed a US record first

Admin holds three regions, so `writeRegion` is null and the request must name
one:

```bash
curl -X POST http://localhost:3000/api/admin/operations/leads \
  -H "Content-Type: application/json" \
  -H "Cookie: auth_token=<admin token>" \
  -d '{"name":"US Test","phone":"+14155550142","source":"manual","region":"US"}'
```

Then sign in as `tech@zanservices.com` and confirm it is the only lead visible.

---

## 4. Attack surfaces, in rough order of value

### 4.1 Cross-region read

Walk every endpoint as `tech@zanservices.com` (US). Anything returning IN data
is a leak. Pay special attention to:

- Pagination `total`. It comes from `countDocuments`, which a naive hook
  misses. A list of 0 rows with a total of 27 is a leak of row counts.
- Global search (`/api/admin/operations/search`) — spans four collections.
- `aggregate` users: `computeOverallStats`, `activity-logs/heatmap`.
- `populate()` calls — they issue a second query on the referenced model.
- Anything reached by `refId` rather than by a scoped query.

### 4.2 Who may grant which region

User create and edit now carry a region picker. The rules are in
`src/lib/region-scope/regionGrant.ts`, shared by POST and PATCH, and covered
by `npm run db:test-region-grant`. Three rules to attack:

1. You cannot grant a region you do not hold, UNLESS your role is in
   `CROSS_REGION_USER_ADMIN_ROLES` (Admin 10, HR 20). HR holds IN only and
   must still be able to create a US account. Try posting `regions=US` as
   role 15 or 69, which must fail, and as role 20, which must succeed.
2. Regions the target already holds that you do not are preserved. An IN-only
   editor must not be able to strip a colleague's US access, including by
   omitting it.
3. The result is never empty.

Also: a user cannot change their own regions, the same guard as role and
isActive. Try it by id, and try it by posting an unchanged list.

The `/users` list and detail routes read outside the region scope for Admin
and HR only. Check the boundary: role 15 and role 69 must still see a scoped
list, and `/users/picker` must stay scoped for everyone, including HR. An
IN lead must not be assignable to US-only staff.

The picker is UI only. Post the form directly and ignore it.

### 4.3 Cross-region write

As a US-only user, try to write into IN:

- `POST /leads` and `POST /clients` with `"region":"IN"` in the body.
  `resolveWriteRegion` should return 403. The clients route spreads the whole
  body into the document, so check it really replaces `region` rather than
  passing it through.
- `PATCH` any record and try to change its `region`.
- Log an interaction, call, quotation or meeting against an IN parent id.
  The plugin inherits the parent's region, so check what happens when the
  parent is not readable.

### 4.4 The bypass list

`runWithoutRegionScope` skips the filter entirely. Nine call sites in
production code, each commented. Verify none can be steered into returning
bulk data. Full list:

```
lib/auth/getUserFromRequest.ts:60        user lookup, establishes the scope
app/api/auth/login/route.ts:48           lookup by email before any scope
app/api/auth/me/route.ts:64              decodes the token itself
app/api/auth/profile/route.ts:40         decodes the token itself
app/api/auth/profile/avatar/route.ts:57  decodes the token itself
app/api/auth/profile/password/route.ts:60 decodes the token itself
app/api/admin/operations/users/route.ts:202       email uniqueness
app/api/admin/operations/users/[id]/route.ts:127  email uniqueness
app/api/public/booking/route.ts:227      host lookup, host is config
```

Regenerate the list yourself, it is the load-bearing one:

```bash
grep -rn "runWithoutRegionScope(" src --include=*.ts | grep -v region-scope/
```

Any call site not on this list is either new or something to question.

The email checks are the most interesting. They must reveal existence only,
never a row.

### 4.5 Routes that skip requireAuth

These had **no auth at all** before this branch and were fixed here. Re-check
each returns 401 when signed out:

```
leads/[id]/interactions      leads/[id]/meetings      leads/[id]/client
clients/[id]/interactions    projects/[id]/interactions
interactions (GET and POST)
```

`POST /interactions` previously took `createdBy` from the request body. Try to
forge authorship.

**`admin/operations/seeder` still has no auth.** Known, not fixed, flagged for
deletion. An unauthenticated GET that calls `project.save()` on every project.
Confirm it, then move on — it is already reported.

### 4.6 Deliberately unscoped raw-driver reads

Two call sites read `Model.collection` directly and skip every Mongoose hook.
This is correct, not a bug — they guard the **global** unique index on
`Lead.phone`, and a region-filtered check would pass and then hit the index,
turning a clear 409 into a 500.

- `src/lib/leads/findLeadByPhone.ts`
- `src/app/api/public/booking/route.ts` (the 11000 catch)

What to verify: the message must never reveal the other lead's name, owner or
region. Today it returns a fixed string. Confirm that.

### 4.7 The two async-context traps

Both of these shipped broken once during this work. Check for regressions.

**`enterWith` after an await.** `AsyncLocalStorage.enterWith()` only reaches
the caller while it runs inside the caller's synchronous execution. `requireAuth`
therefore enters both stores empty *before* awaiting the user lookup, then
fills them in by mutation. If someone moves those calls below the `await`, every
route silently returns empty lists.

**Lazy Mongoose queries.** `runWithRegionContext(() => Model.find())` returns a
Query without awaiting it. `als.run()` restores the old context before the query
executes. The helper now awaits inside `run()`.

Both have regression cases in `npm run db:test-region-scope`. Verify those
cases actually fail if you break the code — a test that cannot fail is worse
than no test.

**One missing `await` already caused this**: `meetings/route.ts` called
`requireAuth(req)` without `await`. Grep for others.

### 4.8 Records that vanish

A record with no `region` matches no filter and is invisible to everyone. Try
to create one:

- `insertMany` paths
- any raw `Model.collection.insertOne`
- creating a child whose parent has no region
- admin creating a top-level record without naming a region (should throw,
  not save)

---

## 5. Commands

```bash
npm run build                  # must compile clean
npm run db:test-region-scope   # 13 checks, all must pass
npm run db:test-region-grant   # 13 checks, grant rules, no database
npm run db:backfill-region     # dry run; must report "nothing to do"
npm run db:indexes             # region indexes on all 9 collections
```

`db:backfill-region -- --apply` writes. Do not run it against data you care
about without reading its dry run first.

---

## 6. Known and accepted — do not re-report

These are written up in `docs/region-rollout.md`. Confirming them is fine.
Reporting them as discoveries is noise.

1. **ActivityLog is not scoped.** IN staff can read US lead names in the audit
   feed. Left out because the entity-to-region mapping is ambiguous for User
   rows. `heatmap` uses `aggregate`, `meta` uses `distinct`.
2. **Notification recipients.** `resolveRecipients` filters by the **actor's**
   regions, not the record's. An admin creating a US lead notifies everyone.
   Partially fixed only because User is a scoped model.
3. **`Lead.phone` is globally unique.** A US rep can be told a number is taken
   by a lead they cannot see. Dead end, not a leak.
4. **No region picker on the lead and client forms.** The API accepts
   `region` on both; the forms do not send it. An admin creating a lead by
   hand gets "Pick a region. Your account covers: IN, US, AE." The **user**
   forms do have a picker, so treat those as in scope.
5. **`region` is still optional in the schemas.** Deliberate, so the backfill
   could run first. `regions` on User is required.
6. **Subdomains are not built.** `us.zan-workspace.vercel.app` will not work on
   Vercel. The JWT carries `regions` for `src/proxy.ts` but nothing reads it yet.
7. **`seeder` route has no auth.** Flagged for deletion.
8. **Facebook Lead Ads uses the deploy region**, not a per-form mapping.

---

## 7. What a real finding looks like

Good: "As `tech@zanservices.com` (US), `GET /api/admin/operations/search?q=a`
returned 3 IN clients. Here is the response body."

Not useful: "The plugin might not cover X." Check whether it does.

For each finding give the request, the account used, the actual response, and
what you expected instead.
