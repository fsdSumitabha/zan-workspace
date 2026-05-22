export default function UserCardSkeleton() {
    return (
        <div className="rounded-lg dark:rounded-xl p-4 border bg-white border-gray-200 dark:bg-neutral-900 dark:border-neutral-800 animate-pulse " >
            {/* Top Section */}
            <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-neutral-700" />

                {/* Name + Email */}
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-gray-200 rounded dark:bg-neutral-700" />
                    <div className="h-3 w-48 bg-gray-200 rounded dark:bg-neutral-800" />
                </div>

                {/* Status */}
                <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-neutral-700" />
            </div>

            {/* Divider */}
            <div className="my-4 border-t border-gray-200 dark:border-neutral-800" />

            {/* Role + Joined */}
            <div className="flex items-center justify-between text-sm">
                <div className="space-y-2">
                    <div className="h-3 w-20 bg-gray-200 rounded dark:bg-neutral-700" />
                </div>

                <div className="space-y-2 text-right">
                    <div className="h-3 w-16 bg-gray-200 rounded dark:bg-neutral-700" />
                    <div className="h-3 w-20 bg-gray-200 rounded dark:bg-neutral-800" />
                </div>
            </div>

            {/* Footer */}
            <div className="mt-3 flex justify-between items-center">
                <div className="h-3 w-40 bg-gray-200 rounded dark:bg-neutral-800" />

                <div className="h-3 w-16 bg-gray-200 rounded dark:bg-neutral-700" />
            </div>
        </div>
    )
}