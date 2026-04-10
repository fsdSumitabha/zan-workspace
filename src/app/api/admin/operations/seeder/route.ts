import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import Lead from "@/models/Lead";
import Interaction from "@/models/Interaction";
import { ENTITY_TYPE } from "@/constants/entityTypes";

export async function GET() {
    try {
        await dbConnect();

        const leads = await Lead.find({});
        if (!leads.length) {
            return NextResponse.json(
                { success: false, message: "No leads found" },
                { status: 404 }
            );
        }

        let updatedCount = 0;
        for (const lead of leads) {
            const latestInteraction = await Interaction.findOne({
                entityType: ENTITY_TYPE.LEAD,
                entityId: lead._id,
            }).sort({ createdAt: -1 });

            if (latestInteraction) {
                lead.lastInteractionAt = latestInteraction.createdAt;
                lead.lastInteractionId = latestInteraction._id;
                await lead.save();
                updatedCount++;
            }
        }

        return NextResponse.json(
            {
                success: true,
                message: "Backfill complete",
                totalLeads: leads.length,
                updatedLeads: updatedCount,
            },
            { status: 200 }
        );
    } catch (error: any) {
        console.error("Backfill error:", error);
        return NextResponse.json(
            {
                success: false,
                message: "Internal server error during backfill",
                error: error.message,
            },
            { status: 500 }
        );
    }
}