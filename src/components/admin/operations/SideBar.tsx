// components/admin/operations/SideBar.tsx

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
    { name: "Dashboard", href: "/admin/operations" },
    { name: "Leads", href: "/admin/operations/leads" },
    { name: "Clients", href: "/admin/operations/clients" },
    { name: "Projects", href: "/admin/operations/projects" },
    { name: "Meetings", href: "/admin/operations/meetings" },
    { name: "Activities", href: "/admin/operations/activities" },
]

export default function Sidebar() {
    const pathname = usePathname()

    return (
        <aside className="w-64 bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white border-r-4 border-neutral-800 flex flex-col">
            {/* Logo */}
            <div className="h-14 flex items-center px-4 border-b border-neutral-800 font-semibold">
                ZAN CRM
            </div>

            {/* Nav */}
            <nav className="flex-1 p-2 space-y-1">
                {navItems.map((item) => {
                    const isActive = pathname === item.href

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`block px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isActive
                                    ? "bg-neutral-800 text-white shadow-inner"
                                    : "text-neutral-400 hover:bg-neutral-800/70 hover:text-white"
                                }`}
                        >
                            {item.name}
                        </Link>
                    )
                })}
            </nav>

            {/* Bottom User / Footer */}
            <div className="p-3 border-t border-neutral-800 text-sm text-neutral-400">
                Logged in as
                <div className="text-white font-medium">
                    Admin
                </div>
            </div>
        </aside>
    )
}