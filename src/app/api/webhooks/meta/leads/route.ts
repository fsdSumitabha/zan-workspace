import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { verifyFacebookSignature } from "@/lib/webhooks/facebook/verify-signature"
import type { FacebookWebhookPayload } from "@/types/facebook/facebook-leads"
import { waitUntil } from "@vercel/functions"
import MetaLeadEvent from "@/models/MetaLeadEvent"
import { processLeadEvent } from "@/lib/webhooks/facebook/process-lead-event"


// Prevent any caching/static optimization on this route
export const dynamic = "force-dynamic"
export const runtime = "nodejs" // crypto needs Node runtime, not Edge

// 1. Verification handshake — Meta calls this once when you save the URL
export async function GET(req: NextRequest) {
    console.log("[fb-webhook] verification request received")
    const { searchParams } = new URL(req.url)
    const mode = searchParams.get("hub.mode")
    const token = searchParams.get("hub.verify_token")
    const challenge = searchParams.get("hub.challenge")

    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
        // Must return the challenge as plain text, status 200
        return new NextResponse(challenge, { status: 200 })
    }
    return new NextResponse("Forbidden", { status: 403 })
}

// 2. Lead notification — Meta calls this every time a lead is submitted
export async function POST(req: NextRequest) {
    const rawBody = await req.text()
    const signature = req.headers.get("x-hub-signature-256")

    if (!verifyFacebookSignature(rawBody, signature, process.env.META_APP_SECRET!)) {
        return new NextResponse("Invalid signature", { status: 401 })
    }

    await dbConnect()
    const payload = JSON.parse(rawBody) as FacebookWebhookPayload
    if (payload.object !== "page") {
        return NextResponse.json({ received: true }, { status: 200 })
    }

    const eventIds: string[] = []
    for (const entry of payload.entry) {
        for (const change of entry.changes) {
            if (change.field !== "leadgen") continue
            const v = change.value
            try {
                const event = await MetaLeadEvent.create({
                    leadgenId: v.leadgen_id,
                    formId: v.form_id,
                    pageId: v.page_id,
                    adId: v.ad_id ?? null,
                    adgroupId: v.adgroup_id ?? null,
                    createdTime: v.created_time ? new Date(v.created_time * 1000) : undefined,
                    rawPayload: v,
                })
                eventIds.push(event._id.toString())
            } catch (e: any) {
                if (e.code !== 11000) console.error("[fb-webhook] persist failed:", e)
                // 11000 = duplicate leadgenId → already saved, skip
            }
        }
    }

    waitUntil(
        Promise.all(eventIds.map((id) => processLeadEvent(id).catch(console.error)))
    )

    return NextResponse.json({ received: true }, { status: 200 })
}