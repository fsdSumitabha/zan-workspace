# Ad tracking and the bulk lead import

Where each lead came from: which campaign, ad set, ad and lead form.
And how a sheet of leads, such as a Meta leads export, is imported.
Last updated 2026-11-23.

---

## 1. The short version

- A sheet of leads is imported from **Ad Tracking → Import leads**, or the **Import leads** button on the Leads page.
- The file is checked first. Nothing is saved until the person presses **Import**.
- Each campaign, ad set, ad and lead form is saved **once**. Every later import reuses it.
- Each lead points at **one** ad record: the most specific one it has. Usually that is the Ad.
- From the Ad, the chain goes up: Ad → Ad set → Campaign.
- The form questions and answers go into the lead's **first note**, written by the importer.
- **One notification** is sent for the whole sheet, in the importer's name: "Saransh imported 86 leads".
- Every lead, note and import record has `createdBy` / `uploadedBy` = the importer's user id.

---

## 2. The models and how they connect

Four ad records, plus the import, plus new fields on Lead.

```
AdCampaign                      one Meta campaign
    ▲
    │ campaign
AdSet                           one ad set, belongs to one campaign
    ▲
    │ adSet  (and campaign, copied for fast queries)
Ad ──────────── leadForm ──────▶ LeadForm     one form, used by many ads
    ▲                               ▲
    │                               │
    │ sourceReference               │ leadForm
    │ (most specific record)        │ (always, when the lead has a form)
    │                               │
Lead ───────────────────────────────┘
    │
    │ importId
    ▼
LeadImport                      one imported sheet, with its report
```

### Why the form is not in the chain

The first plan had the chain Lead form → Ad → Ad set → Campaign, with the lead pointing at the form.
That does not work with Meta's data.

**One form is used by many ads.** A typical campaign has 3 ad sets with 2 ads each, and all 6 ads open
the same "Website enquiry" form. If a lead pointed only at the form, there would be no way to know which
of the 6 ads brought it. Every lead from that form would look like it came from the same ad.

So the link goes the other way: the **Ad points at the form** (`Ad.leadForm`).
And the lead keeps two links:

| Lead field | Points at | When |
|---|---|---|
| `sourceReference` + `sourceReferenceModel` | The most specific ad record: Ad, else AdSet, else AdCampaign, else LeadForm | Always, when the row has any ad id |
| `leadForm` | The form the person filled in | Always, when the row has a form id |

The form is the `sourceReference` only for an **organic** lead: someone who found the form without an ad.
Then there is no ad, ad set or campaign to point at.

### Reading the chain back

`sourceReferenceModel` tells Mongoose which collection `sourceReference` is in (`refPath`).
So one populate call walks up the chain:

```ts
const lead = await Lead.findById(id)
const ad = await Ad.findById(lead.sourceReference)   // when sourceReferenceModel is "Ad"
    .populate("adSet")
    .populate("campaign")
    .populate("leadForm")
```

`resolveLeadAdSource()` in `src/lib/ad-tracking/records.ts` does this for the lead page.

### The fields

**Every ad record** (`src/models/adRecord.ts`):

| Field | Meaning |
|---|---|
| `platform` | `META`, `GOOGLE` or `OTHER` |
| `externalId` | The platform's own id, as text. Meta ids are 15 to 18 digits, too long for a JS number. |
| `name` | The newest name seen |
| `aliases` | Every name ever seen. Search finds a renamed campaign by its old name. |
| `lastSeenAt` | The newest lead time that named this record. Decides which name wins. |
| `createdBy`, `importId` | Who and which import created it |
| `status`, `adAccountId`, `syncedAt` | Empty today. For the Meta Marketing API later. |

**Unique index: `{ platform, externalId }`.** This is what stops a campaign being saved twice.

**Per model, for the Meta API later** (all empty after a sheet import):

| Model | Extra fields |
|---|---|
| `AdCampaign` | `objective`, `buyingType`, `dailyBudget`, `lifetimeBudget`, `startTime`, `stopTime` |
| `AdSet` | `campaign`, `optimizationGoal`, `billingEvent`, `dailyBudget`, `lifetimeBudget`, `startTime`, `endTime`, `targeting` |
| `Ad` | `adSet`, `campaign`, `leadForm`, `creativeId`, `previewUrl` |
| `LeadForm` | `pageId`, `locale`, `privacyPolicyUrl`, `questions` (filled from the sheets) |

The model is `AdCampaign`, not `Campaign`, because `EmailCampaign` already exists.

**New fields on Lead** (all optional, a lead typed in by hand has none):

| Field | Meaning |
|---|---|
| `platform` | `META`, `GOOGLE` or `OTHER` |
| `sourceReference`, `sourceReferenceModel` | See above |
| `leadForm` | See above |
| `externalLeadId` | Meta's lead id. Unique (partial index). The Facebook webhook sets it too. |
| `submittedAt` | When the person sent the form (`created_time`). `createdAt` is when the lead entered the CRM. |
| `importId` | The import that created the lead |

`source` stays as it was: `facebook` or `instagram` for a Meta row, from its `platform` column.

