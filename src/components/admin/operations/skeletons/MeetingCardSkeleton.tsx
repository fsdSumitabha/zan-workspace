export default function MeetingCardSkeleton() {
    const block = "bg-slate-200 dark:bg-neutral-700 rounded"

    return (
        <div className="flex gap-3 p-4 rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm animate-pulse">
            {/* Left icon */}
            <div className="mt-1">
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-neutral-800" />
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2">
                {/* Header: title + status + temporal */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className={`h-4 w-44 ${block}`} />
                        <div className={`h-5 w-24 ${block} rounded-full`} />
                        <div className={`h-5 w-16 ${block} rounded-full`} />
                    </div>
                    <div className={`h-3 w-20 ${block}`} />
                </div>

                {/* Entity link */}
                <div className={`h-3 w-32 ${block}`} />

                {/* Agenda */}
                <div className={`h-3 w-full ${block}`} />

                {/* Description */}
                <div className={`h-3 w-3/4 ${block}`} />

                {/* Meta row */}
                <div className="flex items-center justify-between pt-1">
                    <div className={`h-3 w-28 ${block}`} />
                    <div className={`h-6 w-20 ${block} rounded-md`} />
                </div>
            </div>
        </div>
    )
}
