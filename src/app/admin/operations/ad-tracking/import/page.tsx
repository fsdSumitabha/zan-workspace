import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import ImportForm from "@/components/admin/operations/ad-tracking/ImportForm"

export default function Page() {
    return (
        <div className="w-0 min-w-full space-y-3">
            <Link
                href="/admin/operations/ad-tracking"
                className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
                <ArrowLeft className="h-4 w-4" />
                Ad tracking
            </Link>
            <div>
                <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Import leads</h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Every row is checked first. You see what will happen before anything is saved. Each campaign, ad set, ad and
                    form is saved once and reused by every later import.
                </p>
            </div>
            <ImportForm />
        </div>
    )
}
