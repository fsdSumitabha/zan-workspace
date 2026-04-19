"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image";

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

    return (
        <aside className="w-64 bg-gray-50 h-full dark:bg-neutral-950 text-gray-900 dark:text-white border-r-4 border-neutral-800 flex flex-col">
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
            <div className="p-3 border-t border-neutral-800 text-sm text-gray-500 dark:text-neutral-400">
                Logged in as
                <div className="text-gray-900 dark:text-white font-medium">
                    Admin
                </div>
            </div>
        </aside>
    )
}