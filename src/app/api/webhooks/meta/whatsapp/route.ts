import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { parseWhatsAppMessages } from "@/lib/webhooks/facebook/whatsapp/parse-message"
import type { WhatsAppWebhookBody } from "@/types/whatsapp/whatsapp-webhook"

// ── GET: Meta's verification handshake ──────────────────────────────
// When you click "Verify and save", Meta sends a GET with these params.
// You must echo back hub.challenge IF the verify token matches.
export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams
    const mode = params.get("hub.mode")
    const token = params.get("hub.verify_token")
    const challenge = params.get("hub.challenge")

    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
        return new NextResponse(challenge, { status: 200 })
    }
    return new NextResponse("Forbidden", { status: 403 })
}

// ── POST: incoming messages + status updates ────────────────────────
export async function POST(req: NextRequest) {
    // Read raw body FIRST — needed for signature verification
    const raw = await req.text()

    // Verify the request truly came from Meta (X-Hub-Signature-256)
    const signature = req.headers.get("x-hub-signature-256") ?? ""
    if (!verifySignature(raw, signature)) {
        return new NextResponse("Invalid signature", { status: 401 })
    }

    const body = JSON.parse(raw) as WhatsAppWebhookBody

    // Only WhatsApp events
    if (body.object !== "whatsapp_business_account") {
        return new NextResponse("Ignored", { status: 200 })
    }

    const messages = parseWhatsAppMessages(body)

    for (const m of messages) {
        // TODO: save to MongoDB via Mongoose here
        // e.g. await WhatsAppLead.updateOne(
        //   { waId: m.waId },
        //   { $set: { name: m.name }, $push: { messages: { text: m.text, at: m.timestamp } } },
        //   { upsert: true }
        // )
        console.log("WhatsApp lead:", m)
    }

    // ALWAYS return 200 fast — Meta retries (and disables) on non-200/slow responses
    return new NextResponse("OK", { status: 200 })
}

function verifySignature(raw: string, signature: string): boolean {
    const secret = process.env.META_WA_APP_SECRET
    if (!secret || !signature) return false

    const expected =
        "sha256=" +
        crypto.createHmac("sha256", secret).update(raw).digest("hex")

    // timing-safe compare
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
}