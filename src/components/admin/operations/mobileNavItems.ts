import {
    Activity,
    BarChart3,
    CalendarClock,
    FolderKanban,
    Handshake,
    Home,
    Mails,
    Megaphone,
    PhoneCall,
    Target,
    UserRoundCog,
} from "lucide-react";
import { LEAD_SOURCE_ACCESS_ROLES } from "@/constants/leadSourceRoles";
import { EMAIL_ACCESS_ROLES } from "@/constants/emailRoles";
import { AD_TRACKING_VIEW_ROLES } from "@/constants/adTrackingRoles";

/**
 * The pages on the phone layout.
 *
 * Every page is in exactly one of the two lists below. The bottom bar
 * holds four tabs. Every other page is in the three-dots menu in the top
 * bar (MobileTopBar.tsx).
 *
 * The role lists match SideBar.tsx, with one exception. Users uses the
 * roles that GET /api/admin/operations/users accepts. The sidebar list
 * for Users differs from the API.
 */
export interface MobileNavItem {
    name: string;
    href: string;
    roles: readonly number[];
    icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

/** The bottom bar. Four tabs at most, so the labels do not overlap. */
export const MOBILE_TAB_ITEMS: MobileNavItem[] = [
    {
        name: "Dashboard",
        href: "/admin/operations",
        roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 65, 69, 70, 80],
        icon: Home,
    },
    {
        name: "Leads",
        href: "/admin/operations/leads",
        roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 65, 69, 70, 80],
        icon: Target,
    },
    {
        name: "Clients",
        href: "/admin/operations/clients",
        roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 69, 70, 80],
        icon: Handshake,
    },
    {
        name: "Meetings",
        href: "/admin/operations/meetings",
        roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 65, 69, 70, 80],
        icon: CalendarClock,
    },
];

/** The three-dots menu in the top bar. */
export const MOBILE_MORE_ITEMS: MobileNavItem[] = [
    {
        name: "Lead Sources",
        href: "/admin/operations/lead-sources",
        roles: LEAD_SOURCE_ACCESS_ROLES,
        icon: PhoneCall,
    },
    {
        name: "Projects",
        href: "/admin/operations/projects",
        roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 70, 80],
        icon: FolderKanban,
    },
    {
        name: "Ad Tracking",
        href: "/admin/operations/ad-tracking",
        roles: AD_TRACKING_VIEW_ROLES,
        icon: Megaphone,
    },
    {
        name: "Email Marketing",
        href: "/admin/operations/email",
        roles: EMAIL_ACCESS_ROLES,
        icon: Mails,
    },
    {
        name: "Overall Stats",
        href: "/admin/operations/overall-stats",
        roles: [10, 15, 20, 30, 40, 42, 45, 50, 60, 70, 80],
        icon: BarChart3,
    },
    {
        name: "Users",
        href: "/admin/operations/users",
        roles: [10, 15, 20, 69],
        icon: UserRoundCog,
    },
    {
        name: "Activity Log",
        href: "/admin/operations/activity-logs",
        roles: [10, 20],
        icon: Activity,
    },
];

/** True when this path is the one showing, or sits under it. */
export function isActiveMobilePath(pathname: string, href: string): boolean {
    if (href === "/admin/operations") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
}
