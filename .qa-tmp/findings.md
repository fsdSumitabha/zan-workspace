# Region segregation - UI test run
Branch: features/region-segregation
Date: 2026-09-22
DB: zan_services (live dev)

## Baseline (raw driver)
leads: 28 total, 7 soft-deleted. Live IN=20, US=1.
clients 10 (IN 10), projects 8 (IN 8), meetings 43 (IN 43),
interactions 178 (IN 177, US 1), calls 14 (IN), quotations 8 (IN)
notifications 80, ALL with no region field.

## Test users
admin  operations@zanservices.com role 10 [IN,US,AE]
IN     robin@zanservices.com      role 60 [IN]
US     steven@zanservices.com     role 15 [US]   (substitute for missing role-60 US user)
role   tech@zanservices.com       role 69 [US]   (section 7 only)
Role 15 is allowed on every route the plan touches, so it is a valid US stand-in.

## Results

### 3.1 admin pill  -- PARTIAL
violet OK, globe OK, clickable OK.
Label reads "Planet", plan expects "All regions".

### 3.2 dropdown  -- PASS
Planet / India / United States / United Arab Emirates. Current ticked. Flags render.

### 3.3 pick United States  -- PASS
Pill -> US flag + "US", sky blue. server activeRegion=US. Dashboard 21 leads -> 1.

### 3.4 reload  -- PASS
Still US after reload.

### 3.5 back to all regions  -- PASS
Pill -> violet "Planet". server activeRegion=ALL.

### 5.5 admin pinned US leads total  -- PASS
total 1, rows 1, pages 1.

### BUG 1  totals ignore soft delete  -- FAIL (5.1, 5.4, section 11)
Admin pinned IN: list header "27 leads found", body "No leads found",
sidebar "Leads 20", footer "Page 3 of 3".
API: page1 10 rows, page2 10 rows, page3 0 rows, pagination.total 27, pages 3.
Live IN leads = 20. 7 IN leads are soft deleted.
Admin in ALL: total 28, actual rows 21.
Region filter IS applied to countDocuments (27 != 28). Soft delete filter is NOT.
Predicted in docs/region-rollout.md section 2. Not caused by this branch,
but it fails the section 11 checklist twice:
 - empty last page
 - row count and total disagree

### 6.8 / 6.9 global search  -- PASS
admin ALL  "Brendon" (US lead) -> found.  "Sehwag" (IN lead) -> found.
admin IN   "Brendon" -> "No results for Brendon".  "Sehwag" -> found.
admin US   "Brendon" -> found.  "Sehwag" -> no results.
Confirmed in the UI, not only the API.

### 5.6 / 5.7 stats cache key  -- PASS
Cache _id is region aware: operations_stats:AE-IN-US, :IN, :US, :AE.
ALL leads 21 / clients 10 / projects 8
IN  leads 20 / clients 10 / projects 8
US  leads 1  / clients 0  / projects 0
AE  all zero
IN + US = ALL for every entity. overall-stats agrees. Soft delete respected here.

### BUG 2  admin cannot create a lead or client from the UI  -- FAIL (4.6, 4.7, 4.8)
Admin, role 10, regions IN US AE.
Create Lead form fields: name, phone, email, source. No region control.
src/components/admin/operations/LeadForm.tsx posts {name,email,source,phone}. No region.
src/components/admin/operations/ClientForm.tsx has no region either.

POST /api/admin/operations/leads as admin:
  pinned ALL, no region  -> 500 "Failed to create lead"
  pinned US,  no region  -> 500 "Failed to create lead"
  pinned ALL, region US  -> 201, saved US
  pinned ALL, region IN  -> 201, saved IN
POST /api/admin/operations/clients: 500 in both pinned modes.

Two separate defects.

(a) The form never sends region, so the admin path always throws.
    Known gap in docs/region-rollout.md 3.2. Plan item 4.7 expects it done.

