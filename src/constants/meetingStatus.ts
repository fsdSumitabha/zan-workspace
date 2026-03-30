export const MEETING_STATUS = {
    SCHEDULED: 2010,
    RESCHEDULED: 2020,
    CANCELLED: 2030,
    MISSED: 2040,
    COMPLETED: 2050,
} as const

export type MeetingStatus = (typeof MEETING_STATUS)[keyof typeof MEETING_STATUS]

export const MEETING_STATUS_META: Record<
    MeetingStatus,
    { label: string; icon: string; color: string }
> = {
    2010: {
        label: "Meeting Scheduled",
        icon: "calendar",
        color: "border border-blue-600 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
    },
    2020: {
        label: "Meeting Rescheduled",
        icon: "refresh",
        color: "border border-yellow-500 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300"
    },
    2030: {
        label: "Meeting Cancelled",
        icon: "times",
        color: "border border-red-600 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
    },
    2040: {
        label: "Meeting Missed",
        icon: "exclamation-circle",
        color: "border border-gray-500 bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300"
    },
    2050: {
        label: "Meeting Completed",
        icon: "check",
        color: "border border-green-600 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
    }
};