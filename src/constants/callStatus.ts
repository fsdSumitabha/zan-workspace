import * as Icons from "lucide-react"

const CALL_DIRECTION_META: Record<number, { label: string; icon: keyof typeof Icons }> = {
    0: { label: "Outbound", icon: "PhoneOutgoing" },
    1: { label: "Inbound",  icon: "PhoneIncoming" },
}

export { CALL_DIRECTION_META }

const CALL_STATUS_META: Record<number, { label: string; color: string }> = {
    0: { label: "Completed", color: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400" },
    1: { label: "No Answer", color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400" },
    2: { label: "Busy",      color: "text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400" },
    3: { label: "Failed",    color: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400" },
}

export { CALL_STATUS_META }