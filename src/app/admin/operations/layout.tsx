// app/admin/operations/layout.tsx

import Sidebar from "@/components/admin/operations/SideBar"
import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"
import OperationsMobileNav from "@/components/admin/operations/OperationsMobileNav"
import OperationsMobileTopBar from "@/components/admin/operations/OperationsMobileTopBar"

export default function OperationsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-neutral-950 text-white">
            {/* Sidebar */}
            <div className="hidden md:block">
                <Sidebar />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-x-hidden">
                {/* Mobile top bar (logo + profile) */}
                <OperationsMobileTopBar />
                {/* Spacer for fixed mobile top bar */}
                <div className="md:hidden h-14" />

                {/* Header (desktop + mobile search row) */}
                <div className="border-b border-neutral-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950">
                    <div className="h-14 md:h-14 grid grid-cols-12 px-3 md:px-4 items-center">
                        <div className="col-span-12 md:col-span-8 flex items-center">
                            <SearchBar />
                        </div>
                        <div className="hidden md:col-span-4" />
                    </div>
                </div>

                {/* Page Content */}
               <div className="flex-1 overflow-y-auto max-w-7xl mx-auto px-3 md:px-4 py-5 md:py-6 grid lg:grid-cols-3 gap-6 w-full">
                    <div className="lg:col-span-2 space-y-4">
                        {children}
                    </div>
                    <StatsPanel />
                </div>

                {/* Mobile bottom nav (twitter-like) */}
                <OperationsMobileNav />
            </div>
        </div>
    )
}