# Role-Based Access Control (RBAC) Architecture

> **Status:** Design proposed, not yet implemented. This document is the blueprint for the work tracked in Phases 1–6 below.
> **Owner:** Backend / Auth
> **Last updated:** 2026-06-08

---

## 1. Why this exists

Today, every API route protects itself with a hard-coded list of role numbers:

```ts
await requireRole(req, [10, 15, 60, 70, 45, 50])
```

This breaks down the moment any of the following happen:

- A new role is added (e.g. "Junior BDE") — must grep every route and patch arrays
- A role's responsibilities change (e.g. HR can now create projects) — same problem
- An admin needs to promote/demote users — no UI exists
- A compliance review asks "who can delete a client?" — answerable only by reading source

The goal is to flip the model: API code declares the **capability** it requires, and **roles** become an admin-editable bundle of capabilities stored in MongoDB.

```
Before:  requireRole(req, [10, 60, 70, 45, 50])
After:   requirePermission(req, PERMISSIONS.LEADS.CREATE)
```

Roles disappear from API code entirely. They live in the DB, and an admin manages them through a UI.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Permission** | An atomic capability the app understands, e.g. `leads.create`. Defined in code, seeded into DB. |
| **Role** | A named bundle of permissions, e.g. "Business Development Executive". Defined in DB, editable by admin. |
| **User** | A person with one assigned role (via numeric `role` code). Existing model unchanged. |
| **Permission catalog** | The full list of permissions the app supports — single source of truth in `src/constants/permissions.ts`. |

---

## 3. Core concepts

### 3.1 Permissions are static (developer-controlled)

A permission represents something the **code** can check for. Devs add new permissions when they add new endpoints. Admins cannot create permissions — only assign them to roles.

Format: `<resource>.<action>` — kebab-dot-case, lowercase.

Examples: `leads.create`, `clients.update`, `meetings.cancel`, `users.change-role`.

### 3.2 Roles are dynamic (admin-controlled)

A role bundles permissions. Admins create/edit/delete roles and tick checkboxes to assign permissions. The role document holds a `permissions: string[]` field — the keys it grants.

### 3.3 Users have one role each

`User.role` stays a `number` (existing field). It maps to `Role.code`. No schema migration on the user collection.

### 3.4 Permission check is per-permission, not per-role

```ts
// At the API layer
await requirePermission(req, PERMISSIONS.LEADS.CREATE)
```

The middleware:
1. Resolves the user from the request
2. Loads the user's role doc (cached)
3. Checks if `role.permissions` includes the required key OR `admin.full`
4. Allows or 403s

---

## 4. Schema

### 4.1 `permissions` collection (catalog)

Insert-on-boot from `PERMISSIONS` constant. Read-only at runtime — drives the admin UI's checkbox grid.

```ts
{
    _id: ObjectId,
    key: string,              // unique, e.g. "leads.create"
    resource: string,         // "leads"
    action: string,           // "create"
    label: string,            // "Create Leads"
    description?: string,
    createdAt, updatedAt,
}
```

Indexes:
- `{ key: 1 }` unique
- `{ resource: 1 }` for grouping in UI

### 4.2 `roles` collection (admin-editable)

```ts
{
    _id: ObjectId,
    code: number,             // unique, stable identifier (10, 20, 30, ...)
    slug: string,             // unique, e.g. "admin", "bde", "hr"
    label: string,            // "Admin"
    description?: string,
    permissions: string[],    // ["leads.create", "leads.update", ...]
    isSystem: boolean,        // built-in roles (Admin, System Integration User) — cannot delete
    isActive: boolean,        // soft-disable without deleting
    createdAt, updatedAt,
}
```

Indexes:
- `{ code: 1 }` unique
- `{ slug: 1 }` unique
- `{ isActive: 1 }` for list filtering

### 4.3 `users` collection (no change)

`role: number` stays as-is. Resolved through the `roles` collection at auth time.