(b) The thrown RegionChoiceError is never caught.
    src/app/api/admin/operations/leads/route.ts:16  imports RegionChoiceError
    src/app/api/admin/operations/clients/route.ts:15 imports RegionChoiceError
    Neither catch block tests `instanceof RegionChoiceError`.
    Only users/route.ts:267 and users/[id]/route.ts:58 do.
    So the documented 400 "Pick a region. Your account covers: IN, US, AE."
    becomes a 500 "Failed to create lead".

(c) 4.6 fails for a second reason. Pinning to US should give one write region.
    requireAuth (src/lib/auth/requireAuth.ts:71) narrows the AsyncLocalStorage
    region context to regions:['US'], writeRegion:'US'.
    But it returns the raw user row, whose user.regions is still [IN,US,AE].
    resolveWriteRegion reads authUser.regions, not region.writeRegion,
    so it still sees 3 regions and throws.
    Fix: resolveWriteRegion should prefer the narrowed context writeRegion.

Records created for later checks (explicit region, via API):
  lead 6ab2949d6c42feb02d04a171  QA ADMIN ALL EXPLICIT US 01  region US
  lead 6ab2949e6c42feb02d04a17f  QA ADMIN ALL EXPLICIT IN 01  region IN

### 3.8 mobile width  -- PASS
Two switchers in the DOM. Sidebar one hidden at 375px. Mobile header one
visible at x=104, flag only, no code. Opens, all four options, current ticked.

### 8.1 - 8.5 timeline actions as admin in All regions  -- PASS
Note added via UI on the IN lead. Toast "Note added successfully", appears in timeline.
Then note, meeting and call created on both an IN lead and a US lead.

Region stamped on every child record, read straight from the DB:
  IN lead children: interaction IN, interaction IN, interaction IN, meeting IN, call IN
  US lead children: interaction US, interaction US, interaction US, meeting US, call US
  Records with no region: interactions 0, meetings 0, calls 0, quotations 0.

This is the "Watch for admin" case in section 8. It passes.
An admin holding three regions produced correctly stamped single-region children.

### 8.5 lead status  -- PASS
Status must advance one stage at a time. "You can only move to the next stage"
when jumping New -> Negotiation. That is a business rule, not a region issue.
Stepping 20,30,40,50 worked on both leads.

### 9.1 / 9.2 / 9.9 convert  -- PASS
Admin in All regions, IN lead converted via the UI. Toast "Lead converted successfully".
  client 6ab295ad6c42feb02d04a3d1  QA Test Company IN  region IN
  client 6ab295b76c42feb02d04a40f  QA Test Company US  region US
The client took the region from the lead, not from the admin. 9.9 passes.

### 9.5 / 9.10 projects  -- PASS
  project 6ab295c36c42feb02d04a43a  QA Project IN  region IN
  project 6ab295c46c42feb02d04a448  QA Project US  region US
Project took the region from the client.

### 9.7 project status  -- PASS
PATCH status 120 -> 200 "Project status updated successfully".

### 5.4 admin All regions sidebar  -- PASS
Upcoming meetings panel showed both "QA admin meeting IN" and "QA admin meeting US".

## QA records created (kept, dev DB)
lead    6ab2949e6c42feb02d04a17f  QA ADMIN ALL EXPLICIT IN 01  IN  (converted)
lead    6ab2949d6c42feb02d04a171  QA ADMIN ALL EXPLICIT US 01  US  (converted)
client  6ab295ad6c42feb02d04a3d1  QA Test Company IN           IN
client  6ab295b76c42feb02d04a40f  QA Test Company US           US
project 6ab295c36c42feb02d04a43a  QA Project IN                IN
project 6ab295c46c42feb02d04a448  QA Project US                US
plus notes, calls and meetings on both leads

## Pre-existing records used for cross region URL tests
IN lead    6ab13e721da5b4382aaf23ef
IN client  6aabe8f5b2e5a2297493ecf8
IN project 6a0f06131889eb78226716d7
IN meeting 6ab13f141da5b4382aaf2493
US lead    6ab2545b638430825711119d

## ROBIN (role 60, IN only)

