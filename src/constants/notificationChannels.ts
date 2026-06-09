export const NOTIFICATION_CHANNEL = {
    1: "In-App",
    2: "Email",
    3: "SMS",
    4: "Web Push",
} as const

export const CHANNEL_CODE = {
    IN_APP: 1,
    EMAIL:  2,
    SMS:    3,
    PUSH:   4,
} as const

export type NotificationChannel = keyof typeof NOTIFICATION_CHANNEL