# Region migration

One-off scripts. They prepare an existing database for the
`features/region-segregation` branch.

Run them by hand, one at a time, in order, while watching the terminal.

---

## Why this is needed

The region branch filters every query with `region: { $in: [...] }`.

A record with no `region` field matches that filter never. So it disappears
from every list, for every user, including an admin.

A user with no `regions` array is denied every query. The app looks empty to
them.

Production today has neither field. So this must run **before** the branch is
deployed.

---

## What gets written

| Who | Gets |
|---|---|
| Every lead, client, project, interaction, meeting, call, quotation, document | `region: "IN"` |
| Every lead phone | E.164, `+91XXXXXXXXXX` |
| `operations@zanservices.com` | `regions: ["IN","US","AE"]` |
| `tech@zanservices.com` | `regions: ["US"]` |
| Every other user | `regions: ["IN"]` |

`support@zanservices.com` is role 90, the API ingestion account. It gets
`["IN"]` by decision. Known consequence: a lead arriving through the public
API or the Facebook webhook for a region other than IN will be refused,
because `resolveWriteRegion` checks the acting account's regions. Give it
`US` as well on the day US intake is switched on.

`ActivityLog` and `Notification` are not touched. Neither model has a region
field and neither uses `regionScopePlugin`. See `docs/region-rollout.md`
sections 3.3 and 3.4.

---

## Safety rules every script follows

1. **Dry run by default.** Nothing is written without `--apply`.
2. **The database name is printed** before anything happens, then a five
   second countdown in apply mode. Read the name. Press Ctrl+C if it is wrong.
3. **Writes use the raw driver**, never a Mongoose model. Three hooks would
   otherwise interfere: the soft-delete filter hides deleted rows, the region
   filter returns nothing because a script has no region context, and the
   audit plugin would write hundreds of log rows with a null actor.
4. **`$set` only.** No delete, no replace. `_id` is never in an update.
5. **Only rows that still need the change** are touched. A row that already
   has a region is left alone, so running twice is safe and so is running
   after some rows already hold `US`.
6. **Soft-deleted rows are included.** A deleted lead still holds its phone
   number in the unique index and can still be restored.
7. **Any row that fails is named and the script exits 1.** The rows that
   already succeeded are not rolled back. Fix what is listed, run again.

---

## Order

```bash
# 0. Optional but recommended. Rehearse on a copy first.
npm run mig:00-rehearse -- D:/Backups/actual/23092026/zanservices

# 1. Users first. Nobody can see anything until this runs.
npm run mig:01-users
npm run mig:01-users -- --apply

# 2 and 3. Leads.
npm run mig:02-leads-region
npm run mig:02-leads-region -- --apply

npm run mig:03-leads-phone
npm run mig:03-leads-phone -- --apply

# 4 to 10. Everything else.
npm run mig:04-clients        # then again with -- --apply
npm run mig:05-projects
npm run mig:06-interactions
npm run mig:07-meetings
npm run mig:08-calls
npm run mig:09-quotations
npm run mig:10-documents

# 11. Check the result. Read only. Exits 1 if anything is wrong.
npm run mig:11-verify

# Then build the region indexes.
npm run db:indexes
```

Every script also takes `--limit N`, which stops after N rows. Useful for
watching the first few before committing to the rest.

---

## Rehearsing on a copy

`00-rehearse-from-backup.ts` loads a mongodump into a throwaway database
called `zan_migration_rehearsal` on the same cluster. It refuses to write
anywhere else, so it cannot hit production by accident.

```bash
npm run mig:00-rehearse -- D:/Backups/actual/23092026/zanservices
```

Then point the scripts at the copy for one shell session:

```bash
export MONGODB_URI="<same uri, with /zan_migration_rehearsal? in place of /zan_services?>"
npm run mig:01-users -- --apply
# ... 02 to 10 ...
npm run mig:11-verify
```

Drop that database when finished. It holds real customer data.

---

## The phone step, in detail

`Lead.phone` is **unique** in `src/models/Lead.ts`.

Two different strings can normalise to the same number. `"9433101111"` and
`"+91 94331 01111"` both become `"+919433101111"`. Writing the second would
hit the unique index and throw.

So `03-leads-phone.ts` checks every lead for collisions **before** it writes
anything. A number that would collide is skipped, both rows are named, and
the rest still run. The write also catches a duplicate key error in case
something changed underneath.

A number that fails validation is left exactly as it is and listed in the
report. Nothing is guessed.

### One thing to keep in sync

`src/lib/phone.ts` cannot be imported under `tsx`. Its static import of
`libphonenumber-js` loses the metadata through tsx's CommonJS interop and
throws `Cannot read properties of undefined`. A dynamic import works.

So the accept path of `validatePhone` is reproduced inside
`03-leads-phone.ts`, against the same library, with the same `extract: false`
option and the same hidden-character cleaning.

**If `src/lib/phone.ts` changes, change `normalise` in that script to match.**

---

## Rehearsal result, 23 September 2026

Run against a copy of the real production backup, 347 leads.

```
01 users          11 examined, 11 changed, 0 failed
02 leads region  347 examined, 347 changed, 0 failed
03 leads phone   345 changed, 2 skipped as unparseable, 0 collisions
04 clients         8 examined, 8 changed, 0 failed
05 projects        7 examined, 7 changed, 0 failed
06 interactions  261 examined, 261 changed, 0 failed
07 meetings        3 examined, 3 changed, 0 failed
08 calls           collection does not exist
09 quotations      collection does not exist
10 documents       collection does not exist

11 verify         ALL CHECKS PASSED
```

The two unparseable numbers were `"98369 9861"` (nine digits) and
`"80806168142"` (eleven digits). Both were corrected in production before the
real run.

Re-running every script a second time reported "nothing to do", which is the
idempotency check.