### 3.6 pill not clickable  -- PASS
No dropdown button in the DOM. Pill is a plain span, one svg (flag), no chevron.
title "Working in India". Amber. Robin also has no Users and no Activity Log link.

### 3.7 pin did not follow the next user  -- PASS (partial)
Admin was pinned to US before logout. Robin's session opened as IN.
Full check still to do: sign admin back in and confirm the pill reads All regions.

### 4.2 / 5.3 / 9.4 / 9.6 no US data anywhere  -- PASS
Full sweep of every list Robin can reach. Rows returned and regions seen:
  leads         22 rows  regions [IN]  US 0
  clients       12 rows  regions [IN]  US 0
  projects      10 rows  regions [IN]  US 0
  meetings      45 rows  regions [IN]  US 0
  interactions 100 rows  regions [IN]  US 0
Stats: leads 22, clients 12, projects 10. Matches the row counts.

### 4.3 Robin creates a lead  -- PASS
No region field on the form, correct for a one region account.
Phone defaults to +91. Toast "Lead created successfully".
lead 6ab36d539d42144dfc3410e3 region IN.
This is the same form that gives the admin a 500. One region works, three fails.

### 6.2 - 6.5 cross region URLs  -- PASS
As Robin, pasted every US record URL:
  US lead   6ab2545b638430825711119d -> 404 "Lead not found"    (seen on screen)
  US lead   6ab2949d6c42feb02d04a171 -> 404 "Lead not found"
  US client 6ab295b76c42feb02d04a40f -> 404 "Client not found"
  US project 6ab295c46c42feb02d04a448 -> 404 "Project not found" (seen on screen)
  IN lead control                    -> 200
Minor inconsistency, no leak: the sub routes
/leads/<usId>/interactions and /leads/<usId>/meetings return 200 with an
empty list instead of 404. Body is {"success":true,"interactions":[]}.
No US data in either.

### 6.7 global search  -- PASS
Robin searched Brendon, QA ADMIN ALL EXPLICIT US, QA Test Company US,
QA Project US, QA admin meeting US. All returned total 0.
QA Project IN and Sehwag returned 1 each.

### 8.1 - 8.8 Robin timeline  -- PASS
Note, meeting, call all saved on Robin's own IN lead. Status stepped 20 to 50.
Upcoming meetings panel showed only IN meetings, never the US one.

### 9.1 - 9.7 Robin convert chain  -- PASS
client  6ab36d849d42144dfc3411e4  QA Robin Company IN  region IN
project 6ab36d8f9d42144dfc34121a  QA Robin Project IN  region IN
Project status change 200.

### 10.1 notifications  -- MATCHES KNOWN GAP
Robin received 37 notifications, 10 of them about US records, including
US lead name, US company name and US project name in the visible text.
Confirmed on the Notifications page on screen.
Clicking through is blocked: the US project link landed on "Project not found".
So it matches docs/region-rollout.md 3.3. Names leak, records do not open.

### 10.2 activity log  -- DOES NOT REPRODUCE FOR ROLE 60
Robin sees 35 rows, total 35, all with user Robin Uthappa, zero US rows.
Reason: src/app/api/admin/operations/activity-logs/route.ts:284 sets
filter.userId = authUser.id for anyone not in ADMIN_ROLES [10,20].
So role 60 only ever sees its own actions.
The documented gap would instead hit role 20 HR, who is in ADMIN_ROLES but
holds only IN. Not tested, no HR password.

### BUG 3  cross region WRITE is allowed  -- FAIL. Most serious finding.
Robin holds IN only. Robin cannot READ any US record. Robin CAN WRITE to them.

As Robin, against US records:
  POST /api/admin/operations/notes     on US lead    -> 201 Created
  POST /api/admin/operations/meetings  on US lead    -> 201 Created
  POST /api/admin/operations/calls     on US lead    -> 201 Created
  POST /api/admin/operations/projects  on US client  -> 201 Created

