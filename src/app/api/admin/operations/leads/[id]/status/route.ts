import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import { LEAD_STATUS, LeadStatus } from "@/constants/leadStatus"

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect()

        const { id } = await context.params

        // Validate MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid lead ID" },
                { status: 400 }
            )
        }

        const body = await req.json()
        const { status } = body as { status?: LeadStatus }

        // Validate status presence
        if (!status) {
            return NextResponse.json(
                { success: false, message: "Status is required" },
                { status: 400 }
            )
        }

        // Validate status value
        const validStatuses = Object.values(LEAD_STATUS)
        if (!validStatuses.includes(status)) {
            return NextResponse.json(
                { success: false, message: "Invalid status value" },
                { status: 400 }
            )
        }

        // Find lead
        const lead = await Lead.findById(id)

        if (!lead) {
            return NextResponse.json(
                { success: false, message: "Lead not found" },
                { status: 404 }
            )
        }

        // Optional: Prevent updating if already converted/lost
        if (
            lead.status === LEAD_STATUS.CONVERTED ||
            lead.status === LEAD_STATUS.LOST
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Cannot update status of a closed lead"
                },
                { status: 409 }
            )
        }

        const oldStatus = lead.status

        // Update status
        lead.status = status
        await lead.save()

        return NextResponse.json(
            {
                success: true,
                message: "Lead status updated successfully",
                data: {
                    id: lead._id,
                    oldStatus,
                    newStatus: lead.status
                }
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("Update Lead Status Error:", error)

        return NextResponse.json(
            {
                success: false,
                message: "Internal server error"
            },
            { status: 500 }
        )
    }
}