> **Why retain numeric codes?** Existing JWT tokens encode `role: 10`. Existing audit log entries reference role codes. Migrating to a string slug or ObjectId reference would invalidate every active session and require backfilling historical data. Keeping the number is free.

---

## 5. Permission naming convention

### 5.1 Format

```
<resource>.<action>
```

- `resource` — the noun being acted on (lowercase, plural)
- `action` — the verb (lowercase, no spaces; use kebab-case for compound verbs like `change-role`)
- Dots only as separators, never within either segment

### 5.2 Standard actions

| Action | Meaning |
|---|---|
| `create` | Create a new instance |
| `read` | List or view |
| `update` | Modify existing |
| `delete` | Remove |
| `status.update` | Change status (separate from general update for finer control) |

Custom verbs are allowed when no standard fits: `leads.convert`, `meetings.cancel`, `users.change-role`.

### 5.3 The catalog file

`src/constants/permissions.ts` is the single source of truth:

```ts
export const PERMISSIONS = {
    LEADS: {
        CREATE:        "leads.create",
        READ:          "leads.read",
        UPDATE:        "leads.update",
        DELETE:        "leads.delete",
        CONVERT:       "leads.convert",
        STATUS_UPDATE: "leads.status.update",
    },
    CLIENTS: {
        CREATE:        "clients.create",
        READ:          "clients.read",
        UPDATE:        "clients.update",
        DELETE:        "clients.delete",
        STATUS_UPDATE: "clients.status.update",
    },
    PROJECTS: {
        CREATE:        "projects.create",
        READ:          "projects.read",
        UPDATE:        "projects.update",
        DELETE:        "projects.delete",
        STATUS_UPDATE: "projects.status.update",
    },
    MEETINGS: {
        CREATE:     "meetings.create",
        RESCHEDULE: "meetings.reschedule",
        CANCEL:     "meetings.cancel",
        COMPLETE:   "meetings.complete",
    },
    NOTES:       { CREATE: "notes.create" },
    CALLS:       { CREATE: "calls.create" },
    QUOTATIONS:  { CREATE: "quotations.create" },
    DOCUMENTS:   { UPLOAD: "documents.upload" },
    USERS: {
        CREATE:      "users.create",
        UPDATE:      "users.update",
        DELETE:      "users.delete",
        CHANGE_ROLE: "users.change-role",
        READ:        "users.read",
    },
    ROLES: {
        CREATE: "roles.create",
        READ:   "roles.read",
        UPDATE: "roles.update",
        DELETE: "roles.delete",
    },
    ADMIN: { FULL: "admin.full" },   // super-permission, bypasses all
} as const

export type PermissionKey =
    typeof PERMISSIONS[keyof typeof PERMISSIONS][keyof typeof PERMISSIONS[keyof typeof PERMISSIONS]]
```

Benefits:
- **Type-safe** — autocomplete + compile-time check on every gate
- **Grep-able** — `grep "leads.create" src/` finds every gate
- **Seedable** — bootstrap reads from this exact map

---

## 6. Middleware

### 6.1 `requirePermission` — the 95% case

```ts
// src/lib/auth/requirePermission.ts
export async function requirePermission(req: NextRequest, key: string) {
    const authUser = await requireAuth(req)
    const role = await getRoleByCode(authUser.role)
    if (!role || !role.isActive) throw new AuthError("Role disabled", 403)
    const has = role.permissions.includes(key) || role.permissions.includes("admin.full")
    if (!has) throw new AuthError("Forbidden", 403)
    return authUser
}
```

Route usage:

```ts
// Before
const authUser = await requireRole(req, [10, 15, 60, 70, 45])

// After
const authUser = await requirePermission(req, PERMISSIONS.LEADS.CREATE)
```

### 6.2 `requireAnyPermission` — OR logic

For endpoints where multiple permissions can grant access:

