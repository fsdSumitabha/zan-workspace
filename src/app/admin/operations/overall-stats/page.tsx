import OverallStatsPanel from "@/components/admin/operations/OverallStatsPanel"

export const metadata = {
    title: "Pipeline overview · Zan Services CRM",
}

export default function Page() {
    return (
        <div className="space-y-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                    Pipeline overview
                </h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Status distribution across leads, clients, projects and
                    meetings.
                </p>
            </header>

            <OverallStatsPanel />
        </div>
    )
}
