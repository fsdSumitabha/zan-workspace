export default function EntityCardSkeleton() {
    const block = "bg-slate-200 dark:bg-neutral-700 rounded"

    return (
        <div className="flex gap-3 p-4 rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm animate-pulse">
            {/* Left icon */}
            <div className="mt-1">
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-neutral-800" />
            </div>

            {/* Content */}
            <div className="flex-1 space-y-3">
                {/* Header */}
                <div className="space-y-2">
                    {/* name / title */}
                    <div className={`h-5 w-48 ${block}`} />
                    {/* company / sub-title */}
                    <div className={`h-3 w-32 ${block}`} />
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    <div className={`h-3 w-24 ${block}`} />
                    <div className={`h-3 w-36 ${block}`} />
                    <div className={`h-3 w-16 ${block}`} />
                    <div className={`h-3 w-20 ${block}`} />
                </div>

                {/* Description */}
                <div className={`h-3 w-full ${block}`} />

                {/* Interaction footer */}
                <div className="pt-2">
                    <div className={`h-12 w-full ${block}`} />
                </div>
            </div>
        </div>
    )
}
