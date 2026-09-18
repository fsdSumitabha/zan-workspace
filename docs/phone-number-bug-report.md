**Verdict: bug.** 29 of 49 phone checks found a bug, and 3 more are risky.

**Why:** the app has no single phone rule. The lead and client forms check nothing. The booking page and the call form each use their own rule, and the two rules disagree. The server saves almost any text. Its clean-up step also turns some real numbers into wrong numbers.

**Setup**
- **Reset done:** `.env.local` now matches `.env`. The app uses the `zan_services_usa` database, with region US. The old file is saved as `.env.local.backup-2026-09-18`.
- **Booking results still hold:** those requests stopped before any database step, and the region was US both times.
- **No booking was made:** I sent every booking with a past time. The server checks the phone first, and then refuses the time.

### Booking page (/book)
| # | Typed | Result | Verdict |
|---|---|---|---|
| 1 | (empty) | Blocked | OK |
| 2 | `(415) 555-0123` | Blocked by the page and by the server | Bug |
| 3 | `415.555.0123` | Blocked | Bug |
| 4 | `+1 415-555-0123` copied from a contacts app | Blocked. It has hidden marks you cannot see. | Bug |
| 5 | `４１５５５５０１２３` (full-width digits) | Blocked, with no reason given | Minor |
| 6 | `12345` | Blocked | OK |
| 7 | `+49 (0) 170 1234 5678` | Last digit cut with no warning. Server accepts the cut number. | Bug |
| 8 | `+ - - - - -` | Accepted, with no digits | Bug |
| 9 | `123456` | Accepted | Bug |
| 10 | `+1 (415) 555-0123` | Accepted | OK |

