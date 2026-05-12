"use client"

import { useRouter } from "next/navigation"
import { ShieldAlert } from "lucide-react"

export default function UnauthorizedPage() {
    const router = useRouter()

    return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-50 dark:bg-neutral-950">
            <div className="w-full max-w-md">

                {/* Header */}
                <div className="mb-6 text-center">
                    <div className="flex justify-center mb-3">
                        <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/20">
                            <ShieldAlert className="w-6 h-6 text-red-600" />
                        </div>
                    </div>

                    <h1 className="text-xl font-semibold">
                        Access Denied
                    </h1>

                    <p className="text-sm text-neutral-500 mt-1">
                        You are not authorized to view this page.
                    </p>
                </div>

                {/* Card */}
                <div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">

                    <div className="text-sm text-neutral-600 dark:text-neutral-400 text-center space-y-3">

                        <p>
                            This area is restricted to authorized users only.
                        </p>

                        <p>
                            If you believe this is a mistake, please contact the administrator.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="mt-6 space-y-3">

                        <button
                            onClick={() => router.push("/")}
                            className="w-full py-2 rounded-md bg-neutral-800 text-white text-sm hover:bg-neutral-700 transition"
                        >
                            Go to Home
                        </button>

                        <button
                            onClick={() => router.push("/admin/operations")}
                            className="w-full py-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                        >
                            Back to Admin
                        </button>

                    </div>
                </div>
            </div>
        </div>
    )
}