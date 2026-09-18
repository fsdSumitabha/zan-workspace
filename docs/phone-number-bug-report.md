I'll start by reading what changed on the new branch. Then I'll test the phone fields on screen.

The new code uses `libphonenumber-js` and adds a country picker. Reading the new phone components next.

The hidden-mark list is correct (U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF). Reading the other new phone files and the changed routes.

Both edit routes keep an unchanged saved phone as it is. They check the phone only when it changes. Reading the call route and the forms.

The call form checks the phone before it starts saving, so a bad phone cannot leave the button stuck. Checking that the dev server picked up the new branch and packages.

That compile error was from a half-finished edit earlier. Later builds passed. Checking that no file still uses the old function.

Display components now use a shared `PhoneText` component. Invalid old values are shown in grey and are never links. Looking at the country picker.

Got the new design confirmed: a country picker for the phone field (no free-text letters), server-side validation via libphonenumber-js with clear messages, and old invalid values kept grey and non-clickable. Now opening the browser to run through all the on-screen tests.

The new phone box shows a US flag, "+1", and the example "(201) 555-0123". The side panel says "Leads 0", so I'm checking what data is in the database now.

The database is empty now. You removed the old test data. I'll test the forms first. Later I'll add a few old-style numbers to test how old data is handled. Test 1 on Create Lead: empty phone.

The browser pane shows the page at 82% size, so I'll convert positions to screen positions.

Filling Name and Source. Then I'll click Create Lead with the phone empty.

Test 1 result: correct. The box turns red and says "Phone number is required." Test 2: typing letters, "call me".

Test 2 result: correct. Letters cannot be typed, and the box stays empty. Test 3: "0000000000".

Test 3 result: correct. It says "This is not a valid number for the selected country." From now on I'll press Enter in the phone box to submit, as a user would. Test 4: "555-0123" (no area code).

Enter did not submit the form. Trying the key name "Enter".

The "too short" message appeared. But I can't tell yet whether it came from Enter or from leaving the phone box. I'll add a listener that counts form submits, then check again.

Enter key doesn't submit forms in this test browser, so I'll click the submit button instead. I also noticed the phone field's error message shifts the button down, so I'm checking whether that causes the first click to miss it.

Confirmed the issue is minor—the bad number error just shifts the button down without submitting, so no data is lost. Next I'll test an Indian mobile number ("98765 43210") with the country still set to US.

Test 5 result: correct. It is no longer saved as a US number; the user is told to check the country. Test 6: "(555) 555-5555", a common fake number.

Tests 6 and 7 correctly reject invalid numbers, though test 7's "too short" message could be a bit confusing. Next, I'll run test 8 as a control with a valid-format number, "(415) 555-0160", which should save successfully.

Test 8 passed—it saved as "+14155550160" and displays as "+1 415 555 0160". Now running Test 9 with the same number formatted with dots to check duplicate detection.

The dots were dropped as I typed. The box shows "(415) 555-0160". Clicking Create Lead.

Test 9 passed—the server correctly flags duplicate phone numbers. Now running test 10, pasting a note with an embedded phone number to check which digits the box retains.

The box now shows "(641) 555-5014". The "6" from "6pm" became the first digit, and the last digit was cut. This is a different person's number. Submitting to see if the app saves it.

Confirmed the bug: pasted text saved as a valid-looking number "+16415555014" belonging to someone else, since the box strips surrounding letters before the server's context check runs, so the WhatsApp link would open a chat with a stranger. Next, testing case 11: a typo with an extra digit, "415 5555 0146".

The box shows "(415) 555-5014". The extra digit was not flagged. The box silently dropped the last digit instead. Submitting.

Confirmed the bug: the box silently drops extra digits instead of warning the user, saving the typo as "+14155555014". Next, I'll test entering a UK number with its country code ("+44 20 7946 0958") to see if the country auto-switches.

The country switched to UK by itself. The box shows "+44 20 7946 0958". The "+44" now appears twice, in the picker and in the box; that is only a look issue. Submitting.

Test 12 result: correct. It saved "+442079460958", and the WhatsApp link is right. Test 13: the same UK number written with "(0)", "+44 (0) 20 7946 0958". Many UK people write numbers this way.

Test 13 result: correct. The library understood "(0)": it read the same UK number and caught the duplicate from test 12. Test 14: a UAE mobile, "+971 50 123 4567".

Test 14 passed, saving "+971501234567" as "+971 50 123 4567". Now testing full-width and Arabic-Indic digit inputs (Tests 15-16) to see how the field handles them.