Verified in the database. Four records, all region US, all createdBy Robin:
  interactions  region=US  createdBy=ROBIN(IN)  "INTRUSION TEST"
  interactions  region=US  createdBy=ROBIN(IN)  "INTRUSION TEST MEETING"
  meetings      region=US  createdBy=ROBIN(IN)  "INTRUSION TEST MEETING"
  projects      region=US  createdBy=ROBIN(IN)  "INTRUSION TEST PROJECT"
  plus one call, region US, "INTRUSION TEST CALL"

Robin cannot read them back. Write only injection into another region.

Routes that load the parent first correctly refuse:
  PATCH /leads/<usId>/status   -> 404 Lead not found
  PATCH /projects/<usId>/status-> 404 Project not found
  POST  /leads/<usId>/convert  -> 404 Lead not found

Root cause. src/lib/region-scope/regionScopePlugin.ts:113
readParentRegion uses model.collection.findOne, the raw driver, on purpose
"past every hook". It returns the parent region and the child is stamped with
it. The stamping rule is right. What is missing is the check that the caller
may touch that parent at all. No child create route loads its parent through
a region scoped query first.

Suggested fix, one place. In the pre("validate") stamp block, after
parentRegion is resolved, reject when ctx is present, not bypassed, and
ctx.regions does not include parentRegion. That closes notes, calls, meetings,
quotations, documents, projects and clients at once, and keeps the branch's
rule that routes do not mention regions.

The plan's one rule is "a person sees and touches only their own region's
data". Sees is enforced. Touches is not.

## STEVEN (role 15, US only) -- stand in for the missing role 60 US user

### 5.3 / 4.4 lists are US only  -- PASS
  leads         2 rows  total 2   regions [US]
  clients       1 row   total 1   regions [US]
  projects      2 rows  total 2   regions [US]
  meetings      2 rows  total 2   regions [US]
  interactions 11 rows  total 11  regions [US]
Stats: leads 2, clients 1, projects 2. Row counts and totals agree.
No IN record anywhere. Robin's leads are absent.

### 6.2 - 6.5 reverse direction  -- PASS
  IN lead Sehwag   -> 404 Lead not found
  IN lead QA       -> 404 Lead not found
  IN client QA     -> 404 Client not found
  IN project QA    -> 404 Project not found
  search "Sehwag"  -> total 0
  search "QA Project IN" -> total 0

### 4.1 / 6.6 US user creates and opens  -- PASS
Create Lead form: no region field, correct for one region.
Phone defaulted to +1 with a US placeholder "(201) 555-0123".
Typed 2125550188, saved as +1 212 555 0188. Region aware phone parsing works.
lead 6ab36f1e9d42144dfc34145c saved. Detail page opened, timeline rendered.

### 8.x / 9.x Steven's own chain  -- PASS
note 201, meeting 201, call 201, status 20 30 40 50 all 200.
client  6ab36f3b9d42144dfc34152a  QA Steven Company US  region US
project 6ab36f449d42144dfc341540  QA Steven Project US  region US
project status change 200.

### region switch cannot widen  -- PASS
POST /api/auth/region as Steven:
  IN          -> 403 "You cannot switch to that region. Your account covers: US."
  AE          -> 403
  "in"        -> 403
  ["IN","US"] -> 403
  ALL         -> 200, resolves to active US, regions [US]
After every attempt: regions [US], leads all US. No widening.

### BUG 3 confirmed symmetric, and it has visible impact
Steven (US only) wrote into IN. All 201:
  note, meeting, call on an IN lead. project on an IN client.

Full picture from the database, 12 records:
  interactions region=US written by ROBIN (IN only)   INTRUSION TEST
  interactions region=US written by ROBIN (IN only)   INTRUSION TEST MEETING
  interactions region=US written by ROBIN (IN only)   INTRUSION TEST CALL
  interactions region=IN written by STEVEN (US only)  REVERSE INTRUSION US to IN
  interactions region=IN written by STEVEN (US only)  REVERSE INTRUSION MEETING
  interactions region=IN written by STEVEN (US only)  REVERSE INTRUSION CALL
  meetings     region=US written by ROBIN (IN only)   INTRUSION TEST MEETING
  meetings     region=IN written by STEVEN (US only)  REVERSE INTRUSION MEETING
  projects     region=US written by ROBIN (IN only)   INTRUSION TEST PROJECT
  projects     region=IN written by STEVEN (US only)  REVERSE INTRUSION PROJECT
  calls        region=US written by ROBIN (IN only)
  calls        region=IN written by STEVEN (US only)

