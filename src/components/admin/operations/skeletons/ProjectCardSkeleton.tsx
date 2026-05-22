export default function ProjectCardSkeleton() {
    return (
        <div className="my-4 p-4 rounded-lg dark:rounded-xl border border-neutral-700 bg-slate-100 dark:bg-neutral-950 animate-pulse">

            {/* Header */}
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    {/* Client Name */}
                    <div className="h-4 w-40 bg-neutral-700 rounded" />

                    {/* Company */}
                    <div className="h-3 w-28 bg-neutral-800 rounded" />

                    {/* Project Title */}
                    <div className="h-3 w-52 bg-neutral-700 rounded mt-1" />
                </div>

                {/* Status Badge */}
                <div className="h-5 w-24 bg-neutral-700 rounded-full" />
            </div>

            {/* Description */}
            <div className="mt-3 space-y-2">
                <div className="h-3 w-full bg-neutral-800 rounded" />
            </div>

            {/* Meta Info */}
            <div className="mt-3 flex gap-2 items-center">
                <div className="h-3 w-20 bg-neutral-700 rounded" />
                <div className="h-3 w-3 bg-neutral-800 rounded-full" />
                <div className="h-3 w-24 bg-neutral-900 rounded" />
            </div>

            {/* Service */}
            <div className="flex gap-2 mt-3">
                <div className="h-5 w-32 bg-neutral-700 rounded-full" />
            </div>

            {/* Interaction */}
            <div className="mt-4 p-3 rounded-lg border border-neutral-800 space-y-2">
                <div className="h-3 w-36 bg-neutral-700 rounded" />
                <div className="h-3 w-28 bg-neutral-800 rounded" />
                <div className="h-3 w-20 bg-neutral-900 rounded" />
            </div>
        </div>
    )
}