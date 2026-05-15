# Activity Log Middleware

This document describes the **activity-log middleware** implemented in this repo. It is separate from `proxy.ts` (page auth) and from manual `logEntityChanges()` calls inside each API route.

---

## Overview

| Layer | Location | What it does |
|-------|----------|--------------|
| **1. Request context** | `src/lib/activity-log/auditContext.ts`, `withAuditHandler.ts` | Stores **who** (`userId`) for the current request via `AsyncLocalStorage` |
| **2. Mongoose middleware** | `src/lib/activity-log/mongooseAuditMiddleware.ts` | On `save` / `findOneAndUpdate`, diffs tracked fields and inserts into `activity_logs` |

```
withAuditHandler (API)
  → sets userId in AsyncLocalStorage
  → route calls Model.save() or findByIdAndUpdate()
      → auditPlugin pre/post hooks
      → logEntityChanges() → ActivityLog collection
```

---

## File structure

```
src/lib/activity-log/
├── index.ts                    # Public exports
├── types.ts                    # EntityType, AuditContextStore
├── registry.ts                 # Tracked fields per entityType
├── normalize.ts                # toAuditPlain, valuesEqual
├── auditContext.ts             # AsyncLocalStorage
├── logEntityChanges.ts         # insertMany into ActivityLog
├── mongooseAuditMiddleware.ts  # auditPlugin (Mongoose hooks)
└── withAuditHandler.ts         # API route wrapper
```

**Model (not middleware):** `src/models/ActivityLog.ts`

---

## Layer 1 — Request context

### `auditContext.ts`

Uses Node `AsyncLocalStorage` so Mongoose hooks can read the current actor without passing `userId` through every function.

```ts
import { AsyncLocalStorage } from "async_hooks"

const auditStorage = new AsyncLocalStorage<AuditContextStore>()

export function getAuditContext(): AuditContextStore | undefined
export function runWithAuditContext(context, fn): Promise<T>
```

`AuditContextStore`:

```ts
{
  userId: string | null
  disabled?: boolean  // skip all logging for this request
}
```

### `withAuditHandler.ts`

| Export | Use |
|--------|-----|
| `withAuditHandler(handler)` | Wrap exported route: `export const PATCH = withAuditHandler(async (req, ctx) => { ... })` |
| `runWithAuditFromRequest(req, fn)` | Wrap handler body when you keep `export async function PATCH` |
| `runWithAuditActor(context, fn)` | Webhooks/seeders: `{ userId: null }` or `{ disabled: true }` |

`runWithAuditFromRequest` reads the JWT cookie via `getUserFromRequest(req)` and sets `userId` for the async scope.

---

## Layer 2 — Mongoose `auditPlugin`

### Registration (on each entity schema)

```ts
import { auditPlugin } from "@/lib/activity-log/mongooseAuditMiddleware"

ClientSchema.plugin(auditPlugin, { entityType: "CLIENT" })
```

**Applied on:** `User`, `Lead`, `Client`, `Project`, `Interaction`, `Call`, `Meeting`, `Document`, `Quotation`.

**Not applied on:** `ActivityLog` (avoids infinite loop).

### Hooks

| Hook | Trigger | Behavior |
|------|---------|----------|
| `pre('save')` | Before `.save()` on existing doc | Load previous document into `$locals` |
| `pre('save')` | New document | Set `$locals._auditIsCreate = true` |
| `post('save')` | After `.save()` / `create` | Diff tracked fields → `ActivityLog` rows |
| `pre('findOneAndUpdate')` | Before `findByIdAndUpdate` | Snapshot `before` on query |
| `post('findOneAndUpdate')` | After update | Diff `before` vs returned doc (needs `{ new: true }`) |

### `logEntityChanges` (called by plugin)

