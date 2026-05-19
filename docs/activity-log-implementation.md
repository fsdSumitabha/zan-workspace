# Activity Log — Implementation Summary

This document describes **what was built**, **which files changed**, and **how activity logging works** in Zan Workspace after the audit-log feature was implemented and fixed.

---

## What it does

When an authenticated user **creates or updates** tracked entities (leads, clients, projects, users, and side-effect updates from calls/meetings/notes/quotations), the system writes rows to MongoDB collection **`activity_logs`**.

Each row records:

| Field | Meaning |
|--------|---------|
| `entityType` | e.g. `LEAD`, `CLIENT`, `PROJECT` |
| `entityId` | `_id` of the record that changed |
| `action` | Field name that changed (e.g. `name`, `email`, `phone`) |
| `oldData` | Value before update |
| `newData` | Value after update |
| `userId` | Who made the change (logged-in user) |
| `createdAt` / `updatedAt` | Auto timestamps |

**Rule:** one document per **changed field**. If only `name` changes → one row. If `name` and `phone` change → two rows.

**Note:** If you save without changing any tracked field, **no new rows** are created (expected).

---

## How it works (end-to-end)

```
1. User edits lead/client/project in admin UI
2. PATCH /api/admin/operations/.../:id
3. await dbConnect()          → MongoDB connected, audit plugins registered
4. const user = await requireRole(...)  → enterAuditContext(user.id)
5. auditedFindByIdAndUpdate(Model, entityType, id, update, {}, user.id)
      a. Load document BEFORE update (findById)
      b. findByIdAndUpdate with returnDocument: 'after'
      c. Compare tracked fields (registry.ts)
      d. ActivityLog.insertMany(...) into activity_logs
6. API returns 200 + updated entity
```

### Why `auditedFindByIdAndUpdate` (not only Mongoose hooks)?

Mongoose `post('findOneAndUpdate')` hooks were **unreliable in Next.js** (logs often never appeared).  
Updates now use **`auditedFindByIdAndUpdate`**, which **awaits** logging in the same request so rows are always written.

Mongoose **`post('save')` hooks** remain on models for `.save()` / `.create()` paths (optional backup for those operations).

### Who is stored as `userId`?

- **`requireAuth`** / **`requireRole`** call `enterAuditContext(user.id)` after login is verified.
- PATCH routes also pass **`user.id`** explicitly into `auditedFindByIdAndUpdate` so `userId` is set even if async context is lost.

---

## MongoDB collection

| Item | Value |
|------|--------|
| Model name | `ActivityLog` |
| **Collection name** | **`activity_logs`** (underscore) |
| Database | From `MONGODB_URI` (e.g. `zan_services`) |

In Atlas: open **`zan_services` → `activity_logs`**.

Older test data may exist in a collection named `activitylogs` (no underscore) from before the collection name was fixed.

---

## Files created

### Core library — `src/lib/activity-log/`

| File | Purpose |
|------|---------|
| `types.ts` | `EntityType`, `AuditContextStore`, input types |
| `registry.ts` | Tracked fields per entity (`USER`, `LEAD`, `CLIENT`, …) |
| `normalize.ts` | `toAuditPlain`, `valuesEqual` (compare old vs new) |
| `auditContext.ts` | `AsyncLocalStorage` + `enterAuditContext` / `runWithAuditContext` |
| `logEntityChanges.ts` | Diff fields → `ActivityLog.insertMany` |
| `auditedWrite.ts` | **`auditedFindByIdAndUpdate`**, **`auditedCreate`**, **`auditedUpdateByNumericEntityType`** |
| `entityTypeMap.ts` | Maps numeric `entityType` (0/1/2) → `LEAD` / `CLIENT` / `PROJECT` |
| `mongooseAuditMiddleware.ts` | Mongoose plugin for `save` / create |
| `ensureAuditPlugin.ts` | Safely attach plugin (fixes Next.js hot-reload) |
| `registerModels.ts` | Re-register plugins on all models after `dbConnect` |
| `withAuditHandler.ts` | Optional API route wrapper for audit context |
| `runWithAuthAndAudit.ts` | Helper combining auth + audit context |
| `index.ts` | Public exports |

### Scripts (for local testing)

| File | Purpose |
|------|---------|
| `src/scripts/test-activity-log.ts` | Quick test: update lead + print log count |
| `src/scripts/test-lead-patch-audit.ts` | Test specific lead ID + latest logs |

### Documentation

| File | Purpose |
|------|---------|
| `docs/activity-log-flow.md` | Product flow, schema, rollout checklist |
| `docs/activity-log-middleware.md` | Middleware architecture reference |
| `docs/activity-log-implementation.md` | **This file** — changelog & how it works |

---

## Files modified

### Model

| File | Change |
|------|--------|
| `src/models/ActivityLog.ts` | Schema; **`collection: "activity_logs"`**; indexes on `(entityType, entityId, createdAt)` and `(userId, createdAt)` |
| `src/models/User.ts` | `ensureAuditPlugin(..., "USER")` on schema + model |
| `src/models/Lead.ts` | `ensureAuditPlugin(..., "LEAD")` |
| `src/models/Client.ts` | `ensureAuditPlugin(..., "CLIENT")` |
| `src/models/Project.ts` | `ensureAuditPlugin(..., "PROJECT")` |
| `src/models/Interaction.ts` | `ensureAuditPlugin(..., "INTERACTION")` |
| `src/models/Call.ts` | `ensureAuditPlugin(..., "CALL")` |
| `src/models/Meeting.ts` | `ensureAuditPlugin(..., "MEETING")` |
| `src/models/Document.ts` | `ensureAuditPlugin(..., "DOCUMENT")` |
| `src/models/Quotation.ts` | `ensureAuditPlugin(..., "QUOTATION")` |

