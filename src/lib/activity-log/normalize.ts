import mongoose from "mongoose"

export function toAuditPlain(
    value: unknown
): Record<string, unknown> | null {
    if (value == null) return null

    if (value instanceof mongoose.Document) {
        return toAuditPlain(value.toObject())
    }

    if (typeof value !== "object") {
        return null
    }

    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}

    for (const [key, val] of Object.entries(obj)) {
        if (key === "__v") continue
        out[key] = serializeAuditValue(val)
    }

    return out
}

function serializeAuditValue(value: unknown): unknown {
    if (value == null) return value

    if (value instanceof mongoose.Types.ObjectId) {
        return value.toString()
    }

    if (value instanceof Date) {
        return value.toISOString()
    }

    if (Array.isArray(value)) {
        return value.map(serializeAuditValue)
    }

    if (value instanceof mongoose.Document) {
        return serializeAuditValue(value.toObject())
    }

    if (typeof value === "object") {
        const nested: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            nested[k] = serializeAuditValue(v)
        }
        return nested
    }

    return value
}

function normalizeForCompare(value: unknown): unknown {
    if (value === undefined || value === null) return null
    return serializeAuditValue(value)
}

export function valuesEqual(a: unknown, b: unknown): boolean {
    return (
        JSON.stringify(normalizeForCompare(a)) ===
        JSON.stringify(normalizeForCompare(b))
    )
}
