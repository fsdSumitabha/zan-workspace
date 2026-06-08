export const NOTIFICATION_CHANNEL = {
    IN_APP: 1,
    EMAIL:  2,
    SMS:    3,
    PUSH:   4,
} as const

export type NotificationChannel =
    (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL]
