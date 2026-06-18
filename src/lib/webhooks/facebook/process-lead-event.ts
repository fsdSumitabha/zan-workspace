import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import MetaLeadEvent from "@/models/MetaLeadEvent"
import { fetchFacebookLead } from "@/lib/webhooks/facebook/fetch-lead"
import { auditedCreate } from "@/lib/activity-log"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import mongoose from "mongoose"

export async function processLeadEvent(eventId: string) {
    await dbConnect()
    const event = await MetaLeadEvent.findById(eventId)
    if (!event || event.status === "enriched") return

    try {
        event.status = "processing"
        await event.save()

        const lead = await fetchFacebookLead(event.leadgenId)
        const name = lead.fields["full_name"] || lead.fields["name"] || "Unknown"
        const email = lead.fields["email"] || ""
        const phone = lead.fields["phone_number"] || lead.fields["phone"] || ""

        if (!phone) {
            event.status = "failed"
            event.error = "no phone"
            await event.save()
            return
        }

        const existing = await Lead.findOne({ phone })
        if (existing) {
            event.status = "enriched"
            event.leadId = existing._id
            await event.save()
            return
        }

        //use mongo id minting to cast the id

        const botUserId = process.env.FACEBOOK_LEAD_BOT_ID ? new mongoose.Types.ObjectId(process.env.FACEBOOK_LEAD_BOT_ID) : null
        
        const created = await auditedCreate(
            Lead,
            ENTITY_TYPE.LEAD,
            { name, email, phone, source: "facebook", createdBy: botUserId },
            botUserId,
        )

        event.status = "enriched"
        event.leadId = created._id
        await event.save()
    } catch (err: any) {
        event.status = "failed"
        event.error = err?.message ?? String(err)
        await event.save()
        console.error(`[fb-webhook] enrich failed ${event.leadgenId}:`, err)
    }
}