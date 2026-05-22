export default function LeadCardSkeleton() {
    return (
        <div className="p-4 rounded-lg dark:rounded-xl bg-slate-100 dark:bg-neutral-950 border border-neutral-600 animate-pulse">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-4 w-32 bg-neutral-700 rounded-md" />
                    <div className="h-3 w-24 bg-neutral-800 rounded-md" />
                </div>

                <div className="h-5 w-20 bg-neutral-700 rounded-md" />
            </div>

            {/* Contact Info */}
            <div className="mt-3 space-y-2">
                <div className="h-3 w-28 bg-neutral-800 rounded-md" />
                <div className="h-3 w-36 bg-neutral-800 rounded-md" />
                <div className="h-3 w-40 bg-neutral-900 rounded-md" />
            </div>

            {/* Service */}
            <div className="flex gap-2 mt-3">
                <div className="h-5 w-24 bg-neutral-700 rounded-md" />
            </div>

            {/* Interaction */}
            <div className="mt-3 p-3 rounded-lg bg-neutral-800 space-y-2">
                <div className="h-3 w-32 bg-neutral-700 rounded-md" />
                <div className="h-3 w-40 bg-neutral-900 rounded-md" />
                <div className="h-3 w-24 bg-neutral-700 rounded-md" />
            </div>
        </div>
    )
}