```ts
await requireAnyPermission(req, [
    PERMISSIONS.LEADS.UPDATE,
    PERMISSIONS.LEADS.STATUS_UPDATE,
])
```

Returns on first match.

### 6.3 `requireAllPermissions` — AND logic (rare)

```ts
await requireAllPermissions(req, [
    PERMISSIONS.QUOTATIONS.CREATE,
    PERMISSIONS.DOCUMENTS.UPLOAD,
])
```

For endpoints that compose multiple actions internally.

### 6.4 `admin.full` is the kill switch

If a role has `admin.full` in its permission list, it passes every check unconditionally. Admin (code 10) gets exactly one permission: `admin.full`. Everyone else gets explicit grants.

---

## 7. Caching strategy

Role docs change rarely (admin clicks a checkbox once a week, maybe). API requests happen constantly. Naive in-process LRU is enough:

```ts
// src/lib/auth/roleCache.ts
const CACHE_TTL_MS = 60_000   // 1 minute
const cache = new Map<number, { role: Role; expires: number }>()

export async function getRoleByCode(code: number) {
    const hit = cache.get(code)
    if (hit && hit.expires > Date.now()) return hit.role
    const role = await Role.findOne({ code }).lean()
    if (role) cache.set(code, { role, expires: Date.now() + CACHE_TTL_MS })
    return role
}

export function bustRoleCache(code: number) {
    cache.delete(code)
}
```

### Invalidation rules
- When admin edits a role: call `bustRoleCache(code)` in-process so the editor sees instant effect
- Across processes (Vercel): rely on the 60s TTL — every process picks up within 60s
- No cross-process pubsub. Adding Redis here is overkill.

### Why not put permissions in the JWT?
Tempting (zero DB lookup per request) but:
- **Revocation is impossible** without rotating tokens — if an admin removes a permission, the user keeps it until their token expires
- **Token bloat** — permission lists can grow to dozens of strings
- **Stale-until-logout** UX is worse than 60s lag

Stay with DB lookup + cache.

---

## 8. Bootstrap and seeding

### 8.1 What gets seeded

1. **Permission catalog** — every entry in `PERMISSIONS` upserted into the `permissions` collection.
2. **Default roles** — the 10 existing roles from `USER_ROLE_META` inserted into `roles` collection, with permission sets that **exactly match the existing `requireRole` access patterns**. Derived by grepping current routes.

### 8.2 When it runs

- On every app boot (idempotent — uses `$setOnInsert`, so admin edits never get overwritten)
- Exposed as an admin-only endpoint `POST /api/admin/system/seed-rbac` for one-time re-run if needed

### 8.3 `DEFAULT_ROLES` derivation

For each existing role, we list every route that currently allows that role and union the corresponding permissions. Example:

```ts
const DEFAULT_ROLES = [
    {
        code: 10, slug: "admin", label: "Admin", isSystem: true, isActive: true,
        description: "Full system access",
        permissions: ["admin.full"],
    },
    {
        code: 60, slug: "bde", label: "Business Development Executive", isSystem: false, isActive: true,
        description: "Handles leads",
        permissions: [
            "leads.create", "leads.read", "leads.update", "leads.status.update", "leads.convert",
            "clients.read",
            "meetings.create", "meetings.reschedule", "meetings.cancel", "meetings.complete",
            "notes.create", "calls.create", "quotations.create",
        ],
    },
    // ... 8 more
]
```

After seed, the system has zero behavior change vs. today.

---

## 9. Admin UI

### 9.1 `/admin/system/roles` — list page

| Code | Label | Slug | Permissions | Users | Status | Actions |
|---|---|---|---|---|---|---|
| 10 | Admin | admin | 1 (admin.full) | 2 | Active | (locked) |
| 60 | BDE | bde | 24 perms | 5 | Active | Edit / Disable |
| 90 | System Integration | system | 3 perms | 1 | Active | (locked) |

Top-right: "+ Create role" button (requires `roles.create`).

