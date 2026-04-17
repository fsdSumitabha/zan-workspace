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
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="h-14 border border-b border-neutral-800 grid grid-cols-12 px-4 px-4 items-center">
                    <div className="col-span-8 flex items-center">
                        <SearchBar />
                    </div>
                    <div className="col-span-4 ">
                        
                    </div>
                </div>

                {/* Page Content */}
                <div className="flex-1 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    )
}