# Notes for review — type-error sweep (entityType: string → numeric)

The `EntityType` is now a numeric union (`0|1|2|3|...`). 34 TS errors came from call sites still passing string entity names ("LEAD", "CLIENT", etc.) and a few related drifts. Most fixes were mechanical (`"LEAD"` → `ENTITY_TYPE.LEAD`), but a handful required decisions worth your review.

## Decisions taken (please confirm)

### 1. Added four new entity-type codes
[src/constants/entityTypes.ts](src/constants/entityTypes.ts)

Previous: `LEAD=0, CLIENT=1, PROJECT=2, USER=3, Interaction=4`
Now:
```
LEAD=0
CLIENT=1
PROJECT=2
USER=3
INTERACTION=4     // renamed from Interaction (PascalCase) for naming consistency
MEETING=5         // new
DOCUMENT=6        // new
CALL=7            // new
QUOTATION=8       // new
```

**Why:** `Meeting.ts`, `Document.ts`, `Call.ts`, `Quotation.ts` all call `ensureAuditPlugin` and need a numeric entity code. Either we give them their own slot or we drop the audit plugin from them (treat them as sub-types of Interaction). I chose to give them their own codes — they're separate models with separate lifecycles. **Tell me if you wanted them merged under INTERACTION instead.**

The rename `Interaction` → `INTERACTION` keeps the same number (4), so any existing audit-log rows with `entityType: 4` still resolve correctly.

### 2. Reconciled `registerModels.ts` mismatch
[src/lib/activity-log/registerModels.ts](src/lib/activity-log/registerModels.ts)

Old file had `User: 4, Interaction: 3` — backwards from `entityTypes.ts` which had `User: 3, Interaction: 4`. I trusted `entityTypes.ts` as canonical and rewrote `registerModels.ts` to reference `ENTITY_TYPE.*` directly (so it can't drift again). Also added entries for the four new entities (Meeting, Document, Call, Quotation).

**Risk:** if your DB has any audit-log rows that were written using the old `User: 4` mapping, they'll now render as "Interaction" instead of "User". Check your activity log table — if anything looks wrong, you'll need a small migration to flip 3↔4 for affected rows. If the registerModels.ts file was new/unused, no problem.

### 3. Fixed `meetings/route.ts` `Lead.create` bug
[src/app/api/admin/operations/meetings/route.ts:216](src/app/api/admin/operations/meetings/route.ts#L216)

The "1. Create Meeting" block was calling `Lead.create({…meeting data}, authUser.id)` — wrong model **and** wrong API (Mongoose's `Model.create` doesn't take an actor arg). This looks like a copy-paste/refactor leftover. Replaced with `auditedCreate(Meeting, ENTITY_TYPE.MEETING, {…}, authUser.id)` to match the pattern of the rest of the file.

**Risk:** anyone testing meeting creation before this would have seen the call succeed against the wrong collection or fail at runtime. Worth a smoke test after the fix.

### 4. Loosened `STATUS_META_BY_ENTITY` to `Partial<Record<…>>`
[src/constants/statusMetaByEntity.ts](src/constants/statusMetaByEntity.ts)

Only LEAD/CLIENT/PROJECT have status enums. The old `Record<EntityType, …>` forced an entry for every entity type, which broke when I added USER/INTERACTION/etc. Switched to `Partial<Record>`. Callers now have to handle a possibly-missing entry — none currently do, and `STATUS_META_BY_ENTITY[entityType]` returns `undefined` (the type already allows it).

### 5. `ActivityLogFilters` initial list
[src/components/admin/operations/activityLog/ActivityLogFilters.tsx:44-46](src/components/admin/operations/activityLog/ActivityLogFilters.tsx#L44-L46)

`ENTITY_TYPES` was an undefined identifier. I replaced the spread with `Object.values(ENTITY_TYPE_META).map(m => m.label)` so the dropdown is seeded with all entity labels. Server `meta` endpoint can still override later via `setEntityTypes`.

### 6. `formatActivityValue.ts` string compares were dead
[src/components/admin/operations/activityLog/formatActivityValue.ts:11-22](src/components/admin/operations/activityLog/formatActivityValue.ts#L11-L22)

`if (entityType === "LEAD")` was checking against strings on a numeric union — always false. Status labels in the activity log would have always fallen back to raw numbers. Changed to `entityType === ENTITY_TYPE.LEAD` so status names actually render now.

## Mechanical changes (no review needed)

Every `auditedCreate(M, "X", …)`, `auditedFindByIdAndUpdate(M, "X", …)`, and `ensureAuditPlugin(schema, "X")` was rewritten to use `ENTITY_TYPE.X`. Files touched:

- All `src/models/*.ts` that had `ensureAuditPlugin`
- All `src/app/api/admin/operations/**/route.ts` that called `auditedCreate`/`auditedFindByIdAndUpdate`
- `src/app/api/webhooks/facebook/leads/route.ts`
- `src/scripts/test-lead-patch-audit.ts`
- `src/lib/activity-log/types.ts` — added `export type { EntityType }` so it can be imported from `@/lib/activity-log/types` (was only imported in, not re-exported)

## What I did NOT touch

- `src/lib/activity-log/entityTypeMap.ts` (`NUMERIC_ENTITY_TO_AUDIT` / `ParentAuditEntityType`) still uses string keys `"LEAD" | "CLIENT" | "PROJECT"`. It's an internal translation table used only by `auditedUpdateByNumericEntityType`, which then looks up `ENTITY_TYPE[key]` to convert back to a number. It works as-is — could be simplified later by going purely numeric, but no error and no behavior change.
- The 5 files in `src/components/admin/operations/search/*` still use entity type strings — they're a different domain (search result kinds), not the audit entity codes.

## Suggested follow-ups

- Run `tsc --noEmit` to confirm zero errors.
- Smoke test: create a Meeting from the UI — should no longer hit the `Lead.create` path.
- If you decide MEETING/DOCUMENT/CALL/QUOTATION should NOT have their own entity codes, the rollback is: remove them from `entityTypes.ts`, drop the `ensureAuditPlugin` calls from those models, and remove them from `registerModels.ts`. The route files would still work — they only audit the `Interaction` row, not the underlying Meeting/Call/etc.
