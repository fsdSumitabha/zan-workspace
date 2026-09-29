import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import UploadForm from "@/components/admin/operations/lead-sources/UploadForm"

export default function Page() {
    return (
        <div className="w-0 min-w-full space-y-3">
            <Link
                href="/admin/operations/lead-sources"
                className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
                <ArrowLeft className="h-4 w-4" />
                Lead sources
            </Link>
            <div>
                <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Upload a sheet</h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Every row is checked. Good rows become lead sources. You get a report of every row, and why any was skipped.
                </p>
            </div>
            <UploadForm />
        </div>
    )
}