Impact seen on screen: Steven's Projects page lists "INTRUSION TEST PROJECT"
and his Upcoming Meetings panel lists "INTRUSION TEST MEETING". Both were
written by Robin, who holds no US access and cannot read them back.

DELETE is safe. DELETE on an IN lead as Steven returned
404 "Lead not found or already deleted". Delete loads the row first, so the
region filter catches it.

The split is consistent:
  loads the target first (GET detail, PATCH status, convert, DELETE) -> refused
  creates a child from a raw entityId in the body (notes, calls, meetings,
  projects) -> allowed

### Currency is hardcoded to rupees  -- minor, region related
A US user sees "₹1" and "₹1,000" on US projects.
Hardcoded in at least: ProjectCard.tsx:75, ProjectDetail.tsx:182/190/197,
OverallStatsPanel.tsx:130-133, QuotationItem.tsx:54/58,
QuotationForm.tsx:112, ProjectEditForm.tsx:184,
projects/create/page.tsx:154, clients/[clientId]/projects/create/page.tsx:162,
ClientProjectPreviewCard.tsx:51 (toLocaleString "en-IN"),
notifications/render.ts:201.
Not in the test plan. Reporting because the branch is about regions.

## TECH (role 69, US) -- section 7 only

### 7.1 role gate on Projects  -- PASS
Sidebar for role 69: Dashboard, Leads, Clients, Meetings, Users.
No Projects item.
Direct URL /admin/operations/projects showed a shield icon and
"Access Denied - You aren't authorized to perform this action."
Clearly an access error, not an empty list. Exactly what the plan asks for.
This is a role limit, not a region one.

### extra: users list and assignee picker are region scoped  -- PASS
Role 69 is on the /users route but is NOT in CROSS_REGION_USER_ADMIN_ROLES.
Users list returned 5 rows, total 5. Every one of them holds US:
  steven US, tech US, and the three admins who hold IN US AE.
IN only staff (robin, hr, development, fullstackdev, marketing, accountant,
ashwani, opm) were all excluded.
Assignee picker returned the same 5. Matches the rule in region-rollout.md
that the picker must stay scoped.

### minor: stats panel shows a count for a page the role cannot open
Role 69 sees "Projects Running 3" in the side panel while the Projects page
returns Access Denied. Cosmetic, not a region issue.

## FINAL VERIFICATION (admin, All regions)

### 3.7 pin does not survive logout  -- PASS
Admin was pinned to US before logging out. After signing back in:
activeRegion "ALL", pill violet "Planet". The US pin was gone.
Both /auth/logout and /auth/login delete ACTIVE_REGION_COOKIE.

### 5.4 all = IN + US  -- PASS
            ALL rows   IN rows   US rows
  leads       25         22        3
  clients     14         12        2
  projects    14         11        3
  meetings    49         46        3
Every ALL figure is exactly IN + US.

### 8.7 admin sees everything  -- PASS
Upcoming meetings panel listed IN meetings, US meetings and both
intrusion meetings together.

### region stamping never failed  -- PASS
Database sweep of all 8 scoped collections after ~60 writes:
  leads 25 live, clients 14, projects 14, interactions 215,
  meetings 49, calls 20, quotations 8, documents 0
  Records with no region: 0
Not one unstamped record. This was the stated risk in region-rollout.md
and it did not happen once.

### BUG 1 at final scale
  leads ALL: 25 rows, total reported 32.  Off by 7.
  leads IN : 22 rows, total reported 29.  Off by 7.
  leads US : 3 rows,  total reported 3.   Correct.
7 is exactly the number of soft deleted leads. Every other collection
agrees because none of them have soft deleted rows yet.
