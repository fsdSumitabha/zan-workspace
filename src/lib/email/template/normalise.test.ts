import test from "node:test"
import assert from "node:assert/strict"

import { commentWithDoubleHyphen, normaliseMjml } from "./normalise"

/**
 * Stored MJML has to survive two parsers: MJML's, which compiles it, and
 * the browser's XML parser, which the editor uses to reopen it. MJML's is
 * forgiving and the browser's is not, so a template could compile, send
 * correctly, and never open again.
 *
 * These pin the two things that caused it.
 */

/* ---------------------------------------------------------------- */
/* A bare ampersand                                                  */
/* ---------------------------------------------------------------- */

test("a bare ampersand in a URL is escaped", () => {
    // The real case. GrapesJS wrote this back on save, and the template
    // could not be reopened afterwards.
    const src =
        '<mj-font href="https://fonts.googleapis.com/css2?family=Poppins&display=swap" />'

    assert.equal(
        normaliseMjml(src),
        '<mj-font href="https://fonts.googleapis.com/css2?family=Poppins&amp;display=swap" />'
    )
})

test("an ampersand already escaped is left alone", () => {
    const src = "<mj-text>Website &amp; App Development</mj-text>"
    assert.equal(normaliseMjml(src), src)
})

test("escaping twice changes nothing the second time", () => {
    // Every save runs this again. If it were not stable, "&" would become
    // "&amp;amp;" and then "&amp;amp;amp;", one layer per save.
    const once = normaliseMjml("<a>Tom & Jerry</a>")
    assert.equal(normaliseMjml(once), once)
})

test("a bare ampersand before a space is escaped", () => {
    assert.equal(normaliseMjml("<a>A & B</a>"), "<a>A &amp; B</a>")
})

/* ---------------------------------------------------------------- */
/* Named entities                                                    */
/* ---------------------------------------------------------------- */

test("nbsp becomes numeric, because XML does not define it", () => {
    assert.equal(
        normaliseMjml("<a>ISO 27001 &nbsp;&bull;&nbsp; certified</a>"),
        "<a>ISO 27001 &#160;&#8226;&#160; certified</a>"
    )
})

test("the five XML entities are untouched", () => {
    const src = "<a>&amp;&lt;&gt;&quot;&apos;</a>"
    assert.equal(normaliseMjml(src), src)
})

test("numeric entities are untouched", () => {
    const src = "<a>&#160;&#x27;&#8212;</a>"
    assert.equal(normaliseMjml(src), src)
})

test("a name we do not know is made literal, not guessed at", () => {
    // It shows as "&zzz;" in the email, which the author can see and fix.
    // The alternative is an editor that will not open, which they cannot.
    assert.equal(normaliseMjml("<a>&zzz;</a>"), "<a>&amp;zzz;</a>")
})

/* ---------------------------------------------------------------- */
/* Nothing else is touched                                           */
/* ---------------------------------------------------------------- */

test("merge tokens are not disturbed", () => {
    const src = '<a href="{{unsubscribe_url}}">Hi {{first_name}}</a>'
    assert.equal(normaliseMjml(src), src)
})

test("a query string with several parameters is fully escaped", () => {
    assert.equal(
        normaliseMjml('<a href="https://x.test/?a=1&b=2&c=3">go</a>'),
        '<a href="https://x.test/?a=1&amp;b=2&amp;c=3">go</a>'
    )
})

/* ---------------------------------------------------------------- */
/* Double hyphen in a comment                                        */
/* ---------------------------------------------------------------- */

test("a dashed separator line in a comment is found, with its line", () => {
    const src = ["<!--", "  Zan Services", "  --------------", "-->", "<mjml />"].join(
        "\n"
    )

    assert.equal(commentWithDoubleHyphen(src), 1)
})

test("an ordinary comment is fine", () => {
    assert.equal(commentWithDoubleHyphen("<mjml><!-- the header --></mjml>"), 0)
})

test("hyphens outside a comment are fine", () => {
    // A long dashed rule in the body is not a parse problem.
    assert.equal(commentWithDoubleHyphen("<mj-text>a -- b</mj-text>"), 0)
})

test("the line reported is the comment's own, not the first one", () => {
    const src = ["<mjml>", "<!-- fine -->", "", "<!-- a -- b -->", "</mjml>"].join("\n")
    assert.equal(commentWithDoubleHyphen(src), 4)
})
