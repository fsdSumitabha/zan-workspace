# Lead sources

Bulk cold-calling lists, uploaded from Excel.
Last updated 2026-09-28.

A lead source is one row of an uploaded sheet: one number to call.
It is kept apart from the Lead model on purpose.
When a call goes well, the source is converted, and a real Lead is created from it.

---

## 1. The idea in one paragraph

A manager uploads a sheet. Each good row becomes a lead source.
Each source has a person (who calls it) and a day (when to call it). Both can be empty.
The person opens **Lead Sources** and sees the sources for today, with due callbacks at the top.
They call, pick the result, and add a short note.
Sources that go well are converted to leads. The others close as Not Interested.

---

## 2. Who can do what

Roles are the existing ones. The lists live in `src/constants/leadSourceRoles.ts`.
The API routes, the page guard in `src/proxy.ts`, the sidebar and the buttons all read that file.

| Group | Roles | Can do |
|---|---|---|
| MANAGE | 10 Admin, 15 Operations Manager, 45, 69 US Leads Manager | See every source in their regions. Upload, assign, set the day, delete, see upload reports. Everything WORK can do. |
| WORK | 50, 60 BDE, 65 US Sales Agent, 70 | See only the sources assigned to them. Call, set the status, add notes, set callbacks. |
| CONVERT | 10, 15, 45, 50, 60, 69, 70 | Turn a source into a Lead. |

CONVERT is the same list as "create a lead" in `POST /api/admin/operations/leads`.
So 65 (US Sales Agent) cannot convert. They mark the source Interested, and a manager converts it.
To change that, add 65 to CONVERT and to the lead create route.

Region applies on top of every list. A US Leads Manager sees US sources only.

---

## 3. The person and the day

A source has `assignedTo` (a user) and `allottedDay` (a calendar day, `"YYYY-MM-DD"`).

- Both can be set at upload, for every row of the file.
- A manager can change both later, on one row or many at once.
- The person must be active, have a lead source role, and hold the source's region.

The day is text, not a date and time. `"2026-09-24"` is the same day for an IN user and a US user.
"Today" is always the browser's own local day. The browser sends it with each request.
The server only checks that it is within one day of the UTC date.

Rules that move a source to another day:

1. Changing the status moves the source to today, the day it was worked.
2. Call Back moves the source to the day of the callback time.
3. A manager setting the day clears any callback time on the source.

---

## 4. Statuses

In `src/constants/leadSourceStatus.ts`. There is no pipeline and no order. Any status can follow any other.

Each status covers several things that can happen on a call. The note on the status change says which one it was.
Not Reached means no one answered. Call Back, Interested and Not Interested mean someone did.

| Code | Status | What happened on the call | Closed |
|---|---|---|---|
| 10 | New | Not called yet | no |
| 20 | Not Reached | No answer, busy ("speaking to someone else"), switched off, voicemail, invalid number, incoming not available | no |
| 30 | Call Back | They asked us to call at another time | no |
| 40 | Interested | They want to go ahead | no |
| 50 | Not Interested | Not interested, working with someone else, no need, do not call, wrong number | yes |
| 70 | Converted | Now a lead | yes. Set only by the convert route. |

Code 60 was Wrong Number. It is now part of Not Interested. Do not reuse 60, because an old database can still hold it.

Closed sources leave the working views (Today, Upcoming, No day). They stay in Closed and All.

---

## 5. Callbacks

A callback is a time to call again, such as "call me after 2 hours" or "call me at 12".

- Picking **Call Back** asks for the time: 15 min, 30 min, 1 hour, 2 hours, 4 hours, tomorrow 10 AM, or an exact time.
- The clock button on a source sets, changes or clears the time without changing the status.
  A New source that gets a callback becomes Call Back. So does a closed one.
- Any other status clears the callback. The call it was for happened.

On the list, a callback shows as a clock chip with the time.

| When | Looks like |
|---|---|
| Later | Violet chip |
| Within 15 minutes | Amber chip, the clock shakes |
| Due | Red chip, the clock rings, the chip pulses, the row has a red edge |

Due callbacks are always first on the Today list, with a banner above the tabs.
The list reloads quietly every minute, so a callback that falls due moves to the top on its own.
It does not reload while a menu, a dialog or a selection is open.

The page does not notify anyone yet. See section 11.

---

## 6. The list page

`/admin/operations/lead-sources`. Each row is two short lines, so a screen holds many:

