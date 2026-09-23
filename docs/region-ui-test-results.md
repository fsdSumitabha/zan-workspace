# Region UI test results

Branch `features/region-segregation`. Tested 2026-09-22 and 2026-09-23.
Live dev database `zan_services`. All checks done in a browser as a real
signed-in user.

---

## Verdict

**Do not merge yet. One blocking bug. One that stops admins working.**

Reading is solid. No user ever saw another region's data, in any list, any
detail page, any search, or any count. Region stamping never failed once
across about 60 writes.

Writing is not solid. A user can create records in a region they cannot read.

---

## Test users

| Who | Email | Role | Regions |
|---|---|---|---|
| Admin | `operations@zanservices.com` | 10 | IN, US, AE |
| IN user | `robin@zanservices.com` | 60 | IN |
| US user | `steven@zanservices.com` | 15 | US |
| Role check | `tech@zanservices.com` | 69 | US |

The plan asked for a new role 60 US user. We used Steven, role 15, instead.
Role 15 is allowed on every route the plan touches, so the comparison is
still about region and not about role.

---

## Bug 1. A user can write into a region they cannot read

**Severity: blocking.**

Robin holds IN only. Robin cannot read any US record. Robin can create
records inside US.

As Robin, against US records:

| Request | Result |
|---|---|
| `POST /api/admin/operations/notes` on a US lead | 201 Created |
| `POST /api/admin/operations/meetings` on a US lead | 201 Created |
| `POST /api/admin/operations/calls` on a US lead | 201 Created |
| `POST /api/admin/operations/projects` on a US client | 201 Created |

The same works in reverse. Steven holds US only and created a note, a
meeting, a call and a project inside IN.

Twelve records were created this way. Every one carries the target region
and the wrong author.

```
interactions  region=US  createdBy ROBIN (IN only)
meetings      region=US  createdBy ROBIN (IN only)
projects      region=US  createdBy ROBIN (IN only)
calls         region=US  createdBy ROBIN (IN only)
interactions  region=IN  createdBy STEVEN (US only)
meetings      region=IN  createdBy STEVEN (US only)
projects      region=IN  createdBy STEVEN (US only)
calls         region=IN  createdBy STEVEN (US only)
```

The author cannot read the record back. The other region can. Steven's
Projects page lists "INTRUSION TEST PROJECT" and his upcoming meetings panel
lists "INTRUSION TEST MEETING". Robin wrote both.

### Why

`src/lib/region-scope/regionScopePlugin.ts:113`

```ts
const row = await model.collection.findOne(
    { _id: id },
    { projection: { region: 1 } }
)
```

`readParentRegion` reads the parent with the raw driver, on purpose, past
every hook. It returns the parent's region and the child is stamped with it.

The stamping rule is correct. A call logged on an IN lead should be an IN
call. What is missing is the check that the caller may touch that parent at
all. No child create route loads its parent through a region scoped query
first.

Routes that do load the target first are safe:

| Request | Result |
|---|---|
| `PATCH /leads/<other region id>/status` | 404 Lead not found |
| `PATCH /projects/<other region id>/status` | 404 Project not found |
| `POST /leads/<other region id>/convert` | 404 Lead not found |
| `DELETE /leads/<other region id>` | 404 Lead not found |

### The fix

One place. In the `pre("validate")` stamp block, after `parentRegion` is
resolved, refuse the save when a region context exists, is not bypassed, and
does not include `parentRegion`.

That closes notes, calls, meetings, quotations, documents, projects and
clients at once. It also keeps the branch's own rule that routes never
mention regions.

---

## Bug 2. An admin cannot create a lead or a client

**Severity: high. The feature does not work for admins at all.**

| Who | Pinned to | Result |
|---|---|---|
| Admin | All regions | 500 "Failed to create lead" |
| Admin | US | 500 "Failed to create lead" |
| Admin | All regions, `region: "US"` sent by hand | 201, saved US |
| Admin | All regions, `region: "IN"` sent by hand | 201, saved IN |
| Robin | IN, one region | 201, saved IN |
| Steven | US, one region | 201, saved US |

Clients behave the same way. 500 in both pinned modes.

