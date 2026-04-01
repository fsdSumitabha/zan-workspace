export const ActionTypeSkeleton = () => {

    const buttons = ["w-16", "w-20", "w-24", "w-28", "w-32", "w-20"]

    return (
        <div className="flex flex-wrap gap-4 p-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-neutral-900 animate-pulse">

            {buttons.map((w, i) => (
                <div
                    key={i}
                    className={`h-8 ${w} rounded-md bg-gray-200 dark:bg-neutral-700`}
                />
            ))}

        </div>
    )
}