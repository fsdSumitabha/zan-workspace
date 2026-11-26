# Website integrations

Two websites send their leads and newsletter sign-ups to zan-workspace:

| Website | Repo | Site id | Regions | Key in zan-workspace |
|---|---|---|---|---|
| zanservices.com | `zanservices` | `zanservices` | IN, US | `ZANSERVICES_SITE_API_KEY` |
| zanversetechnologies.com | `zanverse-technologies` | `zanverse-technologies` | AE | `ZANVERSE_TECHNOLOGIES_SITE_API_KEY` |

Both use the same two routes, the same body and the same headers. A newsletter sign-up and a lead are different things. Each has its own route and its own record, and one never becomes the other.

| Route | Saves | Code |
|---|---|---|
| `POST /api/integrations/leads` | a `Lead`, and a note on it | `src/lib/integrations/receiveLead.ts` |
| `POST /api/integrations/newsletter` | an `EmailContact` | `src/lib/integrations/receiveSignup.ts` |

Both run the same steps first, in `src/lib/integrations/handle.ts`. The site list is in `src/lib/integrations/sites.ts`. The contract is in `src/lib/integrations/contract.ts`. Each website has its own copy of the contract in `server/services/workspace.service.ts`.

## Who may call

Only a website's server. Each website has its own key, of at least 32 characters, sent as:

```
Authorization: Bearer <key>
```

The key decides everything else:

- **Which website it is.** The body's `source` must be that website's id. This catches a website that was set up with the other one's key.
- **Which regions it may write to.** zanservices may send IN and US. zanverse-technologies may send AE only.
- **Which source name its records get.** zan-workspace makes every source name from the website's domain. It never takes one from the body.

A request with an `Origin` or `Sec-Fetch-Site` header is refused with 403. A browser always sends one of them, and a server does not. The routes send no CORS headers, so a browser's preflight fails as well. A key copied into a web page therefore cannot be used from that page.

These keys are not `CLIENT_PORTAL_API_KEY`. That key ships in a browser bundle, so it is not a secret, and it guards `/api/public/leads` only.

## Who the records belong to

Every lead, note and contact a website sends is written as the **system integration user**: the bot account with role 90 ("System Integration User", `src/constants/userRoles.ts`), whose Mongo id is in `ZANSERVICES_USER_ID`. It is the `createdBy` of each record and the actor of its activity log rows. `/api/public/leads` and the booking page already write as this user, so every lead that came in by itself reads the same way, wherever it came from. Both websites use the same bot; a lead's source says which website sent it.

Notifications are sent with no actor, as the booking page sends them, so they read "New lead: Asha Rao" and not as from a person.

Without a valid `ZANSERVICES_USER_ID`, both routes answer 503 and save nothing (`src/lib/integrations/actor.ts`).

## The body

Every body starts with the same fields:

```json
{
  "id": "3f6c2b1e-7d4a-4f0e-9c3d-0a1b2c3d4e5f",
  "source": "zanservices",
  "sentAt": "2026-11-26T10:00:00.000Z",
  "region": "IN",
  "form": "contact_form",
  "page": "zanservices.com/contact-us?from=%2Fweb-development"
}
```

| Field | Rule |
|---|---|
| `id` | 8 to 100 letters, digits, `-` or `_`. A uuid. The same on a retry. If an `Idempotency-Key` header is sent, it must be the same value. |
| `source` | The website's id. It must match the key. |
| `sentAt` | ISO 8601 with a time zone. When the website received the form. It becomes `Lead.submittedAt`. |
| `region` | `IN`, `US` or `AE`, the codes in `src/lib/region.ts`. One of the website's regions. |
| `form` | A snake_case id of the form. See "Form ids" below. |
| `page` | Host, path and query string of the page, or null. The query string is kept, so an ad's tags say which campaign paid. Cut at 500 characters. |

### A lead

```json
{
  "name": "Asha Rao",
  "email": "asha@company.com",
  "phone": "+919830012345",
  "service": "Web Development",
  "interest": null,
  "message": "We need a new website.",
  "chat": null
}
```

- `name` and `phone` are required. Every lead form on both websites requires a phone, and every lead in the CRM has one: `Lead.phone` is required and unique.
- `phone` is E.164 when the website could read it. Otherwise it is what the person typed.
- `email` may be null. The chat assistant's contact card does not ask for one.
- `interest` is the package picked on a landing page.
- `chat` is set for the `chat_widget` form only: `conversationId`, `leadScore`, `service`, `projectType`, `budget`, `timeline`, `requirements`, `technology` and `summary`.
- Free text is cut to its limit, never refused: name 120, phone 40, service 120, interest 120, message 5,000.

### A newsletter sign-up

```json
{
  "email": "reader@company.com",
  "consent": {
    "text": "Yes, email me the Zan Services newsletter: ...",
    "version": "2026-11-25",
    "at": "2026-11-26T10:00:00.000Z"
  }
}
```

`consent` is the record of what the person agreed to: the exact words next to the box they ticked, which version of those words, and when they agreed. The website takes the words from its own code, never from the browser. A sign-up asks for an email address only: it is not a lead.

### Form ids

The same names on both websites. A form not in this list is still accepted, and the CRM shows its id.