### 9.2 `/admin/system/roles/[id]/edit` — permission grid

Grouped by resource, checkboxes for each permission:

```
Leads
  [✓] leads.create     Create Leads
  [✓] leads.update     Update Leads
  [ ] leads.delete     Delete Leads
  [✓] leads.convert    Convert Lead to Client

Clients
  [ ] clients.create
  ...
```

Side panel: role metadata (label, description, slug, isActive).

Save button: calls `PATCH /api/admin/system/roles/:id`, busts cache, audit-logged.

### 9.3 `/admin/system/users` — user list with role dropdown

| Name | Email | Current role | Last active | Actions |
|---|---|---|---|---|
| Suresh K | suresh@ | BDE ▼ | 2h ago | (change role triggers confirmation modal) |

Changing role:
- Confirmation modal with old → new comparison
- Calls `PATCH /api/admin/system/users/:id/role`
- Audit log entry
- Notification fired to the affected user

---

## 10. Promotion / demotion

### 10.1 Endpoint

```
PATCH /api/admin/system/users/:id/role
Body: { newRole: number }
Auth: requirePermission(req, PERMISSIONS.USERS.CHANGE_ROLE)
```

### 10.2 Flow

1. Validate `newRole` exists in `roles` collection and is `isActive: true`
2. Reject if `userId === actorId` (no self-promotion)
3. If demoting the only Admin → 409 Conflict with message
4. Update `user.role`
5. Audit log: `user.role.change`, fields `{ userId, oldRole, newRole, byUserId }`
6. Fire notification `USER_ROLE_CHANGED` to the affected user
7. (Optional) invalidate the user's active sessions if security policy requires

### 10.3 Notification copy

```
Title:  Your role was updated
Body:   You are now {newLabel} (was {oldLabel})
Badge:  user-check
URL:    /admin/profile
```

---

## 11. Guardrails

Hard rules enforced server-side. Cannot be bypassed by admin UI.

| Rule | Enforcement |
|---|---|
| Admin role (`code: 10`) is `isSystem: true` | Cannot delete, cannot remove `admin.full` from its permissions |
| Cannot delete or demote the last Admin | Counted at endpoint; 409 if action would zero them out |
| Cannot promote yourself | Endpoint rejects `userId === actorId` |
| System Integration User (`code: 90`) is `isSystem: true` | Cannot edit; permissions hardcoded to ingestion needs only |
| Cannot delete a role assigned to any user | 409 unless `?reassignTo=<code>` query param provided to move users first |
| Cannot deactivate Admin role | 409 |

---

## 12. Audit

Every mutating action writes to the existing audit log via `auditedCreate` / `auditedUpdate`:

| Action | Audit entry type |
|---|---|
| Create role | `role.create` |
| Update role permissions | `role.update` (diff stored) |
| Delete role | `role.delete` |
| Disable/enable role | `role.update` |
| Change user role | `user.role.change` |
| Seed RBAC | `system.seed` |

Audit entries include `byUserId`, `at`, and full diff. Critical for compliance and "who gave Alice admin access?" debugging.

---

## 13. Migration plan (phases)

Each phase is independently deployable. The old `requireRole` system keeps working until Phase 6.

### Phase 1 — Foundation (no UI yet)
- Create `Role`, `Permission` models
- Define `PERMISSIONS` constant in `constants/permissions.ts`
- Define `DEFAULT_ROLES` array mirroring current access
- Implement `seedPermissionsAndRoles()` — runs on boot
- Implement `requirePermission`, `requireAnyPermission`, `requireAllPermissions`, `getRoleByCode` cache
- Add `USER_ROLE_CHANGED` notification type to `eventTypes.ts`, render case to `render.ts`

**Exit criteria:** Seed runs, DB populated, middleware unit-tested, no route changes.

### Phase 2 — Admin UI (read-only)
- `/admin/system/roles` list page — read from DB, no edit
- `/admin/system/roles/[id]` detail page — read-only permission grid
- `/admin/system/users` list page — show current role, no change

