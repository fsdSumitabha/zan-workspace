import clsx from "clsx"
import { LEAD_SOURCE_STATUS_META, type LeadSourceStatus } from "@/constants/leadSourceStatus"

/** A lead source status as a small coloured label. Not clickable. */
export default function StatusPill({ status, className }: { status: number; className?: string }) {
    const meta = LEAD_SOURCE_STATUS_META[status as LeadSourceStatus]

    return (
        <span
            className={clsx(
                "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                meta?.color ?? "bg-gray-500 text-white",
                className
            )}
        >
            {meta?.label ?? "Unknown"}
        </span>
    )
}
