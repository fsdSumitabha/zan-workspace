"use client"

import Link from "next/link"
import { Image } from "@imagekit/next"
import {
    User,
    LogOut,
    Home,
    Target,
    Handshake,
    FolderKanban,
    CalendarClock,
    UserRoundCog,
    Activity,
} from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"

const navItems = [
    { name: "Dashboard", href: "/admin/operations", icon: Home, roles: [10, 20, 30, 40, 50, 60, 70, 80] },
    { name: "Leads", href: "/admin/operations/leads", icon: Target, roles: [10, 20, 30, 40, 50, 60, 70, 80] },
    { name: "Clients", href: "/admin/operations/clients", icon: Handshake, roles: [10, 20, 30, 40, 50, 60, 70, 80] },
    { name: "Projects", href: "/admin/operations/projects", icon: FolderKanban, roles: [10, 20, 30, 40, 50, 60, 70, 80] },
    { name: "Meetings", href: "/admin/operations/meetings", icon: CalendarClock, roles: [10, 20, 30, 40, 50, 60, 70, 80] },
    { name: "Users", href: "/admin/operations/users", icon: UserRoundCog, roles: [10, 20] },
    { name: "Activity Log", href: "/admin/operations/activity-logs", icon: Activity, roles: [10, 20] },
]

export default function Sidebar() {
    const pathname = usePathname()
    const { user, loading, logout } = useAuth()
    const [avatarBroken, setAvatarBroken] = useState(false)

    const avatarUrl = user?.avatar?.trim() || ""
    const showAvatarImage = Boolean(avatarUrl) && !avatarBroken

    useEffect(() => {
        setAvatarBroken(false)
    }, [avatarUrl])

    if (loading) return null
    if (!user) return null

    const filteredNavItems = navItems.filter(item =>
        item.roles.includes(user.role)
    )

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
                {filteredNavItems.map((item) => {
                    const Icon = item.icon
                    const isActive =
                        item.href === "/admin/operations"
                            ? pathname === item.href
                            : pathname === item.href || pathname.startsWith(item.href + "/")

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 border-l-2
                                ${isActive
                                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
                                    : "border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-gray-900 dark:hover:text-white"
                                }`}
                        >
                            <Icon
                                size={18}
                                className={`shrink-0 transition-colors ${isActive
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200"
                                    }`}
                            />
                            <span className="truncate">{item.name}</span>
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
                        <Link
                            href="/admin/operations/profile"
                            className={`flex items-center gap-3 min-w-0 flex-1 rounded-lg px-1 py-1 -mx-1 transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${pathname === "/admin/operations/profile" ||
                                    pathname.startsWith("/admin/operations/profile/")
                                    ? "bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-500/30"
                                    : "hover:bg-gray-200/80 dark:hover:bg-neutral-800/80"
                                }`}
                        >
                            <div className="w-9 h-9 shrink-0 rounded-full bg-emerald-500/10 text-emerald-400 overflow-hidden flex items-center justify-center border border-emerald-500/20">
                                {showAvatarImage ? (
                                    <Image
                                        src={avatarUrl}
                                        alt=""
                                        width={36}
                                        height={36}
                                        transformation={[
                                            {
                                                width: 72,       // 2x for retina
                                                height: 72,
                                            }
                                        ]}
                                        className="h-full w-full object-cover"
                                        onError={() => setAvatarBroken(true)}
                                    />
                                ) : (
                                    <User size={18} />
                                )}
                            </div>

                            <div className="min-w-0 text-left">
                                <div className="text-xs text-neutral-400">
                                    Profile
                                </div>

                                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {user.name || user.email}
                                </div>
                            </div>
                        </Link>

                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                logout()
                            }}
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