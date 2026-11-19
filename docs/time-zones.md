# Time zones

How the CRM stores and shows times. Last updated 19 Nov 2026.

The team works from India, Dubai and the US. Clients are in all three. The
server runs on Vercel, and Vercel's clock is UTC. A time is only right when
every part of the system agrees on its zone.

---

## 1. The rules

1. **A moment is saved once, in UTC.** `scheduledAt` is a Date. The API sends
   and receives it as an ISO string that ends in `Z`.
2. **Code never uses the computer's own zone.** Not `setHours`, not
   `toLocaleString()` without a zone, not `new Date("2026-11-19T13:30")`. On
   Vercel each of those means UTC. Every helper in `src/lib/time/zone.ts` takes
   the zone it must use.
3. **A clock time always carries its zone name.** "1:30 PM IST", never
   "1:30 PM".
4. **Each person sees their own zone first.** When the client's zone differs,
   the client's time is shown too.

## 2. The bug this fixed

The Schedule Meeting form sent the raw value of its `datetime-local` input:
`"2026-11-19T13:30"`. That string has no zone. The server read it in its own
zone, UTC. So 1:30 PM IST was saved as 13:30 UTC, which is 7:00 PM IST. Google
Calendar got the same wrong moment, so the invite agreed with the CRM, and
both were wrong.

The form now sends `start.toISOString()`. The server's `parseMeetingStart()`
refuses a time with no zone unless it is also told which zone to read it in.

Meetings saved from the web form before this fix keep the wrong time. Each
one is off by the creator's UTC offset (5 h 30 min for India). Reschedule them
once; that also moves the Google event.

## 3. What a meeting stores

| Field | Meaning |
|---|---|
| `scheduledAt` | The one exact moment, in UTC. |
| `timeZone` | The client's zone, such as `Asia/Dubai`. The form takes it from the client's region. The person can change it, for a US client in Los Angeles. Older meetings have none; `meetingZone()` then uses the region's zone. |
| `external.eventId` | The Google Calendar event. |
| `external.syncedStatus`, `syncedAt` | The status Google last matched, and when. |
| `external.syncError` | Why the last change did not reach Google. Cleared when one does. |

Region zones (`src/lib/region.ts`): IN is `Asia/Kolkata`, AE is `Asia/Dubai`,
US is `America/New_York`.

## 4. Where each zone comes from

| Who | Where the zone comes from |
|---|---|
| The person on the web | The browser. `useViewerZone()` on screen. The root layout also sets the `tz` cookie, so the server knows it. |
| The person on the phone | The `X-Time-Zone` header (phone patch `meetings-roles-timezone.patch`). |
| The reader of a notification | `User.timeZone`. The browser saves it through `POST /api/auth/timezone` when it changes. Else the reader's region zone when they hold one region. Else the client's zone. |
| The client | `Meeting.timeZone`. For a booking-page meeting, the visitor's browser zone. |

`resolveViewerZone(req, user)` in `src/lib/time/viewerZone.ts` gives the
server the person's zone: cookie or header, then the saved zone, then their
single region, then India.

## 5. Where it is used

- **Forms.** `MeetingWhenField` shows the zone beside the input. The person can
  type in their own time or the client's. A preview shows both clocks and warns
  when the time is outside 8 AM to 8 PM for either side.
- **Cards and lists.** `MeetingTime` writes the viewer's time, and the
  client's time under it when it differs.
- **Notifications.** `emit.ts` renders a meeting text once per reader zone, so
  each reader gets their own time: "Tomorrow at 12:00 PM GST (client: 1:30 PM IST)".
- **"Today" and date filters.** The meetings list, the leads, clients and
  projects date filters, and the overall stats use the viewer's calendar day.
- **Google Calendar.** The event's zone is the client's zone, so the client's
  invite shows the client's own clock.

## 6. Google Calendar

`syncMeetingToGoogle()` in `src/lib/google/calendar/syncMeeting.ts` makes
Google match the CRM:

- Cancelled: the event is deleted. Google emails every guest and takes the
  meeting off their calendars. The CRM keeps the meeting as cancelled. Nothing
  is deleted from the CRM.
- Rescheduled: the event moves. Google emails the new time. The event keeps its
  own length.
- Missed or completed: nothing changes in Google.

The CRM change is saved first. If Google fails, the reason is saved on the
meeting and the meeting card shows it with a Try again button
(`POST /meetings/:id/google-sync`).

Before 19 Nov 2026 the create route saved the event id in a field the model
did not have, so it was lost. `findMeetEventId()` finds those older events by
start time and by the Meet request id, which was the meeting id. New events
also carry the meeting id as a private property.