The API is fine. It works the moment a region is supplied. Three separate
things are wrong above it.

### 2a. The form has no region field

`src/components/admin/operations/LeadForm.tsx` posts only
`{name, email, source, phone}`. `ClientForm.tsx` has no region either.

Test 4.7 expects a region field showing India, preselected and changeable.
There is no such field on screen. This is the known gap in
`docs/region-rollout.md` section 3.2, but the plan expects it finished.

### 2b. The helpful error never reaches the user

`resolveWriteRegion` throws `RegionChoiceError` with the message
"Pick a region. Your account covers: IN, US, AE."

Both routes import that error and neither catches it:

- `src/app/api/admin/operations/leads/route.ts:16`
- `src/app/api/admin/operations/clients/route.ts:15`

Only the users routes test `instanceof RegionChoiceError`
(`users/route.ts:267`, `users/[id]/route.ts:58`).

So a clear 400 becomes a 500 "Failed to create lead".

### 2c. Pinning to one region does not help

Test 4.6 expects an admin pinned to US to save a lead as US with no picker.
It returns 500.

`requireAuth` (`src/lib/auth/requireAuth.ts:71`) narrows the request context
correctly to `regions: ["US"], writeRegion: "US"`. But it returns the raw
user row, and `user.regions` is still `["IN","US","AE"]`.

`resolveWriteRegion` reads `authUser.regions`, not the narrowed
`writeRegion`, so it still sees three regions and throws.

### The fix

Three parts. Any one alone leaves a gap.

1. Add the region field to the lead and client forms. `RegionSelect` already
   exists in `src/components/admin/operations/region/`.
2. Catch `RegionChoiceError` in both routes and return its `statusCode`
   and `message`, the way the users routes already do.
3. Make `resolveWriteRegion` prefer the narrowed context `writeRegion`
   before falling back to `authUser.regions`.

---

## Bug 3. List totals ignore deleted rows

**Severity: medium. Visible to every user, every day.**

Admin pinned to India, on the Leads page, three numbers on one screen:

- List header: "27 leads found"
- List body: "No leads found"
- Side panel: "Leads 20"
- Footer: "Page 3 of 3"

Page 3 returned zero rows.

At the end of the run:

| View | Rows | Total shown | Wrong by |
|---|---|---|---|
| Admin, all regions | 25 | 32 | 7 |
| Admin, India | 22 | 29 | 7 |
| Admin, United States | 3 | 3 | 0 |

Seven is exactly the number of soft deleted leads.

The region filter is correct. It reaches `countDocuments`, which is why India
shows 29 and not 32. The soft delete filter does not reach it.

Leads is the only collection with deleted rows today, so it is the only one
that shows the fault. Clients, projects and meetings all agree. They will
break the same way the first time a row is deleted.

This is predicted in `docs/region-rollout.md` section 2. It is older than
this branch. It still fails two lines of the plan's own checklist: no empty
last page, and no list where the row count and the total disagree.

### The fix

Apply the soft delete condition to `countDocuments` as well as `find`. The
list route and its count must use the same filter.

---

## What works

Everything below was checked and passed.

**The region switch.** Violet pill with a globe for all regions. Flag plus
code when pinned. Blue for US, amber for IN. Four options, current one
ticked. The choice survives a hard refresh. It is gone after logout, so the
next person does not inherit it. On a phone the pill moves to the top bar and
shows the flag only, and still opens.

A person with one region gets a plain badge. No dropdown, nothing to click.

**Reading.** No user saw another region's data anywhere. Full sweeps of
leads, clients, projects, meetings and interactions returned only the user's
own region, for Robin and for Steven.

**Direct URLs.** Every cross region URL was refused, in both directions.
"Lead not found", "Client not found", "Project not found". No record was ever
returned. This was the most important check in the plan and it passed.

**Search.** Robin searching a US lead name gets nothing. Steven searching an
IN name gets nothing. The admin finds both in all regions, and stops finding
the US one the moment they pin to India.

**Counts.** Admin figures equal IN plus US exactly, for every entity. The
stats cache key includes the region set, so pinning changes the numbers and
nothing goes stale.