```
[ ] Name   Company · domain              [clock] [day] [who] [Status v] (call)
    +1 415 555 0123 · the newest note, dimmed
```

- The status badge opens a menu: pick the result, add a note, and for Call Back pick when. Enter saves.
- The call button is not connected to a dialer yet. It shows the number and a Copy button.
  All call buttons go through `startCall` in `src/components/admin/operations/lead-sources/dialer.ts`.
  A real dialer, for example Twilio, only has to be added there.
- Tick rows to select them. While any row is selected, the call buttons are hidden, and a click on a row
  selects it instead of opening it. A bar at the bottom offers the actions. Esc clears the selection.

### Views

| Tab | Shows | Order |
|---|---|---|
| Today | Open sources with a day of today or earlier | Due callbacks, then today's (timed callbacks first, then New first), then earlier days ("left over"), newest first |
| Upcoming | Open sources with a later day | By day |
| No day | Open sources with no day | Newest upload first, in sheet order |
| Closed | Not Interested, Converted | Last changed first |
| All | Everything | Newest upload first, in sheet order |

Filters: status for everyone. Person and one exact day for managers. The header search box matches the
name, company, email, newest note, the sheet columns marked `searchable`, and the phone by its digits.
Everything is in the URL, like the other list pages.

The Today tab also shows progress: how many of today's sources are no longer New.

---

## 7. Uploading a sheet

`/admin/operations/lead-sources/upload`. `.xlsx` or `.csv`. Old `.xls` files are refused with a message to
save them as `.xlsx`.

### The header row is set in one file

**`src/config/leadSourceSheet.ts`**. Edit it by hand. There is no UI for it. Restart the server after.

Each column has a `key`, a `label`, the `headers` that mean it, a `kind` and some flags.
The comment at the top of the file explains every field. The main points:

- Headers are matched without case, spaces, dots, dashes or underscores. `Domain Name` matches `domain_name`.
- `required: true` means the file must have the column, and each row must have a value in it.
- The header row can be anywhere in the first 10 rows. Title rows above it are skipped.
- A header that matches no column is kept as extra data, and shown on the details page.
  Set `keepUnknownColumns: false` to refuse such files instead.
- `maxRows` (5,000) and `maxFileMb` (5) are in the same file.

After an edit, run the checks. They need no database:

```bash
npm run test:lead-source-sheet
```

To see how a header row would be matched, pass it in:

```bash
npm run test:lead-source-sheet -- "omain_name, create_date, name, phone, Website"
```

The sheet shared at the start had the header `omain_name`. It is read as `domain_name`.
`omain_name` is kept as an extra accepted header in case the real sheet uses it.

The upload page shows the expected headers from this file, and has a **Download template** button that
builds a blank `.xlsx` from it, with a second sheet that explains each column.

### What is checked

A problem with the file refuses the whole file, and nothing is saved:

- a required column is missing
- two headers mean the same column
- more rows than `maxRows`
- not a readable `.xlsx` or `.csv`

A problem with one row skips that row only:

| Row problem | Result |
|---|---|
| A required cell is empty | Skipped |
| The phone is not one valid number | Skipped |
| The same phone is earlier in the same file | Skipped |
| The phone is already a lead source in this region | Skipped. A deleted source does not count. |
| The phone is already a lead, in any region, deleted or not | Skipped. It could never be converted. |
| The phone has an extension | Imported with the main number, with a warning |
| Two numbers in one phone cell | Imported with the first valid one, with a warning |
| The email is not valid | Imported, email left out, with a warning |
| A date cannot be read | Imported, date kept as text, with a warning |
| A cell is over 500 characters | Imported, cut, with a warning |

Phone numbers without a `+` code are read with the row's own `country` column.
"UK", "USA", "United States" and other names are mapped in `src/lib/lead-sources/countries.ts`.
Without a country, the upload region's country is used.
This matters: `4155550123` is a US number, but with India as the default it reads as an Indian number.

Dates: `2020-01-15`, `2020-01-15T10:00:00Z`, `15-Jan-2021`, `Jan 15, 2021`, real Excel date cells, and
Excel day numbers such as `43845` are all read. For `03/04/2021`, US uploads read month first, others day first.

### The report

After the upload, the report page shows every row of the file as a grid, like a spreadsheet:
row number, result, reason, then every column under the file's own headers.
It filters by result and has a search box.

**Download report** gives the same as `.xlsx`, with coloured rows and a Summary sheet.
**Skipped rows only** gives just the skipped rows. The file's own columns come first, under the file's
own headers, and the three report columns (`Row no`, `Upload result`, `Upload notes`) are ignored on upload.
So a person can fix the skipped rows in that file and upload it again as it is.

