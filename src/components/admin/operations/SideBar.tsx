"use client"

import Link from "next/link"
import { Image } from "@imagekit/next"
import RegionSwitcher from "@/components/admin/operations/region/RegionSwitcher"
import { User, LogOut, Home, Target, Handshake, FolderKanban, CalendarClock, UserRoundCog, Activity, BarChart3, PhoneCall, Mails, ChevronDown } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { LEAD_SOURCE_ACCESS_ROLES } from "@/constants/leadSourceRoles"
import { EMAIL_ACCESS_ROLES, EMAIL_ADMIN_ROLES } from "@/constants/emailRoles"

/**
 * One sidebar entry.
 *
 * `children` is optional. An item without it renders exactly as every item
 * did before email marketing existed, through the same code path. That is
 * deliberate: this file is on every page, so the change had to be additive.
 */
interface NavItem {
    name: string
    href: string
    icon: React.ComponentType<{ size?: number | string; className?: string }>
    roles: readonly number[]
    children?: Array<{
        name: string
        href: string
        roles: readonly number[]
        /**
         * The page is planned but not built yet. It shows greyed out and
         * does not link anywhere, which is better than a 404 that looks
         * like a bug. Remove the flag as each milestone lands.
         */
        soon?: boolean
    }>
}

const navItems: NavItem[] = [
    { name: "Dashboard", href: "/admin/operations", icon: Home, roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 65, 69, 70, 80] },
    { name: "Leads", href: "/admin/operations/leads", icon: Target, roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 65, 69, 70, 80] },
    { name: "Lead Sources", href: "/admin/operations/lead-sources", icon: PhoneCall, roles: LEAD_SOURCE_ACCESS_ROLES },
    { name: "Clients", href: "/admin/operations/clients", icon: Handshake, roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 69, 70, 80] },
    { name: "Projects", href: "/admin/operations/projects", icon: FolderKanban, roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 70, 80] },
    { name: "Meetings", href: "/admin/operations/meetings", icon: CalendarClock, roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 65, 69, 70, 80] },
    {
        // "Create campaign" is not in this list on purpose. It is a button on
        // the Overview and Campaigns screens. A nav entry that is really a
        // button makes the sidebar longer than the screen.
        name: "Email Marketing",
        href: "/admin/operations/email",
        icon: Mails,
        roles: EMAIL_ACCESS_ROLES,
        children: [
            { name: "Overview", href: "/admin/operations/email", roles: EMAIL_ACCESS_ROLES },
            { name: "Campaigns", href: "/admin/operations/email/campaigns", roles: EMAIL_ACCESS_ROLES, soon: true },
            { name: "Templates", href: "/admin/operations/email/templates", roles: EMAIL_ACCESS_ROLES },
            { name: "Audiences", href: "/admin/operations/email/audiences", roles: EMAIL_ACCESS_ROLES, soon: true },
            { name: "Contacts", href: "/admin/operations/email/contacts", roles: EMAIL_ACCESS_ROLES, soon: true },
            { name: "Assets", href: "/admin/operations/email/assets", roles: EMAIL_ACCESS_ROLES, soon: true },
            { name: "Reports", href: "/admin/operations/email/reports", roles: EMAIL_ACCESS_ROLES, soon: true },
            { name: "Delivery Activity", href: "/admin/operations/email/activity", roles: EMAIL_ACCESS_ROLES, soon: true },
            { name: "Suppression", href: "/admin/operations/email/suppression", roles: EMAIL_ACCESS_ROLES, soon: true },
            { name: "Settings", href: "/admin/operations/email/settings", roles: EMAIL_ADMIN_ROLES },
        ],
    },
    { name: "Overall Stats", href: "/admin/operations/overall-stats", icon: BarChart3, roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 70, 80] },
    { name: "Users", href: "/admin/operations/users", icon: UserRoundCog, roles: [10, 20, 45, 69] },
    { name: "Activity Log", href: "/admin/operations/activity-logs", icon: Activity, roles: [10, 20] },
]

/** True when this path is the one showing, or sits under it. */
function isActivePath(pathname: string, href: string): boolean {
    if (href === "/admin/operations") return pathname === href
    return pathname === href || pathname.startsWith(href + "/")
}

export default function Sidebar() {
    const pathname = usePathname()
    const { user, loading, logout } = useAuth()
    const [avatarBroken, setAvatarBroken] = useState(false)
    /**
     * Which groups the person has opened or closed by hand.
     *
     * A group with no entry here falls back to "open when you are inside
     * it", so landing on an email page shows the email links without a
     * click. Once the person clicks, their choice wins.
     */
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

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
            {/* Logo, with the region the person is working in. Two people
                on different regions see identical screens otherwise, and
                the only difference is which rows appear. */}
            <div className="h-14 flex items-center justify-between gap-2 px-4 border-b border-neutral-800 font-semibold">
                <Link
                    href="/admin/operations"
                    className="flex items-center"
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

                <RegionSwitcher />
            </div>

            {/* Nav */}
            <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
                {filteredNavItems.map((item) => {
                    const Icon = item.icon
                    const isActive = isActivePath(pathname, item.href)

                    const children = item.children?.filter((child) =>
                        child.roles.includes(user.role)
                    )

                    const linkClass = `group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 border-l-2
                        ${isActive
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium"
                            : "border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-gray-900 dark:hover:text-white"
                        }`

                    const iconClass = `shrink-0 transition-colors ${isActive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200"
                        }`

                    // No children: exactly as before.
                    if (!children || children.length === 0) {
                        return (
                            <Link key={item.name} href={item.href} className={linkClass}>
                                <Icon size={18} className={iconClass} />
                                <span className="truncate">{item.name}</span>
                            </Link>
                        )
                    }

                    const open = openGroups[item.name] ?? isActive

                    return (
                        <div key={item.name}>
                            <button
                                type="button"
                                aria-expanded={open}
                                onClick={() =>
                                    setOpenGroups((prev) => ({
                                        ...prev,
                                        [item.name]: !open,
                                    }))
                                }
                                className={`${linkClass} w-full text-left`}
                            >
                                <Icon size={18} className={iconClass} />
                                <span className="truncate flex-1">{item.name}</span>
                                <ChevronDown
                                    size={15}
                                    className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""
                                        }`}
                                />
                            </button>

                            {open && (
                                <div className="mt-0.5 ml-5 space-y-0.5 border-l border-gray-200 pl-2 dark:border-neutral-800">
                                    {children.map((child) => {
                                        // Exact match only. Every child sits under
                                        // the group's own href, so a prefix test
                                        // would light up Overview on every page.
                                        const childActive = pathname === child.href

                                        if (child.soon) {
                                            return (
                                                <span
                                                    key={child.href}
                                                    title="Not built yet"
                                                    className="flex cursor-default items-center justify-between rounded-md px-3 py-1.5 text-[13px] text-gray-400 dark:text-neutral-600"
                                                >
                                                    {child.name}
                                                    <span className="text-[10px] uppercase tracking-wide opacity-70">
                                                        soon
                                                    </span>
                                                </span>
                                            )
                                        }

                                        return (
                                            <Link
                                                key={child.href}
                                                href={child.href}
                                                className={`block rounded-md px-3 py-1.5 text-[13px] transition
                                                    ${childActive
                                                        ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                                                    }`}
                                            >
                                                {child.name}
                                            </Link>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
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