**Region stamping.** About 60 writes, across every scoped collection. Zero
records with no region. An admin holding three regions still produced
correctly stamped single region children every time.

**The convert chain.** Test 9.9 was the trap. An admin in all regions
converted an IN lead and the client came out IN. The US lead gave a US
client. Projects took the region from the client. The region came from the
record, never from the admin.

**Phone parsing.** Steven's create form defaults to +1 with a US
placeholder. Robin's defaults to +91. An admin in all regions gets +91.

**Roles.** Role 69 has no Projects menu item, and the direct URL shows
"Access Denied", not an empty list. The users list and the assignee picker
are region scoped for role 69, so an IN lead cannot be assigned to someone
who could not open it.

**The switch cannot widen access.** Steven tried to switch to IN, to AE,
with lowercase, and with an array. Every attempt returned 403. "All regions"
resolved to US only.

---

## Known gaps, confirmed as documented

**Notifications.** Robin received 37 notifications. Ten were about US
records and showed the US lead name, the US company name and the US project
name in plain text. Names leak.

The plan says to report only if something worse happens, such as opening a
record from the link. That does not happen. Clicking the US project
notification lands on "Project not found". This matches
`docs/region-rollout.md` section 3.3.

**Activity log.** This did not reproduce for Robin. Role 60 only ever sees
its own rows, because
`src/app/api/admin/operations/activity-logs/route.ts:284` sets
`filter.userId = authUser.id` for anyone outside roles 10 and 20.

The documented gap would hit role 20, HR, who is inside that list but holds
IN only. We did not test HR. Worth checking before relying on the log.

---

## Smaller things

**Label mismatch.** The pill and the dropdown say "Planet". The plan says
"All regions" throughout. Pick one.

**Sub routes answer 200 instead of 404.** For a lead in another region,
`/leads/<id>/interactions` and `/leads/<id>/meetings` return
`{"success":true,"interactions":[]}` rather than 404. No data leaks. The
detail route beside them returns 404, so the pair disagree.

**Currency is always rupees.** A US user sees "₹1,000" on US projects. The
symbol is hardcoded in about twelve places, including `ProjectCard.tsx:75`,
`ProjectDetail.tsx:182`, `OverallStatsPanel.tsx:130-133` and
`QuotationItem.tsx:54`. Not in the plan, but this branch is about regions.

**A count for a page the role cannot open.** Role 69 sees "Projects Running
3" in the side panel while the Projects page returns Access Denied.

---

## Test records left in the database

These were created during the run and kept.

Normal test data:

```
lead    6ab2949e6c42feb02d04a17f  QA ADMIN ALL EXPLICIT IN 01   IN
lead    6ab2949d6c42feb02d04a171  QA ADMIN ALL EXPLICIT US 01   US
lead    6ab36d539d42144dfc3410e3  QA ROBIN IN LEAD 01           IN
lead    6ab36f1e9d42144dfc34145c  QA STEVEN US LEAD 01          US
client  6ab295ad6c42feb02d04a3d1  QA Test Company IN            IN
client  6ab295b76c42feb02d04a40f  QA Test Company US            US
client  6ab36d849d42144dfc3411e4  QA Robin Company IN           IN
client  6ab36f3b9d42144dfc34152a  QA Steven Company US          US
project 6ab295c36c42feb02d04a43a  QA Project IN                 IN
project 6ab295c46c42feb02d04a448  QA Project US                 US
project 6ab36d8f9d42144dfc34121a  QA Robin Project IN           IN
project 6ab36f449d42144dfc341540  QA Steven Project US          US
```

Plus notes, calls and meetings on each lead.

Evidence for bug 1. Twelve records whose title or description starts with
"INTRUSION TEST" or "REVERSE INTRUSION". These sit in the wrong region and
are visible to the other team. Delete them once bug 1 is fixed.

---

## Checklist from the plan

- [ ] US user created, role 60, region US only — used role 15 instead
- [ ] Sections 3 to 9 pass — section 4 fails, see bug 2
- [x] Section 10 matches the known behaviour, nothing worse
- [ ] No empty last page anywhere — see bug 3
- [ ] No list where the row count and the total disagree — see bug 3
- [x] Every URL pasted across regions was refused
