export default function LeadCardSkeleton() {
    const block = "bg-slate-200 dark:bg-neutral-700 rounded"

    return (
        <div className="my-4 p-4 rounded-lg dark:rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm animate-pulse">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    {/* name */}
                    <div className={`h-4 w-32 ${block}`} />
                    {/* company */}
                    <div className={`h-3 w-24 ${block}`} />
                </div>
                {/* status badge */}
                <div className={`h-5 w-20 ${block} rounded-full`} />
            </div>

            {/* Contact Info */}
            <div className="mt-3 space-y-2">
                {/* phone */}
                <div className={`h-3 w-28 ${block}`} />
                {/* email */}
                <div className={`h-3 w-36 ${block}`} />
                {/* source • time */}
                <div className={`h-3 w-40 ${block}`} />
            </div>
        </div>
    )
}
