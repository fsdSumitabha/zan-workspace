# Region UI test plan

Manual UI checks before merging `features/region-segregation`.

Everything below is done in a browser, signed in as a real user. API-level
checks live in `docs/region-test-brief.md` and are not repeated here.

**The one rule being tested:** a person sees and touches only their own
region's data. An admin sees everything, and anything they create lands in
exactly one region.

---

## 1. Test users

You need three. Two exist. **One has to be created.**

| Who | Email | Role | Regions | Why |
|---|---|---|---|---|
| Admin | `operations@zanservices.com` | 10 | IN, US, AE | The "Planet" case. Can switch regions. |
| IN user | `robin@zanservices.com` | 60 BDE | IN | The India side of every A/B check. |
| **US user** | *create this* | **60 BDE** | **US** | The US side. Mirrors Robin exactly. |

### Why you must create the US user

`tech@zanservices.com` is the only US account today, and its role is 69
(US Leads Manager). Role 69 is **not allowed** on these routes:

- `GET /projects`, `POST /projects`, `PATCH /projects/[id]/status`
- `DELETE` on leads and clients

So role 69 cannot test the project flows at all. An agent using it will hit
403s and report them as region bugs. They are role bugs, or role decisions,
and unrelated to this branch.

Create a BDE (role 60) with region US only. Same role as Robin, different
region. Then every difference you see is caused by region and nothing else.

Keep `tech@zanservices.com` for one check only: section 7.

---

## 2. Starting data

Counts at the time of writing. Re-check before testing; the numbers move.

| | IN | US |
|---|---|---|
| Leads | 27 | 1 |
| Clients | 10 | 0 |
| Projects | 8 | 0 |
| Interactions | 177 | 1 |
| Meetings | 43 | 0 |
| Calls | 14 | 0 |
| Quotations | 8 | 0 |

Note the US side is nearly empty. **Most US checks are worthless until the US
user has created data.** Do section 4 before section 5.

---

## 3. The region switch (admin only)

| # | Do | Expect |
|---|---|---|
| 3.1 | Sign in as admin | Pill next to the sidebar logo reads **All regions**, violet, globe icon |
| 3.2 | Open the pill | Options: All regions, India, United States, UAE. Current one ticked |
| 3.3 | Pick United States | Page reloads. Pill shows US flag + "US", blue |
| 3.4 | Hard refresh (Ctrl+F5) | Still US. The choice survives reload |
| 3.5 | Pick All regions | Page reloads. Pill back to violet "All regions" |
| 3.6 | Sign in as Robin (IN) | Pill reads IN, **no dropdown arrow**, not clickable |
| 3.7 | Log out, log back in as admin | Pill back to All regions, not the last pinned one |
| 3.8 | Mobile width (< 768px) | Pill in the top bar, flag only, no name. Still opens |

**3.7 matters.** A pin left behind would follow the next person on that
computer.

---

## 4. Creating data does not leak

Do this as the **US user** first, so section 5 has something to look at.

| # | Do | Expect |
|---|---|---|
| 4.1 | US user creates a lead | Saves. No region field shown — they have only one |
| 4.2 | Sign in as Robin (IN) | The new US lead is **not** in the list |
| 4.3 | Robin creates a lead | Saves as IN |
| 4.4 | US user refreshes | Robin's lead is **not** there |
| 4.5 | Admin, All regions | **Both** new leads visible |
| 4.6 | Admin pinned to US, creates a lead | No region picker. Saves as US |
| 4.7 | Admin pinned to All, creates a lead | Region field shows **India** preselected. Changeable |
| 4.8 | Repeat 4.7 but switch the field to US | Saves as US. Visible to the US user, not to Robin |

**4.7 is the decision you made.** India is a default, not a hidden rule. It
must be on screen and changeable.

---

## 5. Counts and pagination

The easiest place for a leak to hide. A list can look right while the total
is wrong.

| # | Do | Expect |
|---|---|---|
| 5.1 | Robin opens Leads | Total matches the number of IN leads. Not 28 |
| 5.2 | Robin pages to the last page | Rows on every page. No empty final page |
| 5.3 | US user opens Leads | Total is the US count only |
| 5.4 | Admin, All regions | Total = IN + US |
| 5.5 | Admin pinned to US | Total drops to the US count |
| 5.6 | Dashboard side panel, each user | Lead / client / project / meeting counts match that region |
| 5.7 | Admin switches region, reloads dashboard | Counts change with the region |
| 5.8 | Charts page (`/overall-stats`), each user | Totals match that region |

