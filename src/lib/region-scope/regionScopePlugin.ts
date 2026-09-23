import mongoose from "mongoose"
import type { Schema, Query, Aggregate, PipelineStage, Types } from "mongoose"
import { getRegionContext } from "./regionContext"
import { AuthError } from "@/lib/auth/AuthError"

/**
 * Adds the region filter to every query on a schema, and stamps the region
 * on every new record.
 *
 * ## Why not a single `pre(/^find/)` hook
 *
 * That regex matches `find`, `findOne`, `findOneAndUpdate`,
 * `findOneAndDelete` and `findOneAndReplace`. It does not match
 * `countDocuments`, `distinct`, `aggregate`, `updateMany`, `updateOne`,
 * `deleteMany` or `deleteOne`.
 *
 * The gap matters. Every paginated list route calls `countDocuments` for its
 * total. Without the hook a user would see 8 rows and a total of 358, and
 * every page after the first would be empty.
 *
 * So this plugin registers all of them.
 *
 * ## What it does not reach
 *
 * `Model.collection.*` skips Mongoose completely. Two call sites use the raw
 * driver on purpose, and both are commented where they are:
 *   - src/lib/leads/findLeadByPhone.ts
 *   - src/app/api/public/booking/route.ts
 * Both guard the global unique index on `Lead.phone`, so both must stay
 * unfiltered.
 */

export interface RegionScopeOptions {
    /**
     * "region" for a record that belongs to one region.
     * "regions" for User, which holds an array. Mongo's `$in` matches an array
     * field when any element matches, so the same filter shape works for both.
     */
    field?: string

    /** Stamps the region on create. Off for `regions` array fields. */
    stampOnCreate?: boolean

    /**
     * Where a new record inherits its region from.
     *
     * A child record belongs to the region of its parent, not to the region
     * of whoever typed it. An admin holds every region, so there is nothing
     * useful to copy from the admin. The parent is the only correct source.
     *
     * Return null when there is no parent to read.
     */
    inheritFrom?: (doc: Record<string, unknown>) => ParentRef | null
}

export interface ParentRef {
    /** Registered Mongoose model name, e.g. "Lead". */
    model: string
    id: Types.ObjectId | string
}

/** ENTITY_TYPE codes 0/1/2, kept local so models do not import each other. */
const ENTITY_MODEL: Record<number, string> = {
    0: "Lead",
    1: "Client",
    2: "Project",
}

/**
 * For Interaction, Meeting, Call and Quotation. They all carry
 * `entityType` + `entityId` pointing at a Lead, Client or Project.
 */
export function inheritFromEntity(
    doc: Record<string, unknown>
): ParentRef | null {
    const type = doc.entityType as number | undefined
    const id = doc.entityId as Types.ObjectId | undefined
    if (type === undefined || !id) return null

    const model = ENTITY_MODEL[type]
    return model ? { model, id } : null
}

/**
 * The filter for the current request, or `null` when no filter should apply.
 *
 * With no region context this returns a filter that matches nothing.
 * That is on purpose. An empty list is a bug somebody reports within an hour.
 * A leak is a bug nobody reports.
 */
export function regionFilter(field = "region"): Record<string, unknown> | null {
    const ctx = getRegionContext()

    if (ctx?.bypass) return null

    const regions = ctx?.regions
    if (!regions || regions.length === 0) {
        return { [field]: { $in: [] } }
    }

    return { [field]: { $in: regions } }
}

/** Reads one parent's region straight from the driver, past every hook. */
async function readParentRegion(ref: ParentRef): Promise<string | null> {
    const model = mongoose.models[ref.model]
    if (!model) return null

    const id =
        typeof ref.id === "string"
            ? new mongoose.Types.ObjectId(ref.id)
            : ref.id

    const row = await model.collection.findOne(
        { _id: id },
        { projection: { region: 1 } }
    )

    return (row?.region as string | undefined) ?? null
}

// Next.js hot reload can re-run a model file and re-apply the plugin to the
// same schema. Registering the hooks twice is not harmful, but it is noise.
const appliedSchemas = new WeakSet<Schema>()

