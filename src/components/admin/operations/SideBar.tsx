"use client"

import Link from "next/link"
import Image from "next/image";
import { User, LogOut } from "lucide-react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"

const navItems = [
    { name: "Dashboard", href: "/admin/operations" },
    { name: "Leads", href: "/admin/operations/leads" },
    { name: "Clients", href: "/admin/operations/clients" },
    { name: "Projects", href: "/admin/operations/projects" },
    { name: "Meetings", href: "/admin/operations/meetings" },
    // { name: "Activities", href: "/admin/operations/activities" },
]

export default function Sidebar() {
    const pathname = usePathname()
    const { user, loading, logout } = useAuth()

    return (
        <aside className="w-64 bg-gray-50 sticky top-0 h-screen dark:bg-neutral-950 text-gray-900 dark:text-white border-r-4 border-neutral-800 flex flex-col">
            {/* Logo */}
            <Link
                href="/admin/operations"
                className="h-14 flex items-center px-4 border-b border-neutral-800 font-semibold"
            >
                {/* Light Theme Logo */}
                <Image
                    src="/zan-services-color-logo.png"
                    alt="ZAN CRM Logo"
                    height={30}
                    width={90}
                    priority
                    className="block dark:hidden"
                />

                {/* Dark Theme Logo */}
                <Image
                    src="/zan-logo-white.png"
                    alt="ZAN CRM Logo"
                    height={30}
                    width={90}
                    priority
                    className="hidden dark:block"
                />
            </Link>

            {/* Nav */}
            <nav className="flex-1 p-2 space-y-1">
                {navItems.map((item) => {
                    const isActive =
                        item.href === "/admin/operations"
                            ? pathname === item.href
                            : pathname === item.href || pathname.startsWith(item.href + "/")

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`block px-3 py-2 rounded-lg text-sm transition-all duration-200 border-l-2
                                ${isActive
                                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
                                    : "border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-gray-900 dark:hover:text-white"
                                }`}
                        >
                            {item.name}
                        </Link>
                    )
                })}
            </nav>

            {/* Bottom User / Footer */}
            <div className="p-3 border-t border-neutral-800">
                {loading ? (
                    <div className="flex items-center gap-3 animate-pulse">
                        <div className="w-9 h-9 rounded-full bg-neutral-700" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 bg-neutral-700 rounded w-24" />
                            <div className="h-3 bg-neutral-700 rounded w-16" />
                        </div>
                    </div>
                ) : user ? (
                    <div className="flex items-center justify-between gap-2 group">
                        {/* Left: Avatar + Info */}
                        <div className="flex items-center gap-3 min-w-0">
                            {/* Avatar */}
                            <div className="w-9 h-9 flex items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                                <User size={18} />
                            </div>

                            {/* User Info */}
                            <div className="min-w-0">
                                <div className="text-xs text-neutral-400">
                                    Logged in as
                                </div>

                                <div className="text-sm font-medium text-white truncate">
                                    {user.name || user.email}
                                </div>
                            </div>
                        </div>

                        {/* Right: Logout */}
                        <button
                            onClick={logout}
                            className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                        >
                            <LogOut size={14} />
                            Logout
                        </button>
                    </div>
                ) : (
                    <div className="text-xs text-neutral-500">
                        Not logged in
                    </div>
                )}
            </div>
            <div className="py-6"></div>
        </aside>
    )
}