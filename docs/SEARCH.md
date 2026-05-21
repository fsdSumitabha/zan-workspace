# Global Search — Implementation Workflow

A single search bar in the operations layout that adapts to **where the
user is**:

- On the **dashboard** (`/admin/operations`) it searches across leads,
  clients, projects, meetings, and users — a grouped dropdown.
- On a **list page** (e.g. `/admin/operations/clients`) it filters that
  list in place by pushing `?search=…` to the URL — the existing GET
  endpoint already supports it.

> Activity log is deliberately **not** part of global search. It already
> has its own filter UI on `/activity-logs`.

## Dispatch logic

`SearchBar` reads `usePathname()` and dispatches based on the prefix:

| Pathname prefix                                  | Mode             | Endpoint                                                  |
|--------------------------------------------------|------------------|-----------------------------------------------------------|
| `/admin/operations` (exact)                      | dashboard (all)  | `GET /api/admin/operations/search?search=…`               |
| `/admin/operations/leads` (list, not detail)     | entity (leads)   | `GET /api/admin/operations/leads?search=…`                |
| `/admin/operations/clients` (list)               | entity (clients) | `GET /api/admin/operations/clients?search=…`              |
| `/admin/operations/projects` (list)              | entity (projects)| `GET /api/admin/operations/projects?search=…`             |
| `/admin/operations/meetings` (list)              | entity (meetings)| `GET /api/admin/operations/meetings?search=…`             |
| `/admin/operations/users` (list)                 | entity (users)   | `GET /api/admin/operations/users?search=…`                |
| Detail pages (`/leads/:id`, `/clients/:id/...`)  | dashboard mode   | same as dashboard — opens dropdown overlay                |

The query param is **always `search`** — one mental model across the
codebase. The existing `?status=`, `?search=`, `?page=` conventions stay.

"List page" = the exact list URL like `/admin/operations/clients`. Once
the user clicks into a specific record (`/clients/:id`), the search bar
falls back to the global dropdown so the search is still useful.

### Two UI modes from one component

**Entity mode (in-place filter)**
- User types → SearchBar **pushes `?search=…` to the current URL** (just
  like our `usePagination` hook pushes `?page=`).
- The existing list page's fetch re-runs (its useEffect watches the
  URL via `useSearchParams`).
- No dropdown shown — the list itself is the result.
- Hitting Esc or clearing the input removes the `search` param.

**Dashboard mode (overlay dropdown)**
- User types → debounced fetch to the unified `/search` endpoint.
- Renders a grouped dropdown below the input.
- Click a row → `router.push(hit.href)` to the detail page.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  SearchBar (client component, in operations layout)      │
│  - reads pathname                                         │
│  - decides mode: "entity" | "dashboard"                   │
│  - entity:    push  ?search=<q> to current URL            │
│  - dashboard: fetch /api/.../search?search=<q>, show dropdown  │
└────────────┬────────────────────────────┬────────────────┘
             │ entity mode                │ dashboard mode
             ▼                            ▼
   existing entity GET           NEW unified search route
   (?search= already             /api/admin/operations/search
   supported)                    Promise.all over 5 queries
                                 → { leads, clients, ... }
```

## Backend

### 1. Existing endpoints — verify `search` support

Most already handle `?search=…`. Audit and align where missing:

| Endpoint                                  | Status            | Fields searched           |
|-------------------------------------------|-------------------|---------------------------|
| `GET /api/admin/operations/leads`         | ✅ existing       | `name` (regex)            |
| `GET /api/admin/operations/clients`       | ✅ existing       | `name`, `company` (regex) |
| `GET /api/admin/operations/projects`      | needs to confirm  | likely `title`            |
| `GET /api/admin/operations/meetings`      | needs to confirm  | likely none today         |
| `GET /api/admin/operations/users`         | needs to confirm  | likely `name`, `email`    |

Where missing, add a `$or` regex block consistent with the existing
clients example:

```ts
if (search) {
    query.$or = [
        { name:    { $regex: search, $options: "i" } },
        { email:   { $regex: search, $options: "i" } },
        // ...entity-specific fields
    ]
}
```

### 2. NEW unified endpoint — dashboard mode only

`GET /api/admin/operations/search?search=<text>&limit=5`

```ts
// pseudo
await requireAuth(req)
await dbConnect()

const q = (searchParams.get("q") || "").trim()
if (q.length < 2) return ok({ data: emptyResult })

const safe = escapeRegex(q)
const re = { $regex: safe, $options: "i" }

const [leads, clients, projects, meetings, users] = await Promise.all([
    Lead.find({ $or: [{ name: re }, { email: re }, { phone: re }] })
        .sort({ createdAt: -1 }).limit(limit).lean(),
    Client.find({ $or: [{ name: re }, { company: re }, { email: re }, { phone: re }] })
        .sort({ createdAt: -1 }).limit(limit).lean(),
    Project.find({ $or: [{ title: re }, { description: re }, { companyName: re }] })
        .sort({ createdAt: -1 }).limit(limit).lean(),
    Meeting.find({ $or: [{ title: re }, { agenda: re }, { description: re }] })
        .sort({ createdAt: -1 }).limit(limit).lean(),
    User.find({ $or: [{ name: re }, { email: re }] })
        .sort({ createdAt: -1 }).limit(limit).lean(),
])

