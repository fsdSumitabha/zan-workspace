export default function ProjectDetailSkeleton() {
    return (
        <div className="p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-6 animate-pulse">

            {/* ================= HEADER ================= */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="h-6 w-40 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                    <div className="h-4 w-56 bg-gray-200 dark:bg-neutral-700 rounded mt-2"></div>
                </div>
                <div className="h-6 w-20 bg-gray-200 dark:bg-neutral-700 rounded"></div>
            </div>

            {/* ================= META ================= */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="h-6 w-24 bg-gray-200 dark:bg-neutral-700 rounded"></div>
            </div>

            {/* ================= DESCRIPTION ================= */}
            <div>
                <div className="h-4 w-28 bg-gray-200 dark:bg-neutral-700 rounded mb-2"></div>
                <div className="h-16 w-full bg-gray-200 dark:bg-neutral-700 rounded"></div>
            </div>

            {/* ================= BUDGET ================= */}
            <div>
                <div className="h-4 w-32 bg-gray-200 dark:bg-neutral-700 rounded mb-2"></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                        <div className="h-3 w-16 bg-gray-200 dark:bg-neutral-700 rounded mb-2"></div>
                        <div className="h-5 w-24 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                        <div className="h-3 w-16 bg-gray-200 dark:bg-neutral-700 rounded mb-2"></div>
                        <div className="h-5 w-24 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                        <div className="h-3 w-16 bg-gray-200 dark:bg-neutral-700 rounded mb-2"></div>
                        <div className="h-5 w-24 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                    </div>
                </div>
            </div>

            {/* ================= TIMELINE ================= */}
            <div>
                <div className="h-4 w-24 bg-gray-200 dark:bg-neutral-700 rounded mb-2"></div>
                <div className="flex flex-col gap-2">
                    <div className="h-4 w-40 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                    <div className="h-4 w-48 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                </div>
            </div>

            {/* ================= PLACEHOLDER SECTIONS ================= */}
            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4 space-y-3">
                <div className="h-4 w-40 bg-gray-200 dark:bg-neutral-700 rounded"></div>
                <div className="grid sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-dashed border-neutral-300 dark:border-neutral-700">
                        <div className="h-4 w-20 bg-gray-200 dark:bg-neutral-700 rounded mx-auto"></div>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-dashed border-neutral-300 dark:border-neutral-700">
                        <div className="h-4 w-24 bg-gray-200 dark:bg-neutral-700 rounded mx-auto"></div>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-dashed border-neutral-300 dark:border-neutral-700">
                        <div className="h-4 w-28 bg-gray-200 dark:bg-neutral-700 rounded mx-auto"></div>
                    </div>
                </div>
            </div>
        </div>
    )
}