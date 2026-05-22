import Link from "next/link"
import { ShieldAlert } from "lucide-react"

interface Props {
    /** Message from the API (falls back to a generic line). */
    message?: string
    /** Hide the "Back to Dashboard" link, e.g. when already on the dashboard. */
    hideAction?: boolean
}

/**
 * Professional 403 / unauthorized state for list and detail pages.
 * Render this in place of page content when an API responds 403.
 */
export default function AccessDenied({ message, hideAction }: Props) {
    return (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl  border-gray-600 bg-white dark:bg-neutral-950">
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center mb-4">
                <ShieldAlert className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            </div>

            <h2 className="text-lg font-semibold text-neutral-900 dark:text-orange-800">
                Access Denied
            </h2>

            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 max-w-sm">
                {message || "You aren't authorized to perform this action."}
            </p>

            {/* {!hideAction && (
                <Link
                    href="/admin/operations"
                    className="mt-5 inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition"
                >
                    Back to Dashboard
                </Link>
            )} */}
        </div>
    )
}
