import { LEAD_SOURCE_COLUMNS } from "@/config/leadSourceSheet"
import { isDayString } from "@/lib/lead-sources/day"

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function showDay(value: string): string {
    if (!isDayString(value)) return value
    const [y, m, d] = value.split("-").map(Number)
    return `${d} ${MONTH[m - 1]} ${y}`
}

/** "website_url" becomes "Website url". For columns that are not in the config. */
function humanize(key: string): string {
    const text = key.replace(/_/g, " ").trim()
    return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Every value the sheet row held, with the labels from leadSourceSheet.ts,
 * in the same order. Columns the config does not know come last, under a
 * name made from their header. Empty cells are left out.
 */
export default function SheetData({ data }: { data: Record<string, string> }) {
    const known = new Set(LEAD_SOURCE_COLUMNS.map((c) => c.key))

    const entries = [
        ...LEAD_SOURCE_COLUMNS.filter((c) => data[c.key]).map((c) => ({
            label: c.label,
            value: c.kind === "date" ? showDay(data[c.key]) : data[c.key],
            extra: false,
        })),
        ...Object.entries(data)
            .filter(([key, value]) => !known.has(key) && value)
            .map(([key, value]) => ({ label: humanize(key), value, extra: true })),
    ]

    if (entries.length === 0) {
        return <p className="text-sm text-neutral-500">The sheet row had no other values.</p>
    }

    return (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {entries.map((e) => (
                <div key={e.label} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        {e.label}
                        {e.extra && <span className="ml-1 normal-case tracking-normal text-neutral-400">(extra column)</span>}
                    </dt>
                    <dd className="mt-0.5 break-words text-sm text-neutral-900 dark:text-neutral-100">{e.value}</dd>
                </div>
            ))}
        </dl>
    )
}
