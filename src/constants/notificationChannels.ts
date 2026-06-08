export const NOTIFICATION_CHANNEL = {
    1: "In-App",
    2: "Email",
    3: "SMS",
    4: "Web Push",
} as const

export type NotificationChannel = keyof typeof NOTIFICATION_CHANNEL