**5.6 and 5.7 together.** Stats are cached. If admin sees Robin's numbers, or
numbers stay stale after a switch, the cache key is wrong.

---

## 6. Detail pages and cross-region access

| # | Do | Expect |
|---|---|---|
| 6.1 | As admin, copy an **IN lead** URL | — |
| 6.2 | Paste it as the **US user** | Not found / no access. **Never** the lead |
| 6.3 | Same for a client URL | Same |
| 6.4 | Same for a project URL | Same |
| 6.5 | Same for a meeting URL | Same |
| 6.6 | US user opens their own US lead | Opens normally, timeline loads |
| 6.7 | Global search as Robin, type a US lead's name | No results |
| 6.8 | Global search as admin (All) | Finds it |
| 6.9 | Global search as admin pinned to IN | Does **not** find it |

**6.2 is the most important check in this document.** A guessable URL that
returns another region's record is the failure this branch exists to prevent.

---

## 7. Role gate versus region gate

One check, with `tech@zanservices.com` (role 69, US).

| # | Do | Expect |
|---|---|---|
| 7.1 | Sign in, open Projects | Blocked, or the menu item is missing |

This is a **role** limit, not a region one. Confirm it looks like an access
error and not an empty list. Then stop using this account.

---

## 8. Timeline actions

Do each as the **US user on a US lead**, then as **Robin on an IN lead**.
Then as **admin in All regions** on one lead from each side.

| # | Action | Expect |
|---|---|---|
| 8.1 | Add a note | Saves. Appears in the timeline |
| 8.2 | Log a call | Saves |
| 8.3 | Upload a quotation | Saves |
| 8.4 | Schedule a meeting | Saves. Appears in the Meetings list |
| 8.5 | Change lead status | Saves. Status chip updates |

Then, for every one of the above:

| # | Check | Expect |
|---|---|---|
| 8.6 | The other region's user reloads | Sees **none** of it |
| 8.7 | Admin in All regions | Sees **all** of it |
| 8.8 | Meetings list, each user | Only their own region's meetings |

**Watch for admin.** An admin in All regions adding a note to an IN lead must
produce an **IN** note, not an unassigned one. If it vanishes from every list
afterwards, the note was saved with no region.

---

## 9. Convert and project flow

The longest chain, and the one where a region is most likely to be dropped
between steps.

Run the whole chain twice: once as the **US user**, once as **Robin**.

| # | Do | Expect |
|---|---|---|
| 9.1 | Move a lead to Negotiation | Convert button appears |
| 9.2 | Convert to client | Client created |
| 9.3 | Open Clients | New client is there |
| 9.4 | Other region's user opens Clients | New client is **not** there |
| 9.5 | Create a project on that client | Project created |
| 9.6 | Other region's user opens Projects | **Not** there |
| 9.7 | Change the project status | Saves |
| 9.8 | Admin, All regions | Sees the client and project from both chains |

Then once more as **admin in All regions**:

| # | Do | Expect |
|---|---|---|
| 9.9 | Convert an **IN** lead | Client is IN. Robin sees it, US user does not |
| 9.10 | Create a project on it | Project is IN. Same check |

**9.9 is the trap.** The client must take its region from the **lead**, not
from the admin. An admin holds three regions, so there is nothing useful to
copy from the admin.

---

## 10. Notifications and activity log

Known gaps. **Confirm, do not report as new.** Both are written up in
`docs/region-rollout.md`.

| # | Check | Known behaviour |
|---|---|---|
| 10.1 | Admin creates a US lead, Robin checks the bell | Robin **may** get it. Recipients are picked by the actor's regions, and admin holds all |
| 10.2 | Robin opens Activity Log | **May** show US records. The log is not region-scoped yet |

Report only if something worse happens, such as Robin being able to open a US
record from a notification link.

---

## 11. Before you call it done

- [ ] US user created, role 60, region US only
- [ ] Sections 3 to 9 pass
- [ ] Section 10 matches the known behaviour, nothing worse
- [ ] No empty last page anywhere
- [ ] No list where the row count and the total disagree
- [ ] Every URL pasted across regions was refused

## How to report a failure

Give the user, the region they were in, the URL, what appeared, and what you
expected. "US user, pinned US, `/admin/operations/leads/<id>` showed an India
lead named X" is actionable. "Region filtering seems broken" is not.