**`LeadImport`** (`src/models/LeadImport.ts`) is built like `LeadSourceUpload`. It holds a copy of every row
with its result, the counts, and `breakdown`: how many leads of this file came from each campaign, ad set,
ad and form.

---

## 3. The import, step by step

`src/lib/ad-tracking/importLeads.ts`.

1. Read the file. Find the header row. Refuse the file if it has no name column or no phone column.
2. Check every row (`checkRows.ts`).
3. Mark leads already in the CRM as duplicates (`duplicates.ts`).
4. Fold the ad ids of all rows into one entry each (`resolveSources.ts`).
   - **The check stops here** and returns what would happen. Nothing is written.
5. Save the import record. Then the ad records: one bulk upsert per level.
6. Insert the leads, each pointing at its most specific ad record.
7. Insert one note per lead, with the form answers.
8. Link duplicates that have no ad yet to the ad on their row.
9. Write the activity log rows, clear the stats cache, save the report.
10. Send one notification for the whole sheet.

If a step from 5 on fails, the leads and notes already saved are removed, and the import is marked failed.
Ad records stay. They are real, and the next import reuses them.

### Why it does not slow down with more rows

A sheet of 250 leads from one campaign names that campaign 250 times.
Looking it up 250 times would be 250 database round trips per level, about 1,000 for the four levels.

Instead, every step works on the whole file at once:

| Step | Database calls |
|---|---|
| Find duplicates | 1 query, all phones and all lead ids |
| Save campaigns and forms | 1 bulk upsert each, at the same time |
| Save ad sets, then ads | 1 bulk upsert each |
| Read back the ids | 1 query per level |
| Insert leads | 1 `insertMany` |
| Insert notes | 1 `insertMany` |
| Link duplicates | 1 `bulkWrite` |
| Activity log | 1 `insertMany` |

About 20 round trips for 10 rows or 2,000 rows. A 250-row file takes a few seconds.

### Which name wins

A campaign can be renamed in Meta. The name kept is the one from the newest lead (by `created_time`)
that named it, across every import. So an old export imported late does not bring back an old name.

### What a row needs

| Problem | Result |
|---|---|
| No name (`full_name`, or `first_name` + `last_name`) | Failed |
| No phone, or not a valid phone | Failed |
| Same phone or same lead id as an earlier row of the file | Duplicate |
| Phone or Meta lead id already a lead, in any region, deleted included | Duplicate |
| Email not valid | Imported, email left out, with a warning |
| An id Excel rounded, such as `1.20212E+17` | Imported, not linked to that record, with a warning |
| `created_time` not a date | Imported, with a warning |

### The two forms today

The web development export and the digital marketing export differ:

| | Web development | Digital marketing |
|---|---|---|
| Phone | `phone_number` | `work_phone_number` |
| Email | `email` | `work_email` |
| Questions | `what_type_of_website_do_you_need?`, `when_do_you_want_to_launch_your_website?` | `what_are_you_looking_to_achieve_through_performance_marketing?`, `when_are_you_looking_to_start?` |
| Extra | | `website` |

The import does not depend on either list. Every header that is not a known column is read as a
**form question**. Its answer goes into the first note. A new form with new questions needs no code change.
The known columns are in `src/config/leadImportSheet.ts`.

The first note looks like this:

```
Lead form answers

What type of website do you need?
→ E-commerce website

When do you want to launch your website?
→ Within 1 month

Company: Rao Traders
Form sent: 20 Nov 2026, 10:23 am GMT+5:30

Imported by Saransh Kumar from leads-nov.csv, row 2.
```

Answers like `within_1_month` become `Within 1 month`. The note is not sent as a notification.

### Duplicates that get linked

The Facebook webhook saves a lead within seconds, but it only knows the form id and the ad id.
It does not know the ad set or the campaign, so those leads have no ad link.

When the Meta export is imported later, those leads are duplicates. The import still adds the ad link to
each of them, if it has none yet. Nothing that is already set is changed. The report counts them as
"linked". So importing the export after the webhook is useful: it fills in where each lead came from.

---

## 4. Things that will bite

1. **Run `npm run db:indexes` after deploying.** It builds the unique `{ platform, externalId }` index on the
   four ad models, and the unique `externalLeadId` index on Lead. Without them, two imports at the same
   moment could save one campaign twice.
2. **Upload Meta's export as it is.** It is UTF-16 text with tabs, saved as `.csv`. The reader handles that.
   Opening it in Excel and saving can turn an 18-digit id into `1.20212E+17` or `120212345678901000`.
   Those ids are refused with a warning, because a rounded id would join leads from different ads.
3. **Meta writes prefixes** on ids and phones: `l:` lead, `ag:` ad, `as:` ad set, `c:` campaign, `f:` form,
   `p:` phone. They are removed. An id with its prefix is trusted even if it ends in 000.
4. **Ad records are not region-scoped.** One campaign can bring leads for more than one region, and the
   unique index is global. The lead counts next to them come from Lead queries, which are region-scoped.
   So a US manager sees every campaign name, but counts only US leads.
5. **Notes go in past Mongoose.** They are written with the raw driver, with the region set from the import.
   Through Mongoose, the region plugin would read the parent lead once per note.