Tests 15 and 16 result: correct. Both kinds of digits turned into normal digits: "(415) 555-0161" and "(415) 555-0162". Saving the Arabic-digit one to confirm.

Saved as "+14155550162". Test 17: a number copied with hidden marks. Test 18: "011 44 20 7946 0958", which is how people in the US dial abroad.

Test 17 passed with the cleaned-up number, and test 18 kept "011 44 20 7946 0958" while the picker stayed on US. I'll submit it now to see how the app interprets that number.

Confirmed a serious bug: entering "011 44 20 7946 0958" (a US-dialed UK number) gets saved as "+12079460958," pointing to an unrelated US number instead. Next, I'll test entering a US number and then switching the country picker to India.

After the switch, the box kept the digits and showed them as an Indian number: "+91 4155 550 164". Submitting.

Test 19 confirmed changing the country kept digits and saved "+914155550164", visibly shown before saving. Since the database is now clean and the app blocks bad numbers, I'll insert legacy "ZZ OLD" records directly into `zan_services_usa`, starting by checking how call history is loaded.

Call history loads Call records through Interaction records (type 2210). I need your user ID for the "created by" field, and the client status value.

I'll insert these clearly named test records into `zan_services_usa` only. The script stops if the database name is anything else.

I found that the leads collection is missing its unique `phone` index, likely because the collection was dropped after Mongoose built indexes at startup—this is why duplicate-phone detection isn't working. I'll restart the dev server to rebuild the index; there are no existing duplicates, so this should work fine, and your login will remain valid.

The old server stopped as planned. Starting it again.

The server is back. Checking whether the phone index was rebuilt. This check only reads.

The unique phone index is back. Test 20: a new lead with "(415) 555-0190". That number belongs to a deleted lead ("ZZ OLD deleted").

Test 20 result: correct. It says "A deleted lead has this phone number." This works only now that the index exists. Test 21: "(415) 555-0180". An old lead stored this number as "4155550180".

Test 21 result: correct. The old "4155550180" was found as a duplicate. Test 22: "(415) 555-0181". An old lead stored this number with spaces and a dash, "(415) 555-0181".

Test 22 confirms a bug: the duplicate check misses old-format numbers like "(415) 555-0181", which will also affect India-style numbers like "98765 43210" as your code comment noted. Next I'll run the "Edit lead" tests, starting with "ZZ OLD vanity" (old value "+1800").

The edit page shows an amber note: 'Saved value "+1800" is not a valid number. It stays as it is unless you enter a new one.' Test E1: change only the name, then save.

Test E1 passed: the name updated and "+1800" correctly shows as invalid (grey, tooltip, no WhatsApp link). Now testing E2 by changing "ZZ OLD 10 digits"'s phone to one already used by another lead.

The old value "4155550180" shows correctly as "(415) 555-0180". Replacing it with "(415) 555-0160", which belongs to "ZZ V2 Test".

Test E2 result: correct. It says "Another lead already has this phone number." Test E3: empty the phone box, then save.

Backspace did not change the phone box. I'm checking whether Backspace works in a normal box, to tell a tool limit from an app bug.

Backspace isn't working in the Name box either, confirming this is a tool limitation. I'll try clearing the phone box by selecting its text and typing a letter, since it rejects letters and should leave it empty.

The phone box is empty now. Clicking Update Lead.

Test E3 result: correct. It says "Phone number is required.", and the database still holds "4155550180". Now the client edit page. Opening "ZZ OLD client", whose old phone is "N/A".

I noticed a small display bug on the client page—the amber note breaks the word "unless" mid-way due to the `break-all` class applying to the whole note instead of just the saved value. Now I'll run test C1: changing only the client name and saving.

Test C1 result: correct. The name changed and the phone stayed "N/A". The client page shows it in grey with no link. Test C2: give the client a real number, "(415) 555-0170".

Test C2 result: correct. It saved "+14155550170", and the client page shows a working WhatsApp link, "+1 415 555 0170". Next is the "Log call" form on this client page. Opening it.

The label now says "Contact Phone *". Filling the other required fields, so only the phone is under test.

Test K1: Save Call with the phone empty.

Test K1 result: correct. It says "Phone number is required." Test K2: "12345". This time I won't scroll after clicking Save, to see whether the user can see the error.

Found the bug: on the long call form, the "too short" phone error appears off-screen with no scroll or toast, making Save look broken (lead/client forms are short enough to avoid this). Next I'll run test K3 with a real number, "(415) 555-0171", as a control.

