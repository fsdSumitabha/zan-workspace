export default function ProjectCardSkeleton() {
    const block = "bg-slate-200 dark:bg-neutral-700 rounded"

    return (
        <div className="my-4 p-4 rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm animate-pulse">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    {/* client name */}
                    <div className={`h-4 w-40 ${block}`} />
                    {/* company */}
                    <div className={`h-3 w-28 ${block}`} />
                    {/* project title */}
                    <div className={`h-3 w-52 ${block} mt-1`} />
                </div>
                {/* status badge */}
                <div className={`h-5 w-24 ${block} rounded-full`} />
            </div>

            {/* Description */}
            <div className="mt-3">
                <div className={`h-3 w-full ${block}`} />
            </div>

            {/* Meta Info: budget • timeago */}
            <div className="mt-3 flex gap-2 items-center">
                <div className={`h-3 w-20 ${block}`} />
                <div className={`h-3 w-3 ${block} rounded-full`} />
                <div className={`h-3 w-24 ${block}`} />
            </div>

            {/* Service badge */}
            <div className="mt-3">
                <div className={`h-5 w-32 ${block} rounded-full`} />
            </div>
        </div>
    )
}
