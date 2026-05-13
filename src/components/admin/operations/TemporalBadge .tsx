export default function TemporalBadge({ status }: { status: string }) {
    const styles = {
        UPCOMING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
        TODAY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
        PAST: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
    }

    const labels = {
        UPCOMING: "Upcoming",
        TODAY: "Today",
        PAST: "Past"
    }

    return (
        <span className={`text-xs px-2 py-1 rounded-md ${styles[status as keyof typeof styles]}`}>
            {labels[status as keyof typeof labels]}
        </span>
    )
}