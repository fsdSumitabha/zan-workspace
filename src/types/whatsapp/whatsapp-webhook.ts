// ── Incoming webhook payload shape from Meta ─────────────────────────
export interface WhatsAppWebhookBody {
    object: string // "whatsapp_business_account"
    entry?: WhatsAppEntry[]
}

export interface WhatsAppEntry {
    id: string // WABA ID
    changes?: WhatsAppChange[]
}

export interface WhatsAppChange {
    field: string // "messages"
    value: WhatsAppValue
}

export interface WhatsAppValue {
    messaging_product: string // "whatsapp"
    metadata?: {
        display_phone_number?: string
        phone_number_id?: string
    }
    contacts?: WhatsAppContact[]
    messages?: WhatsAppMessage[]
    statuses?: WhatsAppStatus[] // delivery/read receipts (no messages present)
}

export interface WhatsAppContact {
    wa_id: string // customer's WhatsApp number (no +)
    profile?: { name?: string }
}

export interface WhatsAppMessage {
    from: string // customer's number (no +)
    id: string // unique message id (wamid...)
    timestamp: string // unix seconds as string
    type: "text" | "image" | "audio" | "video" | "document" | "button" | "interactive" | string
    text?: { body: string }
}

export interface WhatsAppStatus {
    id: string
    status: "sent" | "delivered" | "read" | "failed" | string
    recipient_id: string
}

// ── Flattened shape your app actually works with ─────────────────────
export interface ParsedWhatsAppMessage {
    waId: string
    name: string
    messageId: string
    timestamp: string
    type: string
    text: string
    phoneNumberId: string
}