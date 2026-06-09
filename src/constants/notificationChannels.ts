import { dispatchEmail } from "@/lib/notifications/channels/email"
import { dispatchPush } from "@/lib/notifications/channels/push"
import { dispatchSms } from "@/lib/notifications/channels/sms"


export const NOTIFICATION_CHANNEL = {
    2: { label: "Email",    channel: dispatchEmail },
    3: { label: "SMS",      channel: dispatchSms   },
    4: { label: "Web Push", channel: dispatchPush  },
} as const

export type NotificationChannel = keyof typeof NOTIFICATION_CHANNEL
