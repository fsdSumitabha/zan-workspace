import {
    Bell, Calendar, CalendarCheck, CalendarClock, CalendarX,
    FileText, FolderPlus, PartyPopper, Phone, ReceiptIndianRupee,
    RefreshCw, StickyNote, Target, UserPlus, type LucideIcon,
} from "lucide-react"

interface BadgeMeta { Icon: LucideIcon; color: string; bg: string }

const BADGE_MAP: Record<string, BadgeMeta> = {
    "target":         { Icon: Target,             color: "text-indigo-600 dark:text-indigo-400",   bg: "bg-indigo-500/10" },
    "party-popper":   { Icon: PartyPopper,        color: "text-green-600 dark:text-green-400",     bg: "bg-green-500/10" },
    "refresh-cw":     { Icon: RefreshCw,          color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-500/10" },
    "user-plus":      { Icon: UserPlus,           color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-500/10" },
    "folder-plus":    { Icon: FolderPlus,         color: "text-purple-600 dark:text-purple-400",   bg: "bg-purple-500/10" },
    "calendar":       { Icon: Calendar,           color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-500/10" },
    "calendar-clock": { Icon: CalendarClock,      color: "text-yellow-600 dark:text-yellow-400",   bg: "bg-yellow-500/10" },
    "calendar-x":     { Icon: CalendarX,          color: "text-red-600 dark:text-red-400",         bg: "bg-red-500/10" },
    "calendar-check": { Icon: CalendarCheck,      color: "text-green-600 dark:text-green-400",     bg: "bg-green-500/10" },
    "sticky-note":    { Icon: StickyNote,         color: "text-neutral-600 dark:text-neutral-300", bg: "bg-neutral-500/10" },
    "phone":          { Icon: Phone,              color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    "file-text":      { Icon: FileText,           color: "text-neutral-600 dark:text-neutral-300", bg: "bg-neutral-500/10" },
    "receipt-rupee":  { Icon: ReceiptIndianRupee, color: "text-purple-600 dark:text-purple-400",   bg: "bg-purple-500/10" },
    "bell":           { Icon: Bell,               color: "text-neutral-600 dark:text-neutral-300", bg: "bg-neutral-500/10" },
}

const EMOJI_TO_NAME: Record<string, string> = {
    "✨": "target", "🎯": "target",
    "🎉": "party-popper",
    "🔁": "refresh-cw", "🔄": "calendar-clock",
    "👤": "user-plus",
    "📁": "folder-plus",
    "📅": "calendar",
    "❌": "calendar-x",
    "✅": "calendar-check",
    "📝": "sticky-note",
    "📞": "phone",
    "📄": "file-text",
    "💼": "receipt-rupee",
    "🔔": "bell",
}

const DEFAULT_META: BadgeMeta = BADGE_MAP["bell"]

function resolveMeta(badge: string | undefined): BadgeMeta {
    if (!badge) return DEFAULT_META
    if (BADGE_MAP[badge]) return BADGE_MAP[badge]
    const mapped = EMOJI_TO_NAME[badge]
    if (mapped && BADGE_MAP[mapped]) return BADGE_MAP[mapped]
    return DEFAULT_META
}

interface Props {
    badge?: string
    size?: "sm" | "md"
}

export default function NotificationBadge({ badge, size = "md" }: Props) {
    const meta = resolveMeta(badge)
    const Icon = meta.Icon
    const wrap = size === "sm" ? "w-7 h-7" : "w-9 h-9"
    const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"
    return (
        <span className={`shrink-0 ${wrap} rounded-full flex items-center justify-center ${meta.bg}`}>
            <Icon className={`${iconSize} ${meta.color}`} aria-hidden />
        </span>
    )
}
