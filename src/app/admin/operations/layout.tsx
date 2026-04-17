// app/admin/operations/layout.tsx

import Sidebar from "@/components/admin/operations/SideBar"

export default function OperationsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex h-screen bg-slate-50 dark:bg-neutral-950 text-white">
            {/* Sidebar */}
            <div className="hidden md:block">
                <Sidebar />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="h-14 border-b border-neutral-800 text-neutral-800 dark:text-neutral-300 flex items-center px-4">
                    ZAN Operations
                </div>

                {/* Page Content */}
                <div className="flex-1 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    )
}