`ActivityLog` model does **not** use the audit plugin (avoids infinite loop).

### Database connection

| File | Change |
|------|--------|
| `src/lib/db/dbConnect.ts` | Import all models; call `registerAuditPluginsOnModels()` on connect |

### Auth

| File | Change |
|------|--------|
| `src/lib/auth/requireAuth.ts` | Calls `enterAuditContext(user.id)` after successful auth |

### API routes — updates (`auditedFindByIdAndUpdate`)

| File | Operations |
|------|------------|
| `src/app/api/admin/operations/leads/[id]/route.ts` | PATCH, DELETE (soft) |
| `src/app/api/admin/operations/clients/[id]/route.ts` | PATCH |
| `src/app/api/admin/operations/projects/[id]/route.ts` | PATCH |
| `src/app/api/admin/operations/leads/[id]/status/route.ts` | Status change |
| `src/app/api/admin/operations/clients/[id]/status/route.ts` | Status change |
| `src/app/api/admin/operations/projects/[id]/status/route.ts` | Status change |

### API routes — creates (`auditedCreate`)

| File | Operations |
|------|------------|
| `src/app/api/admin/operations/leads/route.ts` | POST |
| `src/app/api/admin/operations/clients/route.ts` | POST |
| `src/app/api/admin/operations/projects/route.ts` | POST |
| `src/app/api/admin/operations/users/route.ts` | POST |

### Side-effect updates (`auditedUpdateByNumericEntityType`)

When a call, meeting, note, or quotation is created, the parent lead/client/project gets `lastInteractionAt` / `lastInteractionId` updated via audited helpers:

| File | Change |
|------|--------|
| `src/app/api/admin/operations/calls/route.ts` | Audited parent entity update |
| `src/app/api/admin/operations/meetings/route.ts` | Audited parent entity update |
| `src/app/api/admin/operations/notes/route.ts` | Audited parent entity update |
| `src/app/api/admin/operations/quotations/route.ts` | Audited parent entity update |

### Non-blocking audit

If `ActivityLog.insertMany` fails, the error is logged to the console and the API **still returns success** — the primary DB write is never rolled back because of audit failure.

---

## Example log row

User updates lead name from `Manish Goyal` to `Manish Goyal Updated`:

```json
{
  "entityType": "LEAD",
  "entityId": "69fc939d3c488b6ca22f3d72",
  "action": "name",
  "oldData": "Manish Goyal",
  "newData": "Manish Goyal Updated",
  "userId": "6a05aee115a7f3b80fc4df87"
}
```

---

## Tracked fields (by entity)

Defined in `src/lib/activity-log/registry.ts`.

| entityType | Examples of tracked fields |
|------------|----------------------------|
| `USER` | `name`, `email`, `role`, `isActive`, `avatar` — **not** `password` |
| `LEAD` | `name`, `email`, `phone`, `source`, `status`, … |
| `CLIENT` | `name`, `company`, `email`, `phone`, `status`, … |
| `PROJECT` | `title`, `clientId`, `status`, `budget`, … |
| `INTERACTION`, `CALL`, `MEETING`, `QUOTATION`, `DOCUMENT` | Per registry (for future create/update wiring) |

---

## How to verify it works

1. Restart dev server: `npm run dev`
2. Log in as admin
3. Edit a **lead** or **client** — change at least one field (e.g. name)
4. In Atlas: **`zan_services` → `activity_logs`**
5. Sort by `createdAt` descending — new rows should appear

Optional CLI test:

```bash
npx tsx src/scripts/test-lead-patch-audit.ts
```

---

## Not wired yet (future work)

| Area | Status |
|------|--------|
| Lead → client convert, profile PATCH, individual entity PATCH for calls/meetings/etc. | Raw updates — not audited |
| Facebook webhook / seeder | No audit or `disabled: true` |
| `GET` activity log API + admin UI timeline | Not built |
| Hard delete routes | Not audited |
| CREATE logs | One row per non-null field on create (by design); optional single-row CREATE convention later |

---

## Bugs fixed during implementation

| Issue | Fix |
|-------|-----|
| No rows in Atlas | Use collection **`activity_logs`**; check correct DB |
| Mongoose hooks not firing in Next.js | Use **`auditedFindByIdAndUpdate`** (awaited in route) |
| Cached models without plugin (hot reload) | `ensureAuditPlugin` + `registerAuditPluginsOnModels` in `dbConnect` |
| Missing `userId` | `enterAuditContext` in `requireAuth` + pass `user.id` in PATCH routes |
| `findByIdAndUpdate` without returned doc | `returnDocument: "after"`; fallback fetch in hook (legacy) |
| False `deletedAt` logs | `valuesEqual` treats `undefined` and `null` as equal |
| Client PATCH crash | `const user = await requireRole(...)` before `user.id` |

---

## Quick reference — main API usage

```ts
import { auditedFindByIdAndUpdate } from "@/lib/activity-log"

await dbConnect()
const user = await requireRole(req, [10, 60])

const lead = await auditedFindByIdAndUpdate(
  Lead,
  "LEAD",
  id,
  { name, email, phone, source },
  {},
  user.id
)
```

---

## Related docs

- `docs/activity-log-middleware.md` — middleware layers & exports  
- `docs/activity-log-flow.md` — full product spec & rollout checklist  

---

*Last updated: collection `activity_logs`, non-blocking inserts, audited PATCH/status/create routes, and audited side-effect updates from calls/meetings/notes/quotations.*
