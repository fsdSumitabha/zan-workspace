# Prompt for generating an MJML template

Paste this at the top of a request to Claude (or any model) when you want
an email template for the Zan CRM. Then describe the email you want.

It exists because a generated file that looks fine can still break the
editor or send broken links. Every rule below comes from something this
app actually does. See `docs/EMAIL_MARKETING_ARCHITECTURE.md` for the
module itself.

---

## The prompt

> Write an email template in MJML for our CRM. Follow these rules
> exactly. They are not style preferences; breaking one either refuses
> the file or sends a broken email.
>
> **Version**
>
> - MJML 4.18.0. Do not use any tag or attribute added after it.
>
> **Comments**
>
> - Never put two hyphens in a row inside an HTML comment. No `--`, no
>   `----`, no dashed separator lines. XML forbids it and our editor
>   refuses to open the file. Use a blank line or a short word instead.
>
> **Merge fields**
>
> - These are the only ones that exist. Anything else is sent to the
>   reader as literal text:
>
>   | Token | Becomes |
>   | --- | --- |
>   | `{{first_name}}` | The person's first name |
>   | `{{name}}` | Their full name |
>   | `{{email}}` | Their email address |
>   | `{{company}}` | Their company |
>   | `{{phone}}` | Their phone number |
>   | `{{lead_source}}` | Where the lead came from |
>   | `{{owner_name}}` | The salesperson who owns them |
>   | `{{unsubscribe_url}}` | The unsubscribe link |
>   | `{{postal_address}}` | Our office address |
>
> - Do **not** invent tokens. No `{{view_in_browser_url}}`, no
>   `{{preferences_url}}`, no `{{company_address}}`. There is no "view in
>   browser" link in this system; leave it out entirely.
> - The footer must contain `{{unsubscribe_url}}` as a real link and
>   `{{postal_address}}` as text. Both are legally required.
> - Use `{{first_name}}` in the greeting. It falls back to "there" when
>   we have no name, so `Hi {{first_name}},` reads correctly either way.
>
> **Preview text**
>
> - Put the inbox preview line in `<mj-preview>` inside `<mj-head>`. That
>   is the only place it works. One sentence that continues the subject
>   rather than repeating it.
> - Also set `<mj-title>`.
>
> **Not allowed**
>
> - `<script>`, `<iframe>`, `<object>`, `<embed>`, `<mj-include>`
> - Any `on...=` attribute such as `onclick`
> - `javascript:` URLs
> - CSS `expression()`
>
> **Images**
>
> - Absolute `https://` URLs only. No local paths, no `data:` URIs.
> - PNG or JPG. Gmail and Outlook do not show SVG or WebP.
> - Always set `alt` text. Many readers block images by default.
>
> **Size and layout**
>
> - `<mj-body width="600px">`.
> - The compiled HTML must stay under 100 KB. Past that Gmail hides the
>   rest behind "View entire message", including the unsubscribe link.
> - Put CSS in `<mj-style inline="inline">`. Classes that are not inlined
>   are dropped by several clients.
> - Web fonts via `<mj-font>` are fine, but always give a real fallback
>   stack. Gmail ignores them.
>
> Output the complete MJML file and nothing else.

---

## After you get the file

1. Templates → New template → "Start from an MJML file".
2. The dialog warns if `{{unsubscribe_url}}` or `{{postal_address}}` is
   missing. Those are warnings, not refusals; fix them before sending.
3. The server compiles it. A file that cannot compile is refused with
   the line number.
4. The editor opens. Check it on the phone view before saving.

## Known trap

The campaign wizard has a **Preview text** field on step 1. It is saved
but never sent. The preview line that reaches the inbox is the
`<mj-preview>` in the template. Until that is fixed, set the preview
text in the template, not in the wizard.
