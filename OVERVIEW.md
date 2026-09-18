# ZAN CRM — Project Overview

ZAN CRM is the internal CRM of ZAN Services.
The team uses it to track sales from the first contact to the finished project.
It is one Next.js app. The same app serves the web UI and the API.

---

## 1. What the project does

1. A **lead** comes in from a Facebook ad, the client portal, the public booking page, or a staff member.
2. Staff move the lead through a status pipeline. They log notes, calls, quotations and meetings on it.
3. When the deal is won, the lead is **converted** into a **client**.
4. The client gets one or more **projects**. Each project has its own status pipeline and timeline.
5. Every change is written to the **activity log**. The users who should know get an in-app **notification**.

Other features:

- **Users and roles.** Admin and HR create staff accounts. Each user has one numeric role.
- **Meetings.** Online meetings get a Google Meet link through Google Calendar.
- **Public booking page** (`/book`). A visitor picks a free slot. The app creates a lead, a Meet event and a meeting.
- **Dashboard and stats.** Recent activity, side-panel counts, and a charts page.
- **Global search** across leads, clients, projects and meetings.
- **PWA.** The web UI can be installed on a phone.

---

## 2. Tech stack

| Area | Tools |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Database | MongoDB with Mongoose 9 |
| Auth | JWT (`jose`) in an httpOnly cookie, `bcryptjs` for passwords |
| UI | lucide-react, clsx, sonner, framer-motion, dayjs, react-dropzone |
| Charts | chart.js with react-chartjs-2, recharts |
| Phone numbers | libphonenumber-js, react-phone-number-input |
| Integrations | ImageKit (files), Nodemailer (mail), Google Calendar (Meet links), Facebook Lead Ads |

---

## 3. How it works

### 3.1 Request flow

Pages load all data in the browser. They call relative `/api/...` URLs with `fetch()`.
A typical page is a thin `page.tsx` that renders an `XClient.tsx` client component.

```
Browser page  ──fetch("/api/...") with the auth_token cookie──▶  src/app/api/.../route.ts
    1. requireAuth / requireRole    verify the JWT, load the user, check the role
    2. validate input
    3. check the record exists
    4. write through Mongoose       the audit plugin writes the activity log
    5. side effects                 notification, stats reset, calendar, mail (never break the action)
    6. respond                      { success, data } or { success: false, message }
```

### 3.2 Auth and access

- `POST /api/auth/login` sets the `auth_token` cookie. It is httpOnly, secure, sameSite lax, and lasts 7 days. The JWT holds `userId` and `role`.
- `requireAuth` returns 401 without a valid user, and 403 for a deactivated account. `requireRole` also returns 403 for a wrong role.
- `AuthContext` loads the user from `/api/auth/me`. `handleAuthError` sends the UI to login on 401 and shows `AccessDenied` on 403.
- `src/proxy.ts` guards the `/admin` pages only. It redirects anonymous users to login and wrong roles to `/unauthorized`. API routes must check auth themselves.

### 3.3 Numeric codes

Every status, type and role is a number in `src/constants`. Labels and colors live in a `*_META` map. The database stores only the numbers. Codes step by 10 so new values fit between old ones.

| Constant | Values |
|---|---|
| `LEAD_STATUS` | NEW 10, CONTACTED 20, MEETING 30, DISCUSSION 40, NEGOTIATION 50, CONVERTED 60, LOST 70 |
| `CLIENT_STATUS` | ACTIVE 1, INACTIVE 2, ON_HOLD 3, COMPLETED 4 |
| `PROJECT_STATUS` | DISCUSSION 110 … CLOSED 180 (8 steps) |
| `ENTITY_TYPE` | LEAD 0, CLIENT 1, PROJECT 2, USER 3, INTERACTION 4, MEETING 5, DOCUMENT 6, CALL 7, QUOTATION 8 |
| `INTERACTION_TYPE` | Meetings 2010–2050, NOTE 2110, CALL 2210, DOCUMENT 2310, QUOTATION 2410, STATUS_CHANGED 2510 |
| `EVENT_TYPE` | Lead 1000–1020, Client 1100–1110, Project 1200–1210, plus every interaction code |
| Roles | Admin 10, Ops Manager 15, HR 20, Project Manager 30, Developers 40–45, Digital Marketer 50, BDE 60, Accountant 70, Support 80, System 90 |

### 3.4 Data model

