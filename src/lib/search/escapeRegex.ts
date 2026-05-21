/**
 * Escape user input before composing a Mongo `$regex` so characters like
 * `.`, `*`, `(`, `?`, etc. are treated as literals instead of regex
 * metacharacters. Prevents both accidental no-matches and ReDoS-style
 * crafted patterns.
 *
 *   escapeRegex("a.b")  // "a\\.b"
 *   escapeRegex("(x)")  // "\\(x\\)"
 */
export function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