| Id | Form | Websites |
|---|---|---|
| `contact_form` | The enquiry form on the homepage and on /contact-us | both |
| `contact_modal` | The timed contact popup | both |
| `service_page_form` | The hero form on a service page | zanservices |
| `landing_page_form` | A paid landing page, /lp/&lt;slug&gt; | zanverse-technologies |
| `chat_widget` | The chat assistant's contact card | both |
| `webmcp` | The AI agent tool | zanverse-technologies |
| `api` | A caller of the website's /api/leads that named no form | zanverse-technologies |
| `newsletter_form` | The newsletter form | both |

## What is saved

### A lead

An enquiry is matched in this order:

1. **The same person in the body's region**, by phone and then by email, gets a new note on that lead. A second enquiry is never lost. A missing email address is filled in; nothing is overwritten. The note repeats a name, email or phone only when it differs from the lead's own.
2. **A lead anywhere else with the same phone number**, in another region or among deleted leads, gets the enquiry. `Lead.phone` is unique across every region and every deleted lead, so a second lead with the number cannot exist. The booking page does the same with this collision (docs/region-rollout.md section 3.5). The note is saved in that lead's region and says which region's site sent the enquiry. A deleted lead is brought back, and the note says so.
3. **Otherwise, a new `Lead`** in the body's region. Its `source` is the website's domain, such as `zanservices.com`, and its `submittedAt` is the body's `sentAt`. What the person wrote goes in the lead's first note, titled "Enquiry from zanservices.com": the form, the page, the service, the package, the message and the chat notes. This is how the bulk import keeps its extra columns too.

**The phone** is saved as E.164 when it is valid for the region's country. A number typed without a country code belongs to that country: +91 for IN, +1 for US, +971 for AE. An invalid number is saved as typed, and the note says so. This is the rule the Facebook webhook follows. A lead is never refused over the format of its phone.

**The team is told.** A new lead sends "New lead" to the body's region. A note on an existing lead sends "New note on ..." to the lead's region, and to the body's region when that is another one.

### A newsletter sign-up

- One `EmailContact` per address per region, as the contact import keeps them. `marketingConsent` is true. `consentSource` is `form:<domain>/<form>`, such as `form:zanservices.com/newsletter_form`. `consentText`, `consentVersion` and `consentPage` hold the consent record. The tags `newsletter` and the website's domain are added, so an audience can pick sign-ups out.
- A second sign-up updates the consent record and adds the tags. Other fields stay as they were.
- **An address on the do-not-email list stays on it.** There is no confirmation email, so anyone could sign someone else up. Only an admin removes an address from that list.
- A contact an admin deleted is restored, with the new consent.
- Addresses at test and throwaway domains, such as `example.com` and `mailinator.com`, are not stored. The contact import follows the same rule (`src/lib/email/audience/address.ts`).
- The answer is always "subscribed", so it never says whether an address was already on the list or had unsubscribed.

## Answers

| Status | When |
|---|---|
| 200 `{ "success": true, "status": "received" }` | A lead was saved, or this id was already saved. |
| 200 `{ "success": true, "status": "subscribed" }` | A sign-up, in every case listed above. |
| 400 | The body does not match the contract, for example a lead with no phone. `details` lists each problem. |
| 401 | No key, or a key that is not a website's. |
| 403 | A browser call, a `source` that is not the key's website, or a region the website may not send. |
| 409 | This id is still being saved by an earlier attempt. The websites count it as received. |
| 413 | The body is over 64 KB. |
| 415 | The body is not `application/json`. |
| 429 | Over the hourly limit. `Retry-After` says when to try again. |
| 503 | No website key is set, two websites have the same key, or `ZANSERVICES_USER_ID` is not the bot's id. |
| 500 | Anything else. The request's claim is released, so a retry can save it. |

## Retries and limits

A website retries a call once, with the same `id`, after a network error, a timeout, or a 429, 502, 503 or 504. Each request id gets an `IntegrationReceipt` row. A repeat of a finished request gets the first answer again. A repeat of a request that is still being saved gets 409. A claim older than one minute is taken over, because its function was stopped. A failed attempt releases its claim. Rows expire after 30 days.

Each website may call each route 200 times an hour. The websites stop a flood earlier, with their own limits: 5 per visitor in 10 minutes, then 40 leads and 100 sign-ups an hour for the whole site.

## Setting it up

1. Make one key per website: `openssl rand -hex 32`. The two keys must differ.
2. In zan-workspace's environment (`.env.local`, and Vercel for production), set `ZANSERVICES_SITE_API_KEY` and `ZANVERSE_TECHNOLOGIES_SITE_API_KEY`. Check that `ZANSERVICES_USER_ID` holds the bot user's Mongo id. Redeploy. Never put a real key in `env.example`: that file is committed.
3. Run `npm run db:indexes`, which builds the `IntegrationReceipt` indexes.
4. In each website, set `ZAN_WORKSPACE_URL` to zan-workspace's address, with https, and `ZAN_WORKSPACE_API_KEY` to that website's key. Redeploy. zanverse-technologies decides at build time whether to show its newsletter band, so it needs a new build.
5. Send one enquiry and one sign-up from each website. Check that each lead is in the right region with its note, created by the bot, and that each contact has its consent record.

On a preview deploy, set `ZAN_WORKSPACE_DRY_RUN=true` in a website. It then logs each lead and sign-up, with the contact details masked, and sends nothing.

## Tests

`npm test` runs `src/lib/integrations/contract.test.ts`, which needs no database, and `src/lib/integrations/integrations.test.ts`. The second one calls both routes against the `_test` database only, the way a website does. It covers regions, phones, repeat enquiries, a phone another region already has, deleted leads, retries, the key rules, the bot user and the consent record.
