const LUCIDE_CDN = "https://cdn.jsdelivr.net/npm/lucide-static@latest/icons"

const BADGE_TO_FILE: Record<string, string> = {
    "target":         "target",
    "party-popper":   "party-popper",
    "refresh-cw":     "refresh-cw",
    "user-plus":      "user-plus",
    "folder-plus":    "folder-plus",
    "calendar":       "calendar",
    "calendar-clock": "calendar-clock",
    "calendar-x":     "calendar-x",
    "calendar-check": "calendar-check",
    "sticky-note":    "sticky-note",
    "phone":          "phone",
    "file-text":      "file-text",
    "receipt-rupee":  "receipt-indian-rupee",
    "bell":           "bell",
}

export function badgeIconUrl(badge: string | undefined): string {
    const file = badge && BADGE_TO_FILE[badge] ? BADGE_TO_FILE[badge] : "bell"
    return `${LUCIDE_CDN}/${file}.svg`
}
