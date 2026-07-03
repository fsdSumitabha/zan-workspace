import type { WhatsAppWebhookBody, ParsedWhatsAppMessage, } from "@/types/whatsapp/whatsapp-webhook"

/**
 * WhatsApp message payloads nest deeply:
 * body.entry[].changes[].value.{ contacts[], messages[], metadata }
 * A single webhook can contain multiple messages — return them all.
 */
export function parseWhatsAppMessages(
    body: WhatsAppWebhookBody
): ParsedWhatsAppMessage[] {
    const parsed: ParsedWhatsAppMessage[] = []

    for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
            const value = change.value
            if (!value?.messages) continue // status update, not a message

            const nameByWaId: Record<string, string> = {}
            for (const c of value.contacts ?? []) {
                nameByWaId[c.wa_id] = c.profile?.name ?? ""
            }

            for (const msg of value.messages) {
                parsed.push({
                    waId: msg.from,
                    name: nameByWaId[msg.from] ?? "",
                    messageId: msg.id,
                    timestamp: msg.timestamp,
                    type: msg.type,
                    text: msg.type === "text" ? msg.text?.body ?? "" : "",
                    phoneNumberId: value.metadata?.phone_number_id ?? "",
                })
            }
        }
    }

    return parsed
}