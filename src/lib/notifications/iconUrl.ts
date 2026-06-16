const LUCIDE_CDN = "https://cdn.jsdelivr.net/npm/lucide-static@latest/icons"

export function badgeIconUrl(badge: string | undefined): string {
    return `${LUCIDE_CDN}/${badge ?? "bell"}.svg`
}
