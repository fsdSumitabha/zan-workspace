// app/admin/operations/layout.tsx

import Sidebar from "@/components/admin/operations/SideBar"
import SearchBar from "@/components/admin/operations/SearchBar"
import StatsPanel from "@/components/admin/operations/StatsPanel"

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
                {/* Header */}
                <div className="h-14 border border-b border-neutral-800 grid grid-cols-12 px-4 px-4 items-center">
                    <div className="col-span-12 md:col-span-8 flex items-center">
                        <SearchBar />
                    </div>
                    <div className="hidden md:col-span-4 ">
                        
                    </div>
                </div>

                {/* Page Content */}
                <div className="flex-1 overflow-y-auto max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6 w-full">
                    <div className="lg:col-span-2 space-y-4">
                        {children}
                    </div>
                    <StatsPanel />
                </div>
            </div>
        </div>
    )
}