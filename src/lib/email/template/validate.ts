import { EmailError } from "@/lib/email/http"

/**
 * Checks MJML source before it is ever handed to the compiler.
 *
 * ## This is a security boundary, not a convenience
 *
 * `mjml@4.18.0` has a known directory traversal through `<mj-include>`
 * (GHSA-45h5-66jx-r2wf, an incomplete fix for CVE-2020-12827). It affects
 * every 4.x release. The only upstream fix is MJML 5, which we cannot take:
 * `grapesjs-mjml@1.0.8` depends on `mjml-browser@^4.18.0`, so moving the
 * server to 5 would make the editor and the server compile different HTML
 * from the same source.
 *
 * So we close it here instead, and the fix does not depend on the library:
 * `<mj-include>` is refused outright. It is the only tag that reaches the
 * filesystem, and we have no use for it. Our templates are self-contained
 * strings in MongoDB, never files on disk. A template that cannot name a
 * path cannot traverse one.
 *
 * Check this list again when `grapesjs-mjml` supports MJML 5. The rejection
 * can stay even then; nothing in the product needs file includes.
 */

/** Gmail clips a message over about 102 KB. Well before that, refuse. */
export const MAX_MJML_BYTES = 512 * 1024
export const MAX_HTML_BYTES = 2 * 1024 * 1024
/** Gmail starts clipping here. A warning, not an error. */
export const GMAIL_CLIP_BYTES = 102 * 1024

/**
 * Tags and attributes that must never survive into a template.
 *
 * `mj-include` is the traversal above. The rest would put executable or
 * remote content into an email, which no mail client runs anyway, so their
 * only effect would be on our own preview and on spam scoring.
 */
const BANNED_PATTERNS: Array<{ re: RegExp; message: string }> = [
    {
        re: /<\s*mj-include\b/i,
        message:
            "mj-include is not allowed. Templates cannot read files from the " +
            "server. Paste the content in directly instead.",
    },
    {
        re: /<\s*script\b/i,
        message: "A <script> tag is not allowed. Email clients strip scripts anyway.",
    },
    {
        re: /<\s*iframe\b/i,
        message: "An <iframe> is not allowed in an email template.",
    },
    {
        re: /<\s*object\b|<\s*embed\b/i,
        message: "<object> and <embed> are not allowed in an email template.",
    },
    {
        re: /\son[a-z]+\s*=/i,
        message:
            "Event attributes such as onclick are not allowed. Email clients " +
            "strip them anyway.",
    },
    {
        re: /javascript\s*:/i,
        message: "A javascript: URL is not allowed.",
    },
    {
        re: /<\s*mj-style[^>]*>[\s\S]*?expression\s*\(/i,
        message: "CSS expression() is not allowed.",
    },
]

export interface MjmlCheck {
    /** Non-fatal notes to show the author. */
    warnings: string[]
}

/**
 * Refuses MJML we will not compile. Throws EmailError with a message that
 * says what to do, because the person reading it is a designer, not an
 * engineer.
 */
export function validateMjmlSource(mjml: unknown): MjmlCheck {
    if (typeof mjml !== "string" || !mjml.trim()) {
        throw new EmailError("The template is empty.", 400, { field: "mjml" })
    }

    const bytes = Buffer.byteLength(mjml, "utf8")

    if (bytes > MAX_MJML_BYTES) {
        throw new EmailError(
            `This template is ${Math.round(bytes / 1024)} KB. The limit is ` +
            `${MAX_MJML_BYTES / 1024} KB. Remove some content, or link to it ` +
            "instead of putting it in the email.",
            400,
            { field: "mjml" }
        )
    }

    for (const { re, message } of BANNED_PATTERNS) {
        if (re.test(mjml)) {
            throw new EmailError(message, 400, { field: "mjml" })
        }
    }

    if (!/<\s*mjml[\s>]/i.test(mjml)) {
        throw new EmailError(
            "This does not look like MJML. It should start with an <mjml> tag.",
            400,
            { field: "mjml" }
        )
    }

    const warnings: string[] = []

    if (!/<\s*mj-body/i.test(mjml)) {
        warnings.push("There is no <mj-body>, so the email will be empty.")
    }

    return { warnings }
}