export function regionScopePlugin(
    schema: Schema,
    options: RegionScopeOptions = {}
): void {
    if (appliedSchemas.has(schema)) return
    appliedSchemas.add(schema)

    const field = options.field ?? "region"
    const stampOnCreate = options.stampOnCreate ?? field === "region"
    const inheritFrom = options.inheritFrom

    // Reads, plus the writes that carry their own filter.
    const queryHooks = [
        /^find/,
        "countDocuments",
        "distinct",
        "updateOne",
        "updateMany",
        "deleteOne",
        "deleteMany",
        "replaceOne",
    ] as const

    for (const hook of queryHooks) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema.pre(hook as any, function (this: Query<unknown, unknown>) {
            const filter = regionFilter(field)
            if (filter) this.where(filter)
        })
    }

    schema.pre("aggregate", function (this: Aggregate<unknown[]>) {
        const filter = regionFilter(field)
        if (filter) {
            this.pipeline().unshift({ $match: filter } as PipelineStage)
        }
    })

    if (!stampOnCreate) return

    /**
     * Order of precedence on create:
     *
     *   1. A region already set by the route. The route knows best.
     *   2. The parent record's region. A call logged on an IN lead is an IN
     *      call, whoever typed it.
     *   3. The signed-in user's write region, when they hold exactly one.
     *
     * If none of those produce a value, the save fails. An unstamped record
     * would match no region filter, so nobody, not even an admin, would ever
     * see it again. A loud error now beats a row that silently disappears.
     *
     * ## Two checks after that
     *
     * The parent is read with the raw driver, past the region filter. So
     * nothing above checks that the caller may see it. Without a check, a
     * user who holds IN only could post a note, call, meeting or project
     * against a US record id, and it would be saved in US. The author could
     * not read it back, and the US team would see it.
     *
     *   1. The caller must be able to read the parent. If not, the answer is
     *      404, the same answer a route gives when it loads a record the
     *      caller cannot see. It does not confirm that the record exists.
     *   2. The new record must land in a region the caller can read, however
     *      its region was set. This also stops a route that copies the
     *      request body from saving a region the caller does not hold.
     *
     * Both run only when the request has a region scope. Scripts either
     * bypass or run with no context, and are not checked.
     */
    schema.pre("validate", async function (this: RegionDoc) {
        if (!this.isNew) return

        const ctx = getRegionContext()
        if (ctx?.bypass) return

        const allowed: readonly string[] | undefined = ctx?.regions

        let parentRegion: string | null = null
        if (inheritFrom) {
            const ref = inheritFrom(this.toObject() as Record<string, unknown>)
            if (ref) {
                parentRegion = await readParentRegion(ref)
                if (parentRegion && allowed && !allowed.includes(parentRegion)) {
                    throw new AuthError(`${ref.model} not found`, 404)
                }
            }
        }

        if (!this.get(field)) {
            const region = parentRegion ?? ctx?.writeRegion
            if (!region) {
                throw new Error(
                    `Cannot save this record without a region. The signed-in user ` +
                    `holds ${ctx?.regions?.length ?? 0} region(s), so there is no ` +
                    `single region to stamp, and no parent record to copy one from. ` +
                    `The route has to set "${field}" itself.`
                )
            }
            this.set(field, region)
        }

        const region = this.get(field) as string
        if (allowed && !allowed.includes(region)) {
            throw new AuthError(
                `You do not have access to the ${region} region.`,
                403
            )
        }
    })

    schema.pre("insertMany", function (next, docs: unknown) {
        const ctx = getRegionContext()
        if (ctx?.bypass || !ctx?.writeRegion) return next()

        if (Array.isArray(docs)) {
            for (const doc of docs) {
                const row = doc as Record<string, unknown>
                if (!row[field]) row[field] = ctx.writeRegion
            }
        }
        next()
    })
}

interface RegionDoc {
    isNew: boolean
    get(path: string): unknown
    set(path: string, value: unknown): void
    toObject(): unknown
}
