# Asking Claude for an email template

Copy both blocks below into Claude. The first never changes. The second
is where you say what you actually want.

Then import the file: Email Marketing → Templates → New template → Start
from an MJML file.

---

## Block 1: the rules (copy as is, never change)

```
You are writing an email template for the Zan Services CRM. Follow these
rules exactly. Breaking one either stops the file importing or sends a
broken email to real customers.

FORMAT
- MJML, version 4.18. Do not use a tag added after it.
- Body width 600px. The compiled HTML must stay under 100KB.
- Set <mj-title> and <mj-preview>. The preview is the line the inbox
  shows after the subject: continue the subject, do not repeat it.
- Never put two hyphens together inside an HTML comment. It stops our
  editor from opening the file.
- No <script>, <iframe>, <object> or <mj-include>.
- Images: absolute https URLs, PNG or JPG only, always with alt text.
  No SVG and no WebP. Gmail and Outlook do not show them.

MERGE FIELDS
- Only these exist:
  {{first_name}} {{name}} {{email}} {{company}}
  {{phone}} {{owner_name}} {{unsubscribe_url}} {{postal_address}}
- Invent none. An unknown one is printed to the reader as literal text.
- Greet with: Hi {{first_name}},
- The footer must carry {{unsubscribe_url}} as a real link and
  {{postal_address}} as text. Both are required by law.

OUTPUT
- The complete MJML file and nothing else. No explanation.
```

## Block 2: what you want (fill this in every time)

```
WHAT TO BUILD

Occasion or purpose:
Main message:
The one action the reader should take:
Button text and where it links:
Must appear (offers, codes, dates, phone numbers):
Tone:
```

---

## A filled example

```
WHAT TO BUILD

Occasion or purpose: Bhai Dooj greeting to our clients and leads
Main message: Warm festival wishes, and a reminder that we are here for
  their next project. Not a hard sell.
The one action the reader should take: Reply or message us on WhatsApp
Button text and where it links: "Talk to us" →
  https://wa.me/918282948444
Must appear: Zan Services wordmark, festive red and gold, one line
  saying 15% off branding work booked this month
Tone: warm and personal, short, three or four short sections
```

---

## After you get the file

1. Templates → New template → "Start from an MJML file".
2. The dialog warns if `{{unsubscribe_url}}` or `{{postal_address}}` is
   missing. Fix those before sending.
3. The server compiles it. A file that cannot compile is refused with
   the line number.
4. The editor opens. Check the phone view before saving.

## Things people get wrong

**Do not hardcode the office address.** Use `{{postal_address}}`. It is
set once in Settings, so moving office means changing one field, not
every template.

**Do not invent merge fields.** `{{view_in_browser_url}}` does not
exist here. It would be sent to the customer as that exact text.

**The Personalise step only matters for two fields.** First name and
Salesperson. The Unsubscribe link and Postal address boxes are ignored:
the app always supplies both, so they can never fall back.

**Preview text goes in the template.** The Preview text box on the
campaign wizard is saved but not sent. Put it in `<mj-preview>`.
