import type { Schema, Query, Aggregate, PipelineStage } from "mongoose"

/**
 * Hides soft-deleted rows (`deletedAt` set) from every read on a schema.
 *
 * ## Why not a single `pre(/^find/)` hook
 *
 * That was the old setup, one hook per model. The regex matches `find`,
 * `findOne` and the `findOneAnd*` family. It does not match
 * `countDocuments`, `distinct` or `aggregate`.
 *
 * So a list route returned only live rows, but its total counted deleted
 * rows too. With 7 deleted leads, a list said "27 leads found" over 20 rows,
 * and the last page was empty. regionScopePlugin had the same gap and closes
 * it the same way.
 *
 * ## What it does not reach
 *
 * `Model.collection.*` skips Mongoose completely. That is how
 * src/lib/leads/findLeadByPhone.ts still sees deleted leads, on purpose.
 */

const appliedSchemas = new WeakSet<Schema>()

export function softDeletePlugin(schema: Schema): void {
    if (appliedSchemas.has(schema)) return
    appliedSchemas.add(schema)

    const queryHooks = [/^find/, "countDocuments", "distinct"] as const

    for (const hook of queryHooks) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema.pre(hook as any, function (this: Query<unknown, unknown>) {
            this.where({ deletedAt: null })
        })
    }

    schema.pre("aggregate", function (this: Aggregate<unknown[]>) {
        this.pipeline().unshift({ $match: { deletedAt: null } } as PipelineStage)
    })
}