return ok({ data: { leads: norm(leads, "LEAD"), ... , total } })
```

Each row is normalized into a common shape:

```ts
type SearchHit = {
    id: string
    type: "LEAD" | "CLIENT" | "PROJECT" | "MEETING" | "USER"
    title: string          // primary line (name / title)
    subtitle?: string      // secondary line (company / status)
    href: string           // detail-page URL
}
```

### Edge cases

- **Empty / <2 char q** → return empty arrays, skip DB queries.
- **Regex special chars** → escape via `src/lib/search/escapeRegex.ts`.
- **Phone normalization** → strip non-digits from `q` before matching
  the phone fields, so "+91 98…" matches "9198…".
- **Duplicate clients on same phone** etc. → not a search concern, just
  show all matches.

## Frontend

### SearchBar upgrade

`src/components/admin/operations/SearchBar.tsx` becomes a client
component with a small router inside:

```tsx
"use client"
const pathname = usePathname()
const router = useRouter()
const sp = useSearchParams()

const mode = resolveMode(pathname)
// mode = { kind: "entity"; entity: "leads" | "clients" | ... }
//       | { kind: "dashboard" }

// Input is controlled. Initial value from URL:
//   entity mode → sp.get("search") ?? ""
//   dashboard   → local state
//
// On change, debounced 300ms:
//   entity mode    → router.replace(`${pathname}?${withSearch(sp, q)}`)
//                    (clears the param when q is empty)
//   dashboard mode → fetch unified endpoint, render dropdown
```

### Mode resolution

```ts
function resolveMode(pathname: string): Mode {
    if (pathname === "/admin/operations") return { kind: "dashboard" }
    const m = pathname.match(/^\/admin\/operations\/(leads|clients|projects|meetings|users)$/)
    if (m) return { kind: "entity", entity: m[1] }
    return { kind: "dashboard" } // detail pages → overlay search
}
```

Only the **exact list URL** triggers entity mode. Once the user is on
a detail page like `/clients/:id`, typing in the search bar shows the
dashboard dropdown (still useful — they can jump elsewhere).

### Dropdown components (dashboard mode)

```
src/components/admin/operations/search/
├── SearchResults.tsx       (grouped sections + click-outside / Esc)
└── SearchResultRow.tsx     (icon + title + subtitle, keyboard-active)
```

Reuse `ENTITY_BADGE` colors from `ActivityLogItem` for the type icons,
so the visual language matches the activity log feed.

### Entity-mode interaction with pagination

When `?search=` is pushed by the search bar, **page should reset to 1**
or the user can land on an empty page. The list pages already use the
`usePagination` hook (which clamps to page 1 when the URL has no
`page=`), so as long as the SearchBar push uses `router.replace` with
only `?search=` (no `page=`), pagination resets naturally.

If a user navigates back, the list shows the previous search + page
state — desired.

## File-by-file plan

```
1. NEW   src/lib/search/escapeRegex.ts
         Escape user input before $regex.

2. NEW   src/app/api/admin/operations/search/route.ts
         Unified endpoint, dashboard mode only.

3. EDIT  src/app/api/admin/operations/projects/route.ts
         src/app/api/admin/operations/meetings/route.ts
         src/app/api/admin/operations/users/route.ts
         Add ?search support where missing (mirror the clients pattern).

4. EDIT  src/components/admin/operations/SearchBar.tsx
         "use client", mode resolution, debounce, two-way routing.

5. NEW   src/components/admin/operations/search/SearchResults.tsx
6. NEW   src/components/admin/operations/search/SearchResultRow.tsx
         Grouped dropdown + per-row UI for dashboard mode.

7. OPT   src/models/*.ts
         Add text indexes when query performance becomes a concern.
         Skip until needed.
```

## Decisions and trade-offs

| Decision                              | Why                                                    |
|---------------------------------------|--------------------------------------------------------|
| Context-aware dispatch                | Search where you are. Less surprise, faster on list pages. |
| Reuse existing `?search=` on lists    | No duplicate logic. The list page already paginates / sorts the result for free. |
| Unified endpoint only for dashboard   | The dashboard genuinely needs the cross-entity view; list pages don't. |
| `$regex` over text indexes            | Simpler. Reindex later if perf bites.                  |
| Entity mode = no dropdown             | The list IS the result — showing both is noisy.        |
| Detail pages fall back to dashboard   | The search bar stays useful for navigation.            |
| Exclude activity log                  | Activity is *about* entities, not an entity.           |
| `requireAuth`, no role gating         | Any logged-in user can already see the lists.          |

## Implementation order

1. Backend: audit `?search=` on existing endpoints, fill the gaps. Curl-test.
2. Backend: ship the unified `/search` endpoint. Curl-test the shape.
3. Frontend: rewrite SearchBar with mode resolution + entity-mode URL push.
4. Frontend: add dropdown components for dashboard mode.
5. Polish: keyboard nav (↑/↓/Enter/Esc), Cmd+K to focus.

Roughly 1 backend day + 1 frontend day for the MVP.

## Future enhancements (not in scope now)

- Recent searches stored in localStorage.
- Cmd+K command palette (full overlay).
- Filters in the dropdown — e.g. `type:lead john`.
- Activity log inclusion via aggregation that joins to the entity collection.
- Atlas Search if data grows beyond ~50k rows per collection.
- Permission-aware scoping — hide Users section from non-HR/admin.