- Loops `ENTITY_AUDIT_CONFIG[entityType].trackedFields`
- Skips `skipFields` (e.g. `password`, `lastLoginAt` on USER)
- One **ActivityLog** document per changed field:
  - `action` = field name
  - `oldData` / `newData` = old and new values
  - `userId` from `getAuditContext()`

---

## ActivityLog row shape

| Field | Example |
|-------|---------|
| `entityType` | `"USER"` |
| `entityId` | Target record `_id` |
| `action` | `"email"` |
| `oldData` | `"old@example.com"` |
| `newData` | `"new@example.com"` |
| `userId` | Actor `_id` from JWT |

---

## How to use in an API route

### Recommended — wrap export

```ts
import { withAuditHandler } from "@/lib/activity-log"
import { requireRole } from "@/lib/auth/requireRole"
import Client from "@/models/Client"

export const PATCH = withAuditHandler(async (req, context) => {
  await requireRole(req, [10, 60])
  await dbConnect()

  const { id } = await context.params
  const body = await req.json()

  const client = await Client.findByIdAndUpdate(
    id,
    { name: body.name, company: body.company, email: body.email, phone: body.phone },
    { new: true, runValidators: true }
  )

  return NextResponse.json({ success: true, data: client })
})
```

### Alternative — wrap body only

```ts
import { runWithAuditFromRequest } from "@/lib/activity-log"

export async function PATCH(req, context) {
  return runWithAuditFromRequest(req, async () => {
    // existing logic
  })
}
```

### Webhook (no logged-in user)

```ts
import { runWithAuditActor } from "@/lib/activity-log"

await runWithAuditActor({ userId: null }, async () => {
  await Lead.create({ ... })
})
```

### Seeder (disable logging)

```ts
await runWithAuditActor({ userId: null, disabled: true }, async () => {
  await Project.create({ ... })
})
```

---

## Public exports (`src/lib/activity-log/index.ts`)

```ts
export { auditPlugin } from "./mongooseAuditMiddleware"
export { ENTITY_AUDIT_CONFIG } from "./registry"
export { logEntityChanges } from "./logEntityChanges"
export {
  getAuditContext,
  runWithAuditContext,
} from "./auditContext"
export {
  runWithAuditFromRequest,
  runWithAuditActor,
  withAuditHandler,
} from "./withAuditHandler"
export { toAuditPlain, valuesEqual } from "./normalize"
export type { EntityType, AuditContextStore, LogEntityChangesInput } from "./types"
```

---

## Requirements for correct behavior

1. **Mutating routes** should use `withAuditHandler` or `runWithAuditFromRequest` so `userId` is set.
2. **Updates** should use `findByIdAndUpdate(..., { new: true })` so post-hook receives the updated document.
3. **Password** is in `skipFields` for USER — never logged in plain form.

---

## What is NOT this middleware

| Item | Note |
|------|------|
| `src/proxy.ts` | Page auth / RBAC only |
| Next.js `middleware.ts` | Not used for activity logs |
| Manual `logEntityChanges()` in every route | Replaced by `auditPlugin`; only call manually if you bypass Mongoose |

---

## Implementation status

| Done | Notes |
|------|--------|
| `src/lib/activity-log/*` | Core library |
| `ensureAuditPlugin` + `registerAuditPluginsOnModels` in `dbConnect` | Fixes Next.js hot-reload missing hooks |
| `enterAuditContext` in `requireAuth` | Sets `userId` for all authenticated routes |
| `auditPlugin` on 9 entity models | save + findOneAndUpdate |
| `findByIdAndUpdate` fallback when `new: true` omitted | Fetches doc after update in post hook |

| Pending | |
|---------|--|
| `findOneAndDelete` hooks for hard deletes | |
| `GET /api/.../activity-logs` + UI | |

**After pulling changes:** restart `npm run dev` once so Mongoose models reload with plugins.

---

## Related

- Full product flow and entity field lists: see `docs/activity-log-flow.md` (may need sync with this file).
- Schema: `src/models/ActivityLog.ts`
