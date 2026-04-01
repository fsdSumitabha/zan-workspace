export const InteractionItemSkeleton = () => {
    return (
        <div className="flex gap-3 p-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-neutral-900 animate-pulse">

            <div className="mt-1">
                <div className="w-8 h-8 rounded-lg bg-neutral-300 dark:bg-neutral-700" />
            </div>

            <div className="flex-1 space-y-3">

                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="h-4 w-32 bg-neutral-300 dark:bg-neutral-700 rounded" />
                        <div className="h-4 w-16 bg-neutral-300 dark:bg-neutral-700 rounded-full" />
                    </div>``

                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-neutral-300 dark:bg-neutral-700 rounded" />
                        <div className="h-3 w-20 bg-neutral-300 dark:bg-neutral-700 rounded" />
                    </div>
                </div>

                {/* Always show — stable */}
                <div className="h-3 w-3/4 bg-neutral-300 dark:bg-neutral-700 rounded" />

                <div className="space-y-2">
                    <div className="h-3 w-full bg-neutral-300 dark:bg-neutral-700 rounded" />
                    <div className="h-3 w-5/6 bg-neutral-300 dark:bg-neutral-700 rounded" />
                </div>

                <div className="mt-2 p-3 rounded-lg border border-gray-300 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                        <div className="space-y-2">
                            <div className="h-4 w-24 bg-neutral-300 dark:bg-neutral-700 rounded" />
                            <div className="h-3 w-32 bg-neutral-300 dark:bg-neutral-700 rounded" />
                        </div>
                        <div className="h-7 w-20 bg-neutral-300 dark:bg-neutral-700 rounded-md" />
                    </div>
                </div>

                <div className="flex justify-between items-center pt-1">
                    <div className="h-3 w-28 bg-neutral-300 dark:bg-neutral-700 rounded" />
                    <div className="h-7 w-24 bg-neutral-300 dark:bg-neutral-700 rounded-md" />
                </div>

            </div>
        </div>
    )
}