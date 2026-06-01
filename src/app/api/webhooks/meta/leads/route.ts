import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import { verifyFacebookSignature } from "@/lib/webhooks/facebook/verify-signature"
import { fetchFacebookLead } from "@/lib/webhooks/facebook/fetch-lead"
import type { FacebookWebhookPayload } from "@/types/facebook/facebook-leads"
import { auditedCreate } from "@/lib/activity-log"
import { ENTITY_TYPE } from "@/constants/entityTypes"



// Prevent any caching/static optimization on this route
export const dynamic = "force-dynamic"
export const runtime = "nodejs" // crypto needs Node runtime, not Edge

// 1. Verification handshake — Meta calls this once when you save the URL
export async function GET(req: NextRequest) {
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
    // a) Read RAW body (needed for signature verification)
    const rawBody = await req.text()
    const signature = req.headers.get("x-hub-signature-256")

    if (
        !verifyFacebookSignature(
            rawBody,
            signature,
            process.env.META_APP_SECRET!
        )
    ) {
        return new NextResponse("Invalid signature", { status: 401 })
    }

    // b) Acknowledge IMMEDIATELY (Meta retries if you take too long)
    //    In production, push to a queue here and let a worker process it.
    //    For now, we'll process inline but return 200 even on internal errors
    //    so Meta doesn't retry forever and create duplicates.
    const payload = JSON.parse(rawBody) as FacebookWebhookPayload

    // Fire and forget — don't await before responding
    processLeads(payload).catch((err) =>
        console.error("[fb-webhook] processing failed:", err)
    )

    return NextResponse.json({ received: true }, { status: 200 })
}

async function processLeads(payload: FacebookWebhookPayload) {
    if (payload.object !== "page") return

    await dbConnect()

    // Important: entry[] and changes[] are arrays — iterate ALL of them
    for (const entry of payload.entry) {
        for (const change of entry.changes) {
            if (change.field !== "leadgen") continue

            const { leadgen_id, form_id, ad_id, page_id } = change.value

            try {
                const lead = await fetchFacebookLead(leadgen_id)

                // Map FB field names to your schema. Field names depend on
                // how the form was built — check Meta's testing tool to see actual names.
                const name =
                    lead.fields["full_name"] || lead.fields["name"] || "Unknown"
                const email = lead.fields["email"] || ""
                const phone =
                    lead.fields["phone_number"] || lead.fields["phone"] || ""

                if (!phone) {
                    console.warn(`[fb-webhook] no phone for lead ${leadgen_id}`)
                    continue
                }

                // Idempotency: same lead_id should never create two leads,
                // even if Meta retries. Use upsert OR check existence.
                const existing = await Lead.findOne({
                    $or: [{ phone }, { externalLeadId: leadgen_id }],
                })
                if (existing) {
                    console.log(`[fb-webhook] duplicate skipped: ${leadgen_id}`)
                    continue
                }

                // System-created (no auth user). Audit row will have null userId.
                await auditedCreate(
                    Lead,
                    ENTITY_TYPE.LEAD,
                    {
                        name,
                        email,
                        phone,
                        source: "facebook",
                        externalLeadId: leadgen_id, // add this field to your schema
                        meta: { form_id, ad_id, page_id },
                        createdBy: null,
                    },
                    null
                )
            } catch (err) {
                console.error(`[fb-webhook] failed lead ${leadgen_id}:`, err)
            }
        }
    }
}