**Exit criteria:** Admin can view the seed state and confirm it matches reality.

### Phase 3 — Admin UI (write-enabled)
- Add edit/save to permission grid
- Add create-role flow
- Add delete-role flow with guardrails
- Add cache invalidation on save

**Exit criteria:** Admin can edit a low-stakes role (e.g. Technical Support) and see the change take effect within 60s.

### Phase 4 — Route migration
- Swap routes one resource at a time, smallest-first
- Order: notifications → notes → calls → quotations → documents → meetings → projects → clients → leads → users → roles
- Each PR touches one resource's routes and is reviewable in isolation
- For each route: replace `requireRole(req, [...])` with `requirePermission(req, PERMISSIONS.X.Y)`

**Exit criteria:** All routes use `requirePermission`. Old role arrays gone from API code.

### Phase 5 — Promote/demote
- Implement `PATCH /api/admin/system/users/:id/role`
- Wire admin UI dropdown to it
- Wire notification dispatch on success

**Exit criteria:** Admin can promote/demote users from UI, target user receives a notification.

### Phase 6 — Cleanup
- Delete `requireRole.ts`
- Delete `USER_ROLE_META` (replaced by DB)
- Update `User.role` type to reference Role.code dynamically
- Update CLAUDE.md / README references

**Exit criteria:** No reference to the old role-array system remains in code.

---

## 14. Decisions made

These were debated and resolved during design. Re-opening requires explicit reason.

### 14.1 Fine-grained permissions (per resource × action)
Not coarse-grained (`leads.manage`). Reason: fine → coarse is easy (collapse later); coarse → fine is a migration. We can always add `leads.manage` later that implies all four CRUD, but starting fine gives flexibility.

### 14.2 `status.update` is a separate permission
Not folded into `update`. Reason: BDE can change a lead's status without being able to edit financial/contact fields. Separating them lets the admin grant minimum-needed access.

### 14.3 Permissions stored as `string[]` on Role doc
Not ObjectId refs to Permission docs. Reason: one query gets everything, no join, and the catalog is small + slow-changing. Trade-off is no referential integrity from DB layer — enforced by app instead via validation on save.

### 14.4 Numeric role codes retained
Not migrated to slugs or ObjectIds in User collection. Reason: existing JWTs, audit log entries, and queries reference numbers. Migration cost > benefit. New roles get auto-assigned codes (next available in 0–999 range).

### 14.5 No per-user override permissions at launch
`user.extraPermissions: string[]` is a possible future extension but not built now. Reason: YAGNI — every CRM use case so far fits within role bundles. Add later if a real need shows up.

### 14.6 In-process cache with 60s TTL
Not Redis, not JWT-embedded. Reason: simplest thing that works; Vercel-friendly; revocable. Adds at most 60s of staleness, acceptable for a CRM admin tool.

### 14.7 Admin has exactly one permission: `admin.full`
Not "all permissions enumerated". Reason: admin should automatically inherit any new permission added in future code; enumerating means every new endpoint requires a DB update for admin too.

---

## 15. File layout

```
src/
├── constants/
│   └── permissions.ts                    [new] — PERMISSIONS catalog constant
├── models/
│   ├── Role.ts                           [new]
│   └── Permission.ts                     [new]
├── lib/
│   └── auth/
│       ├── requireAuth.ts                [existing]
│       ├── requireRole.ts                [existing, deleted in Phase 6]
│       ├── requirePermission.ts          [new]
│       ├── roleCache.ts                  [new]
│       └── seedPermissionsAndRoles.ts    [new]
└── app/
    ├── admin/
    │   └── system/
    │       ├── roles/
    │       │   ├── page.tsx              [new — list]
    │       │   ├── new/page.tsx          [new — create]
    │       │   └── [id]/page.tsx         [new — edit]
    │       └── users/
    │           └── page.tsx              [new — promote/demote]
    └── api/
        └── admin/
            └── system/
                ├── permissions/
                │   └── route.ts          [new — GET catalog]
                ├── roles/
                │   ├── route.ts          [new — GET, POST]
                │   └── [id]/
                │       └── route.ts      [new — GET, PATCH, DELETE]
                ├── users/
                │   └── [id]/
                │       └── role/
                │           └── route.ts  [new — PATCH]
                └── seed-rbac/
                    └── route.ts          [new — POST manual seed re-run]
```