All models are in `src/models`. Users, leads, clients and projects use soft delete (`deletedAt`). A pre-find hook hides deleted rows.

| Model | Purpose |
|---|---|
| `User` | Staff account with role, active flag and avatar |
| `Lead` | Prospect with a status. `phone` is unique, deleted leads included |
| `Client` | Created when a lead is converted |
| `Project` | Belongs to a client. Has a status, service type and budget |
| `Interaction` | One timeline entry on a lead, client or project |
| `Meeting`, `Call`, `Quotation`, `Document` | Detail records behind timeline entries |
| `Notification` | One row per recipient, with `seenAt` and `readAt` |
| `ActivityLog` | `oldData` and `newData` for every audited write |
| `StatsSnapshot` | Cached counts for the side panel |

### 3.5 Cross-cutting systems

- **Activity log** (`src/lib/activity-log`). `requireAuth` stores the user id in AsyncLocalStorage. A Mongoose plugin reads it on each write and saves an `ActivityLog` row.
- **Notifications** (`src/lib/notifications`). `emitNotification` picks recipients by role from `NOTIFICATION_RULES` and renders the message. It saves one row per recipient. The UI polls `/api/notifications`.
- **Stats** (`src/lib/stats`). `/stats` returns a cached snapshot. A plugin on Lead, Client, Project and Meeting deletes the cache after each write.
- **Phone and region** (`src/lib/phone.ts`, `src/lib/region.ts`). New numbers are saved in E.164 format. `NEXT_PUBLIC_REGION` sets the default country.
- **Files.** Avatars and quotations go to ImageKit. Call recordings are saved to local disk under `public/uploads/calls`.

### 3.6 Lead intake from outside

| Source | Endpoint | Protection |
|---|---|---|
| Client portal | `POST /api/public/leads` | `x-api-key`, CORS allow-list, rate limit |
| Facebook Lead Ads | `/api/webhooks/facebook/leads` | Verify token, request signature, idempotent |
| Booking page | `/api/public/booking` and `/slots` | Honeypot, live slot re-check, rate limit |

The booking flow checks the slot and finds or creates the lead. It creates the Meet event, saves the meeting, and sends a notification. If saving fails, it deletes the calendar event.

---

## 4. API response structure

**Success**

```json
{ "success": true, "data": { } }
```

**Paginated list.** It reads `?page=` and `?limit=`. The defaults are 1 and 10.

```json
{
    "success": true,
    "data": [ ],
    "pagination": { "page": 2, "limit": 10, "total": 57, "pages": 6 }
}
```

**Notifications feed.** It uses a cursor.

```json
{ "success": true, "data": [ ], "unseen": 3, "unread": 5, "total": 42, "nextCursor": "66f0c2..." }
```

**Error**

```json
{ "success": false, "message": "Human-readable reason", "field": "phone" }
```

`field` is optional. Forms use it to mark the input.

Status codes: 400 bad input, 401 not signed in, 403 no access, 404 not found, 409 duplicate, 413 or 415 bad file, 429 rate limited, 500 server error.

### Endpoints

All admin routes are under `/api/admin/operations`.

| Area | Routes |
|---|---|
| Auth | `/api/auth/login`, `logout`, `me`, `profile`, `profile/avatar`, `profile/password` |
| Leads | `leads`, `leads/[id]`, `/status`, `/convert`, `/client`, `/interactions`, `/meetings` |
| Clients | `clients`, `clients/[id]`, `/status`, `/projects`, `/interactions` |
| Projects | `projects`, `projects/[id]`, `/status`, `/interactions` |
| Timeline | `interactions`, `interactions/[id]`, `notes`, `calls`, `quotations` |
| Meetings | `meetings`, `meetings/[id]/status`, `meetings/[id]/reschedule` |
| Users | `users`, `users/[id]`, `users/picker` |
| Dashboard | `/` (feed), `stats`, `overall-stats`, `search`, `activity-logs`, `/meta`, `/heatmap` |
| Notifications | `/api/notifications`, `seen`, `read-all`, `[id]/read` |
| Public | `/api/public/leads`, `/api/public/booking`, `/api/public/booking/slots`, `/api/webhooks/facebook/leads` |

---

## 5. Pages

| URL | Content |
|---|---|
| `/` and `/book` | Landing page and public booking page |
| `/admin/authentication/login`, `/unauthorized` | Login and no-access pages |
| `/admin/operations` | Dashboard |
| `/admin/operations/leads`, `clients`, `projects` | List, create, detail with timeline, edit. Leads also have convert. |
| `/admin/operations/meetings`, `notifications`, `overall-stats` | Meeting list, notification feed, charts |
| `/admin/operations/users`, `profile`, `activity-logs` | User admin, own profile, audit log |