6. **The notification links to the Leads list**, filtered by `?import=<id>`. Everyone who gets it can open
   that page. The import report page is for importers only.
7. **The `d` header.** The web development header list was pasted with `d` as the first header.
   It is accepted as the lead id, like `omain_name` in lead sources. Remove it from
   `leadImportSheet.ts` if the real export always says `id`.

---

## 5. Who can do what

Roles are in `src/constants/adTrackingRoles.ts`. The API routes, `src/proxy.ts`, the sidebar and the buttons read it.

| Group | Roles | Can do |
|---|---|---|
| VIEW | 10, 15, 45, 50, 69 | Open the Ad Tracking pages |
| IMPORT | 10, 15, 45, 50, 69 | Import leads, see past imports and their reports |

The import notification goes to the same roles as "Lead created": 10, 30, 45, 60. The importer does not get it.

---

## 6. Where the code is

| Part | Place |
|---|---|
| Known columns and limits | `src/config/leadImportSheet.ts` |
| Platforms, kinds, row results | `src/constants/adTracking.ts` |
| Roles | `src/constants/adTrackingRoles.ts` |
| Models | `src/models/AdCampaign.ts`, `AdSet.ts`, `Ad.ts`, `LeadForm.ts`, `adRecord.ts`, `LeadImport.ts`, and new fields in `Lead.ts` |
| Import engine | `src/lib/ad-tracking/importLeads.ts` |
| Header matching and cell reading | `src/lib/ad-tracking/sheet.ts` |
| Row checks | `src/lib/ad-tracking/checkRows.ts` |
| Duplicates | `src/lib/ad-tracking/duplicates.ts` |
| Saving ad records once | `src/lib/ad-tracking/resolveSources.ts` |
| The first note | `src/lib/ad-tracking/note.ts` |
| Lead counts, lists, detail, lead page chain | `src/lib/ad-tracking/records.ts` |
| Report and template `.xlsx` | `src/lib/ad-tracking/workbook.ts` |
| Notification text | case 1030 in `src/lib/notifications/render.ts` |
| API routes | `src/app/api/admin/operations/ad-tracking/` |
| Pages | `src/app/admin/operations/ad-tracking/` |
| Components | `src/components/admin/operations/ad-tracking/` |
| Tests | `src/lib/ad-tracking/*.test.ts` |

The sheet reader (`readSheetFile`), the phone check (`readPhone`) and the error type (`LeadSourceError`)
are shared with lead sources.

### API

All under `/api/admin/operations/ad-tracking`.

| Method and path | Who | What |
|---|---|---|
| `POST /imports` | IMPORT | Form data: `file`, `platform` (`META` or `OTHER`), `source` (for `OTHER`), `region`, `check=1` to check only |
| `GET /imports` | IMPORT | Past imports, newest first |
| `GET /imports/:id` | IMPORT | One import with its rows and breakdown |
| `GET /imports/:id/download?only=failed` | IMPORT | The report as `.xlsx`. `only` is `failed`, `duplicates` or `imported`. |
| `GET /template` | IMPORT | Blank `.xlsx` |
| `GET /overview` | VIEW | Counts for the front page |
| `GET /:kind` | VIEW | `campaigns`, `ad-sets`, `ads` or `forms`. Query: `search`, `sort` (`recent`, `leads`, `name`), `page` |
| `GET /:kind/:id` | VIEW | One record, its parents, children and lead counts |
| `GET /:kind/:id/leads` | VIEW | Its leads, newest form first |

Also changed: `GET /api/admin/operations/leads?import=<id>` filters to one import, and
`GET /api/admin/operations/leads/:id` returns `adSource` for the lead page.

### Tests

```bash
npx tsx --test --test-concurrency=1 src/lib/ad-tracking/sheet.test.ts src/lib/ad-tracking/importLeads.test.ts
```

`importLeads.test.ts` runs against `zan_services_test` only, never the live database.
Both files import `testing/tsxPhoneFix.ts` first. Without it, the phone library loses its data under `tsx`.

---

## 7. Not built yet

1. **Meta Marketing API sync.** The fields are there (`status`, `objective`, budgets, dates, `syncedAt`).
   A sync would read the campaigns, ad sets, ads and forms of the ad account, and upsert them on
   `{ platform, externalId }`, the same way the import does.
2. **The webhook does not link the ad yet.** `/api/webhooks/facebook/leads` saves `externalLeadId` now
   (the field was dropped before, because it was not in the schema). It could also upsert the Ad and the
   LeadForm from `ad_id` and `form_id`, and set `sourceReference`. Today, importing the export afterwards
   does the linking.
3. **Google Ads.** `GOOGLE` is in every enum, so no schema change is needed. The sheet columns are not mapped.
4. **Ads-only import.** The plan had an import of the ad records without leads. The engine can do it:
   skip steps 6 to 8.

On a phone, Ad Tracking is in the three-dots menu in the top bar, not on the bottom bar. The bottom bar
holds Dashboard, Leads, Clients and Meetings only. Both lists are in
`src/components/admin/operations/mobileNavItems.ts`.
