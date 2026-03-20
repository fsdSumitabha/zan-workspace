export const MEETING_TYPE = {
    ONLINE: 0,
    OFFLINE: 1
} as const

export type MeetingType =
    (typeof MEETING_TYPE)[keyof typeof MEETING_TYPE]

export const MEETING_TYPE_META = {
    0: { label: "Online" },
    1: { label: "Offline" }
}