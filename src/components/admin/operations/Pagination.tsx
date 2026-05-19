"use client"

interface Props {
    page: number
    totalPages: number
    /** Disables both buttons (e.g. while a fetch is in flight). */
    disabled?: boolean
    onChange: (page: number) => void
}

export default function Pagination({
    page,
    totalPages,
    disabled,
    onChange,
}: Props) {
    return (
        <div className="flex justify-between items-center pt-4">
            <button
                type="button"
                disabled={page === 1 || disabled}
                onClick={() => onChange(page - 1)}
                className="px-3 py-1 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 disabled:opacity-50 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition"
            >
                Previous
            </button>

            <span className="text-sm text-neutral-500 dark:text-gray-400">
                Page {page} of {totalPages}
            </span>

            <button
                type="button"
                disabled={page === totalPages || disabled}
                onClick={() => onChange(page + 1)}
                className="px-3 py-1 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 disabled:opacity-50 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition"
            >
                Next
            </button>
        </div>
    )
}
