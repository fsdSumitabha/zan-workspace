/**
 * Makes MJML safe for an XML parser, without changing what it says.
 *
 * ## Why this exists
 *
 * MJML is parsed twice by two different parsers, and they do not agree.
 *
 * The compiler (`mjml2html`) is forgiving. The editor is not: GrapesJS
 * parses the source with the browser's XML parser, which follows the XML
 * rules exactly. So a template can compile, send correctly, and still
 * refuse to open in the editor. That is the worst kind of bug, because
 * nothing fails until somebody tries to edit.
 *
 * Two things cause it, and both are fixed here.
 *
 * ## A bare ampersand
 *
 * `&` starts an entity in XML. A URL such as
 * `...?family=Poppins&display=swap` is a parse error, not a URL.
 *
 * This is not a theory. The editor's own save produced it: GrapesJS
 * serialises the canvas back to MJML and writes `&` where the source had
 * `&amp;`. Open a template, type one word, save, and it can never be
 * opened again.
 *
 * ## A named entity XML does not know
 *
 * XML defines five: `&amp;` `&lt;` `&gt;` `&quot;` `&apos;`. That is all.
 * `&nbsp;` is an HTML entity, not an XML one, and the editor refuses it
 * even though every email client renders it. So named entities are
 * rewritten to their numeric form, which both parsers accept and which
 * renders identically.
 *
 * Nothing here changes a single character the reader sees.
 */

/** The only named entities XML defines. Left exactly as they are. */
const XML_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"])

/**
 * Named HTML entities and their code points.
 *
 * Not the full HTML list, which runs past two thousand. These are the
 * ones that turn up in email: spacing, punctuation, currency and the
 * legal marks. Anything not here is made literal rather than guessed at,
 * so the author sees it and can fix it.
 */
const NAMED_ENTITIES: Record<string, number> = {
    nbsp: 160,
    cent: 162,
    pound: 163,
    yen: 165,
    sect: 167,
    copy: 169,
    laquo: 171,
    reg: 174,
    deg: 176,
    plusmn: 177,
    micro: 181,
    para: 182,
    middot: 183,
    raquo: 187,
    frac14: 188,
    frac12: 189,
    frac34: 190,
    times: 215,
    divide: 247,
    ndash: 8211,
    mdash: 8212,
    lsquo: 8216,
    rsquo: 8217,
    sbquo: 8218,
    ldquo: 8220,
    rdquo: 8221,
    bdquo: 8222,
    dagger: 8224,
    Dagger: 8225,
    bull: 8226,
    hellip: 8230,
    permil: 8240,
    prime: 8242,
    Prime: 8243,
    euro: 8364,
    trade: 8482,
    larr: 8592,
    uarr: 8593,
    rarr: 8594,
    darr: 8595,
    harr: 8596,
    spades: 9824,
    clubs: 9827,
    hearts: 9829,
    diams: 9830,
}

/**
 * An `&`, and the entity body after it when there is a complete one.
 *
 * The group is optional on purpose. When it does not match, the `&` was
 * bare and has to be escaped. `?a=1&b=2` does not match, because `b=2`
 * holds an `=` before any `;`.
 */
const ENTITY = /&(#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)?/g

export function normaliseMjml(mjml: string): string {
    return mjml.replace(ENTITY, (whole, body: string | undefined) => {
        // A bare ampersand. The common case, and the one the editor's own
        // save creates.
        if (!body) return "&amp;"

        // Numeric. Every parser knows these.
        if (body.startsWith("#")) return whole

        const name = body.slice(0, -1)

        if (XML_ENTITIES.has(name)) return whole

        const code = NAMED_ENTITIES[name]
        if (code) return `&#${code};`

        // A name we do not know. Make it literal text rather than guess.
        // The author sees `&foo;` in the email and fixes it; the editor
        // still opens, which it would not have done.
        return `&amp;${body}`
    })
}

/**
 * The line of the first comment holding a double hyphen, or 0.
 *
 * XML forbids `--` inside a comment, so a dashed separator line in a
 * header comment stops the editor from opening the file. The compiler
 * accepts it, which is why this has to be checked rather than left to
 * fail later.
 *
 * It is not repaired automatically. A comment is the author's own note,
 * and quietly editing somebody's words is worse than telling them which
 * line to change.
 */
export function commentWithDoubleHyphen(mjml: string): number {
    const comments = /<!--([\s\S]*?)-->/g

    let match: RegExpExecArray | null
    while ((match = comments.exec(mjml)) !== null) {
        if (match[1].includes("--")) {
            return mjml.slice(0, match.index).split("\n").length
        }
    }

    return 0
}