`admin/operations/layout.tsx` wraps every CRM page. It holds the sidebar, search bar, notification bell, side panels and mobile nav.
List state lives in the URL (`?page=`, `?search=`, filters). A reload or a shared link opens the same view.

---

## 6. Setup

Copy `env.example` to `.env.local`. The groups are MongoDB, `JWT_SECRET`, Meta, Google Ads, Google Calendar, ImageKit, SMTP and the client portal.
The code also reads `NEXT_PUBLIC_REGION` and `APP_LOGIN_URL`. Neither is in `env.example` yet.

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run db:indexes
```

Without the Google Calendar variables, staff meetings are saved without a Meet link. The booking endpoint returns 503.

---

## 7. Directory structure

```
zan-workspace/
├── docs/                   Design notes: activity log, search, RBAC plan, phone bug report
├── public/                 Logos, PWA icons, sw.js, offline.html
├── env.example
├── next.config.ts          Allows ImageKit images
├── package.json
└── src/
    ├── proxy.ts            Page guard for /admin
    ├── app/
    │   ├── layout.tsx      Root layout: AuthProvider, ImageKitProvider, Toaster
    │   ├── page.tsx        Landing page
    │   ├── manifest.ts     PWA manifest
    │   ├── book/           Public booking page
    │   ├── admin/
    │   │   ├── authentication/   login, unauthorized
    │   │   └── operations/       layout.tsx, dashboard, and one folder per module
    │   │       └── leads | clients | projects | meetings | users | profile
    │   │           notifications | overall-stats | activity-logs
    │   └── api/
    │       ├── auth/             login, logout, me, profile
    │       ├── admin/operations/ one folder per module, same names as the pages
    │       ├── notifications/
    │       ├── public/           leads, booking
    │       └── webhooks/facebook/
    ├── components/
    │   ├── admin/operations/     Cards, forms, details, timeline, filters, skeletons, nav
    │   └── phone/                Phone input and display
    ├── constants/          Numeric codes and *_META maps
    ├── config/             Older UI config
    ├── contexts/           AuthContext, RegionContext, StatusContext
    ├── hooks/              usePagination, useSearch
    ├── lib/
    │   ├── auth/           requireAuth, requireRole, verifyToken, handleAuthError
    │   ├── activity-log/   Audit plugin and audited write helpers
    │   ├── notifications/  emit, recipients, render, dispatch, channels
    │   ├── stats/          Stats computing and cache reset
    │   ├── google/calendar/  Calendar client and Meet events
    │   ├── booking/        Booking rules and free slots
    │   ├── security/       Rate limit, CORS, API key check
    │   ├── webhooks/facebook/  Signature check, lead fetch
    │   ├── db/             dbConnect
    │   ├── imagekit/, mail/, templates/, leads/, search/, urls/
    │   ├── phone.ts        Phone validation, client-safe
    │   └── region.ts       Region config, client-safe
    ├── models/             Mongoose schemas
    ├── types/              API types, one file per entity
    ├── services/           Registration mail
    ├── scripts/            ensure-indexes and audit test scripts
    └── utils/
```

---

## 8. Known issues

1. **API routes without auth.** These have no auth check, and `proxy.ts` does not cover `/api`:
    - `leads/[id]/client`, `leads/[id]/interactions`, `leads/[id]/meetings`
    - `clients/[id]/interactions`, `projects/[id]/interactions`
    - `interactions` `GET` and `POST`. The `POST` trusts `createdBy` from the body.
    - `seeder`. A `GET` rewrites data on every project.
2. **Error key is not consistent.** `calls`, `meetings`, `notes`, `quotations` and the dashboard feed return `error` instead of `message`.
3. **Raw role numbers** in API routes and `proxy.ts`. `docs/rbac-architecture.md` has the planned fix.
4. **Call recordings on local disk.** On serverless hosting they are lost after each deploy.
5. **`npm run seed` fails.** `src/scripts/seed.ts` does not exist.
6. **Rate limit is per process.** Each server instance keeps its own counters.
7. **File names with spaces.** `Leadsovertimecard .tsx`, `TemporalBadge .tsx`, `LeadsMonthlyChart .tsx`.