My typing did not reach the phone box. Taking a screenshot to check the layout.

The box shows "(415) 555-0171". Clicking Save Call.

Test K3 passed — the call saved correctly and the history shows a working phone link. Now checking old call records under "ZZ OLD 10 digits," which has two entries: "----------" and "4155550183".

Old call records look correct: invalid numbers show greyed out with a tooltip, and valid ones display formatted with working phone links. Next I'll check the leads list at phone width to see how the old 60-digit number renders there.

Correct at phone width. The page is exactly 375 px wide. The 60-digit old number wraps onto two lines in grey. Checking that lead's details page too.

The details page fits at 375 px, and the long number wraps in grey. Switching back to desktop size. Next is the search test on the Leads page.

Search is working now — "(415) 555-0181" correctly returns the 2 duplicate leads from test 22. Next I'll run direct server tests, adding a temporary on-page results panel (not part of your app, gone on reload) so you can watch them.

Running the server tests now. Each row appears in the panel as it finishes.

The server-side check is solid, correctly rejecting invalid formats while accepting valid UK number variants — but the phone box modifies input before it reaches the server in tests 10, 11, and 18. I'll show the panel with these findings.

Now three more server tests: a call saved with the phone "abc", a client changed to "N/A", and two admins adding the same new number at the same moment.

Result 14 shows a bug: when two admins add the same number simultaneously, the second gets an incorrect "deleted lead" message even though none exists—the route wrongly assumes every database duplicate error means a deleted lead. Next I'll check search on the Clients page.

Your branch fixes most of the old bugs. But 6 of the 52 checks I ran are still bugs, and 3 of them save a wrong phone number with no warning.

**Why:** the server check is now strong: all 13 of its other tests passed. The weak spot is the phone box itself. It changes what the user typed before the server sees it. So a wrong number arrives looking valid, and the server cannot catch it.

**One thing I changed:** the leads collection had no unique index on `phone`. It was probably dropped when the database was emptied, after the server started. Without the index, the new "A deleted lead has this phone number." message can never show. I restarted the dev server, which rebuilt the index. I did not change any code.

### Create lead (typed in the phone box)
| # | Typed | Result | Verdict |
|---|---|---|---|
| 1 | (empty) | "Phone number is required." | OK |
| 2 | `call me` | Letters cannot be typed | OK |
| 3 | `0000000000` | "This is not a valid number for the selected country." | OK |
| 4 | `555-0123` | "This number is too short…" | OK |
| 5 | `98765 43210` (Indian number, US picked) | "Not a valid number for the selected country." It no longer adds +1 by itself. | OK |
| 6 | `(555) 555-5555` | Rejected | OK |
| 7 | `(123) 456-7890` | Rejected, but it says "too short". The box reads the first 1 as the US trunk prefix. | Minor |
| 8 | `(415) 555-0160` | Saved `+14155550160`. Shown as `+1 415 555 0160`. | OK |
| 9 | `415.555.0160` (same number) | "Another lead already has this phone number." | OK |
| 10 | pasted `Call after 6pm: 415 555 0146` | Saved `+16415555014`: the "6" from "6pm" joined the number. The WhatsApp link opens a stranger's chat. | **Bug** |
| 11 | `415 5555 0146` (one extra digit) | The box dropped the last digit. Saved `+14155555014`. | **Bug** |
| 12 | `+44 20 7946 0958` | Country switched to UK. Saved `+442079460958`. | OK |
| 13 | `+44 (0) 20 7946 0958` | Read as the same UK number. Duplicate caught. | OK |
| 14 | `+971 50 123 4567` | Saved `+971501234567` | OK |
| 15 | `４１５５５５０１６１` (full-width digits) | Turned into normal digits | OK |
| 16 | `٤١٥٥٥٥٠١٦٢` (Arabic-Indic digits) | Saved `+14155550162` | OK |
| 17 | number copied with hidden marks | Shown as `+1 415 555 0163` | OK |
| 18 | `011 44 20 7946 0958` (the US way to dial the UK) | The box showed it as typed, but saved `+12079460958`, a US number | **Bug** |
| 19 | typed a US number, then picked India | Saved `+914155550164`. "+91" was visible, but there was no warning. | Risky |
| 20 | a deleted lead's number | "A deleted lead has this phone number." | OK |
| 21 | `(415) 555-0180`; an old lead has `4155550180` | Duplicate caught | OK |
| 22 | `(415) 555-0181`; an old lead has `(415) 555-0181` | A second lead was saved for the same person | **Bug** |

