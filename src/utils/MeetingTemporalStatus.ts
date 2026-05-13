export type MeetingTemporalStatus = "UPCOMING" | "TODAY" | "PAST"

export function getMeetingTemporalStatus(date: Date): MeetingTemporalStatus {
    const now = new Date()

    const scheduled = new Date(date)

    const isToday =
        scheduled.getFullYear() === now.getFullYear() &&
        scheduled.getMonth() === now.getMonth() &&
        scheduled.getDate() === now.getDate()

    if (isToday) return "TODAY"

    if (scheduled > now) return "UPCOMING"

    return "PAST"
}