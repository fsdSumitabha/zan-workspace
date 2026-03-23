export default function LeadDetailsSkeleton() {
    return (
        <div className="p-5 rounded-xl border bg-white dark:bg-neutral-900 space-y-4 animate-pulse">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="h-5 w-32 bg-gray-200 dark:bg-neutral-700 rounded mb-2"></div>
                    <div className="h-4 w-24 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                </div>

                <div className="h-6 w-20 bg-gray-200 dark:bg-neutral-700 rounded"></div>
            </div>

            {/* Contact Info */}
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                    <div className="h-4 w-16 bg-gray-200 dark:bg-neutral-700 rounded mb-1"></div>
                    <div className="h-4 w-28 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                </div>

                <div>
                    <div className="h-4 w-16 bg-gray-200 dark:bg-neutral-700 rounded mb-1"></div>
                    <div className="h-4 w-36 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                </div>
            </div>

            {/* Meta Info */}
            <div className="h-3 w-40 bg-gray-200 dark:bg-neutral-700 rounded"></div>
        </div>
    )
}