Every value in a download is written as a text cell. A value that starts with `=` shows as text.
It is never run as a formula.

The report is a copy, kept in the upload document. It still shows what the file held after its sources
are edited, converted or deleted.

---

## 8. Converting to a lead

The **Convert to lead** button on the details page, for CONVERT roles.

- The Lead gets the name, phone, email and region, source `Cold Call`, and the source's assignee.
- Everything else from the sheet, and every note from the calls, goes into the Lead's first note.
- The Lead, its note and the change to the source are saved in one transaction.
- The unique index on `Lead.phone` stops two people converting the same source at once.
- The same "lead created" notification is sent as for a lead created by hand.
- The source becomes Converted and links to the Lead.

---

## 9. Where the code is

| Part | Place |
|---|---|
| Sheet columns and limits | `src/config/leadSourceSheet.ts` |
| Roles | `src/constants/leadSourceRoles.ts` |
| Statuses, timeline and report codes | `src/constants/leadSourceStatus.ts` |
| Models | `src/models/LeadSource.ts`, `src/models/LeadSourceUpload.ts` |
| Server logic | `src/lib/lead-sources/` |
| Reading and writing sheets | `src/lib/lead-sources/sheet/` |
| API routes | `src/app/api/admin/operations/lead-sources/` |
| Pages | `src/app/admin/operations/lead-sources/` |
| Components | `src/components/admin/operations/lead-sources/` |

Libraries: `read-excel-file` reads `.xlsx`, `write-excel-file` writes it. CSV is read by
`src/lib/lead-sources/sheet/csv.ts`, so nothing is converted: "0044…" keeps its zeros.

Import `read-excel-file/universal`, not `read-excel-file/node`. The node entry parses in a worker thread,
and its `node:worker_threads` import makes `next build` fail with
"NftJsonAsset: cannot handle filepath node:worker_threads". `next dev` does not show this.

Both models use the region plugin, soft delete (sources only) and the audit plugin, like the rest of the app.
The timeline is an array on the source, `activity`, and is left out of the audit log.
Bulk changes write their audit rows through `src/lib/lead-sources/audit.ts`, because `updateMany` does not
reach the audit plugin.

---

## 10. API

All under `/api/admin/operations/lead-sources`. Same response shape as the rest of the app.

| Method and path | Who | What |
|---|---|---|
| `GET /` | all | One page of a view, plus the count of every tab. Query: `view`, `today`, `day`, `status`, `assignee`, `upload`, `search`, `page`, `limit` |
| `GET /:id` | all | One source, with sheet data and timeline |
| `PATCH /:id/status` | all | `{ status, note?, today, callbackAt?, callbackDay? }` |
| `POST /:id/notes` | all | `{ text }` |
| `PATCH /:id/callback` | all | `{ callbackAt, callbackDay, note? }`, or `{ callbackAt: null }` to clear |
| `POST /:id/convert` | CONVERT | Creates the Lead |
| `POST /bulk` | all | `{ ids, action, ... }`. `status` for all. `assign`, `day`, `delete` for managers |
| `GET /assignees?regions=US` | MANAGE | People a source in those regions can go to |
| `GET /template` | MANAGE | Blank `.xlsx` |
| `GET /uploads`, `POST /uploads` | MANAGE | Upload history, and a new upload (form data) |
| `GET /uploads/:id` | MANAGE | One upload with its report |
| `GET /uploads/:id/download?only=skipped` | MANAGE | The report as `.xlsx` |

"all" means every role in MANAGE and WORK. WORK roles only ever reach their own sources.

---

## 11. Not built yet

1. **Calling.** The call button does not dial. Add the dialer in `dialer.ts`.
2. **Reminders outside the page.** A due callback shows only while the list is open.
   The next step is a notification to the assignee when a callback falls due. That needs a scheduled job,
   because nothing runs on the server at the callback time today.
3. **Do Not Call.** US cold calling has legal do-not-call rules. Today a do-not-call request is marked Not Interested,
   and only the note says why.
   A separate closed status, and a check against it on upload, would be a small change in
   `leadSourceStatus.ts` and `upload.ts`.
4. **Editing a source.** Name, phone and email cannot be edited yet. They come from the sheet.
5. **Splitting a list between people.** Assigning is one person at a time. Picking several people and sharing
   the selected rows between them evenly would save a manager time on big uploads.