---

## 16. Recipes

### 16.1 Add a new permission (when adding an endpoint)

1. Pick a key following the convention: `<resource>.<action>`
2. Add it to `PERMISSIONS` in `src/constants/permissions.ts`:
   ```ts
   LEADS: {
       ...
       ARCHIVE: "leads.archive",
   }
   ```
3. Gate the route:
   ```ts
   await requirePermission(req, PERMISSIONS.LEADS.ARCHIVE)
   ```
4. Deploy. The seed adds the entry to the `permissions` collection on boot.
5. In the admin UI, edit relevant roles to tick the new permission.

### 16.2 Add a new role

Admin UI → `/admin/system/roles` → "+ Create role". Fill label, slug, description. Tick the permissions. Save.

Behind the scenes:
- Auto-assigns the next available `code` (e.g. 100 if 99 is taken)
- Inserts the Role doc
- No code change required

### 16.3 Promote a user

Admin UI → `/admin/system/users` → find user → role dropdown → select new role → confirm.

Behind the scenes:
- `PATCH /api/admin/system/users/:id/role { newRole }`
- Audit log entry
- Notification to user
- User's next API call resolves with new permissions (within 60s of cache TTL on their token's process, or instant if same process)

### 16.4 Remove access for a role

Admin UI → edit role → untick the permission → save. Cache busts in-process; cross-process picks up within 60s.

### 16.5 Roll back a permission change

Audit log records the diff. Re-tick the permission in the role editor. Save.

---

## 17. Testing approach

### 17.1 Unit tests
- `requirePermission` — pass/fail with seeded role + missing role + disabled role + admin.full
- `seedPermissionsAndRoles` — idempotency (run twice, no duplicates)
- `getRoleByCode` cache — TTL behavior, bust behavior

### 17.2 Integration tests
- Each new admin endpoint: 200 / 401 / 403 / 404 / 409 paths
- Promote/demote: success path + last-admin guard + self-promote guard
- Delete role: blocked if users assigned

### 17.3 Manual smoke test (per phase)
- Phase 1: seed runs cleanly on fresh DB, idempotent on re-run
- Phase 3: admin can edit a non-system role and observe access change for a test user
- Phase 4: each migrated resource still works for every role that previously had access
- Phase 5: promotion fires notification, user sees role change in their profile

---

## 18. Open questions (deferred)

These don't block the build but will likely come up:

| Question | Status |
|---|---|
| Per-user permission overrides (`user.extraPermissions`) | Deferred — add when a real use case emerges |
| Role hierarchy / inheritance | Rejected — explicit per-role grants are easier to audit |
| Time-bounded role assignments ("Alice is HR for the next 2 weeks") | Deferred — add via `user.role` + scheduled job if needed |
| Resource-scoped permissions ("Alice can edit leads only in region X") | Deferred — requires ABAC-style attribute checks; large lift |
| Cross-tenant isolation | N/A — single-tenant CRM |
| API tokens with scoped permissions | Deferred — System Integration User (90) covers ingestion for now |

---

## 19. References

- Existing auth: `src/lib/auth/requireAuth.ts`, `src/lib/auth/requireRole.ts`
- Existing role meta: `src/constants/userRoles.ts`
- Audit log plugin: `src/lib/activity-log/`
- Notification dispatcher (for promotion notifications): `src/lib/notifications/dispatch.ts`