### Edit lead, edit client, log call
| # | Page | Action | Result | Verdict |
|---|---|---|---|---|
| 1 | Edit lead | Old value `+1800`, changed only the name | Amber note shown. `+1800` kept. Shown grey, with no link. | OK |
| 2 | Edit lead | Changed to another lead's number | "Another lead already has this phone number." | OK |
| 3 | Edit lead | Emptied the box | "Phone number is required." Database unchanged. | OK |
| 4 | Edit client | Old value `N/A`, changed only the name | `N/A` kept. The amber note breaks a word in the middle ("u / nless"). | OK, minor |
| 5 | Edit client | `(415) 555-0170` | Saved `+14155550170`, with a working WhatsApp link | OK |
| 6 | Log call | Phone empty | "Phone number is required." Label now has `*`. | OK |
| 7 | Log call | `12345` | The error sits above the screen. Nothing scrolls and no toast appears, so Save looks broken. | **Bug** |
| 8 | Log call | `(415) 555-0171` | Saved. The call history shows a phone link. | OK |

### Display and search: all 8 checks passed
- **Old values in the call history:**
  - "----------" is grey, with no link.
  - The raw "4155550183" is shown as `+1 415 555 0183`, as a link.
- **Phone width:** at 375 px, the leads list and the lead page fit. The 60-digit old number wraps.
- **Search:** "(415) 555-0181" finds both leads on the Leads page. "(415) 555-0170" finds the client on the Clients page.

### Sent directly to the server (skipping the box)
I showed these in a temporary panel on the page. 13 of 14 passed:
- The note, the extra digit and the extension are all rejected with clear messages.
- `011 44…` and `0044…` are read as the UK number.
- Empty text, spaces and `{"$ne":null}` are all blocked.

The one failure (**Bug**): two admins created the same new number at the same moment. The database correctly saved only one lead. But the second admin was told "A deleted lead has this phone number." No deleted lead has it.

### Fixes
1. **Bug: the box drops digits and letters on its own (tests 10 and 11).**
   - Why: `limitMaxLength` at [PhoneField.tsx:68](src/components/phone/PhoneField.tsx:68) silently cuts extra digits. Pasted letters are dropped, so digits in the text join the number. The server never sees the original text.
   - Fix: remove `limitMaxLength`, so an extra digit leads to "This number is too long." Also add an `onPaste` check: if the pasted text fails `validatePhone`, block the paste and show the message.
2. **Bug: "011" makes a US number (test 18).**
   - Why: with a country picked, the box keeps that country and uses only the rest of the digits.
   - Fix: inside the box, change a leading `011` (US) or `00` (IN, AE) to `+` as the user types. Then the country switches, as it does for "+44".
3. **Bug: the duplicate check misses old numbers typed with spaces or dashes (test 22).**
   - Why: `phoneLookupValues` in [phone.ts:111](src/lib/phone.ts:111) matches exact text only.
   - Fix: run a one-time script that rewrites each valid old number to E.164 with `toE164()`. Leave invalid values as they are. This matters most on your India database.
4. **Bug: the call form hides its phone error.**
   - Why: the check at [CallForm.tsx:37](src/components/admin/operations/InteractionModal/CallForm.tsx:37) is JavaScript, not the browser's own form check, so nothing scrolls to the error.
   - Fix: when the check fails, focus the phone box.
5. **Bug: wrong "deleted lead" message.**
   - Why: the error handler at [leads/route.ts:201](src/app/api/admin/operations/leads/route.ts:201), and the same one in the edit route, treats every duplicate error as a deleted lead.
   - Fix: look for a deleted lead with that phone first. If none exists, say "Another lead already has this phone number."
6. **Risky: the unique index can be missing.** Mongoose builds it only at startup, and may not build it at all when `autoIndex` is off in production. Fix: build it on purpose at deploy time, for example with `Lead.syncIndexes()`.
7. **Minor:**
   - Put `break-all` only on the saved value in [PhoneHint.tsx:15](src/components/phone/PhoneHint.tsx:15), not on the whole note.
   - "+44" shows twice: once in the picker and once in the box.

### Test data
- **Created through the app:**
  - 11 leads, named "ZZ V2 …" and "ZZ API …"
  - 1 call on the client
- **Inserted directly into `zan_services_usa`**, because the app no longer accepts bad numbers:
  - 7 "ZZ OLD" leads (1 of them deleted)
  - 1 "ZZ OLD client"
  - 2 old calls
- **Dev server:** it now runs from this session.

Should I fix these 6 bugs on the branch? I can also delete the test records.