### Create lead
| # | Typed | Saved as | Verdict |
|---|---|---|---|
| 1 | (empty) | Blocked: "Please fill required fields" | OK |
| 2 | one space | Error 500: "Failed to create lead" | Bug (no clear message) |
| 3 | `(415) 555-0142` | `+14155550142` | OK |
| 4 | `415.555.0142` (same number) | Blocked: "Phone already exists" | OK |
| 5 | `001 415 555 0142` (same number) | A second lead for the same person | Bug |
| 6 | `+1-800-FLOWERS` | `+1800` | Bug (number lost) |
| 7 | `+1 415 555 0143 ext 12` | `+1415555014312` | Bug (wrong number) |
| 8 | `+44 (0) 20 7946 0958` | `+4402079460958`. The correct value is `+442079460958`. | Bug |
| 9 | `+1 415 555 0144, +1 415 555 0145` | `+1415555014414155550145` | Bug (both numbers lost) |
| 10 | `Call after 6pm: 415 555 0146` | The whole sentence | Bug |
| 11 | `<img src=x onerror=alert(1)>` | Saved. Shown as plain text. No script ran. | Risky |
| 12 | 60 digits | Saved. Breaks the layout on phones. | Bug |
| 13 | `４１５５５５０１４２` (same number as #3) | A second lead for the same person | Bug |
| 14 | `+1 415-555-0147` copied with hidden marks | `+14155550147` | OK |

### Edit lead and edit client
| # | Page | Typed | Result | Verdict |
|---|---|---|---|---|
| 1 | Edit lead | one space | Error 500: "Failed to update lead". Old phone kept. | Bug (no clear message) |
| 2 | Edit lead | another lead's number, in another format | "Phone already exists" | OK |
| 3 | Edit client | one space | Error 500: "Failed to update client" | Bug (no clear message) |
| 4 | Edit client | `N/A` | Saved as the phone | Bug |

### Log call (tested on the lead page)
| # | Typed | Result | Verdict |
|---|---|---|---|
| 1 | (empty) | Blocked | OK |
| 2 | `12345` | Blocked: "Please match the requested format" | OK |
| 3 | 10 spaces | Saved with an empty phone | Bug |
| 4 | `----------` | Saved. Shown as a `tel:----------` link. | Bug |
| 5 | `0000000000` | Saved as `+10000000000` | Risky |
| 6 | a copied number with hidden marks | Blocked | Bug |
| 7 | `+1 415 555 0123 x12` | Blocked. The message does not say what is wrong. | Minor |
| 8 | `415.555.0123` | `+14155550123`. (The booking page rejects this.) | OK |
| 9 | `abc`, sent directly to the server | Saved | Bug (no server check) |
| 10 | The label | "Contact Phone" has no `*`, but the field is required | Minor |

### Pages that show the phone
| # | Page | Result | Verdict |
|---|---|---|---|
| 1 | Lead page, WhatsApp link | Opens a wrong number for leads 02, 04, 05 and 07. Says "Invalid phone number" for 03, 06, 08 and 10. | Bug |
| 2 | Leads list, at phone width | The 60-digit phone makes the page 525 px wide on a 375 px screen | Bug |
| 3 | Lead page, at phone width | The page is 557 px wide. The status badge and the Delete button are cut off. | Bug |
| 4 | Call history | Shows the `tel:----------` link. An empty phone is simply hidden. | Bug |
| 5 | Convert page | Shows `+14155550147` | OK |
| 6 | Clients list, client page, create-project page, project page | Show `N/A` as if it were a real phone. Clicking it shows "Invalid phone number". | Bug |
| 7 | Dashboard | Lead 11 shows `+14155550147`, but its client shows `N/A`. Editing a client does not update the lead. | Risky |
| 8 | Global search for `(415) 555-0142` | Finds lead 01. Misses leads 02 and 10, which hold the same number. | Bug |
| 9 | Leads page search for `(415) 555-0142` | "0 leads found" | Bug |
| 10 | Number format | Shown as `+14155550142`, with no spaces | Minor |
| 11 | HTML code saved as a phone | Shown as plain text everywhere | OK |

### Fixes
1. **Bug: the server saves almost anything.** The lead, client and call routes only check that the phone is not empty.
   - Fix: add one `validatePhone()` function to `src/lib/phone.ts`.
   - Call it in every route that saves a phone, and return error 400 with `field: "phone"`.
   - Use the same function in all 5 forms, so every form shows the same message.
2. **Bug: the clean-up step makes wrong numbers.** At [phone.ts:30](src/lib/phone.ts:30), a number that starts with "+" keeps only its digits. So letters, "ext", "(0)" and a second number all become part of one number. Fix: in `validatePhone()`, do these steps in order:
   - Remove hidden marks (U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF).
   - Change full-width digits to 0–9.
   - Change a leading "00" to "+".
   - Remove "(0)" after the country code.
   - Reject letters, commas and slashes.
   - Accept only 8 to 15 digits.
   - The `libphonenumber-js` package can do this parsing for you.
3. **Bug: /book rejects common US formats.** The rule at [BookingClient.tsx:75](src/app/book/BookingClient.tsx:75) and [route.ts:44](src/app/api/public/booking/route.ts:44) needs "+" or a digit first, and it does not allow dots. Fix: use `validatePhone()` in both places. Change `maxLength={20}` at [BookingClient.tsx:552](src/app/book/BookingClient.tsx:552) to 30.
4. **Bug: one space gives error 500.** The routes check `!body.phone` before trimming. Fix: trim first, then check, and return error 400.
5. **Bug: the call form accepts 10 spaces or 10 dashes.** The pattern at [CallForm.tsx:10](src/components/admin/operations/InteractionModal/CallForm.tsx:10) counts characters, not digits. Fix: check with `validatePhone()`. Add `*` to the label at [CallForm.tsx:101](src/components/admin/operations/InteractionModal/CallForm.tsx:101).
6. **Bug: long numbers break the layout on phones.** Fix: add the `break-all` class to the phone text in these files:
   - [LeadCard.tsx:57](src/components/admin/operations/LeadCard.tsx:57)
   - [WhatsAppLink.tsx:54](src/components/admin/operations/button/WhatsAppLink.tsx:54)
   - [EntityCard.tsx:84](src/components/admin/operations/EntityCard.tsx:84)
   - [ClientCard.tsx:80](src/components/admin/operations/ClientCard.tsx:80)
   - [CallItem.tsx:72](src/components/admin/operations/interactions/types/CallItem.tsx:72)
7. **Bug: the Leads page search misses numbers.** [leads/route.ts:37](src/app/api/admin/operations/leads/route.ts:37) matches only the raw text. Fix: copy the digits-only step from [search/route.ts:77](src/app/api/admin/operations/search/route.ts:77) into the leads and clients list routes.

### Other bugs I noticed (not phone)
- **Bug:** the call form fills Call Time with UTC time. At 12:23 IST it showed 06:53, so calls are saved 5.5 hours early ([CallForm.tsx:24](src/components/admin/operations/InteractionModal/CallForm.tsx:24)).
- **Bug:** client edits are written to the Activity Log as Project entries. New calls are written as Interaction entries.
- **Risky:** the region is US, but /book shows IST times and budgets show "₹".

I added a task suggestion for each of the first two bugs.

**Not tested directly:** the "Log call" form and call history on the client and project pages. They use the same components as the lead page.

### Test data and changes
- **Test records in `zan_services_usa`:**
  - 11 leads, named "ZZ Phone Test 01" to "11"
  - 1 client made from lead 11
  - 1 project, "ZZ Phone Test Project"
  - 5 calls on lead 01
  - That database was empty before. These actions also created in-app notifications.
- **Dev server:** it now runs from this session. If you close this session, run `npm run dev` again.
- **Source code:** I did not change any.

Should I fix these bugs, or delete the test records? I can also put this report on a page you can share.