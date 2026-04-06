import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import Interaction from "@/models/Interaction"
import { LEAD_STATUS, LEAD_STATUS_META, LeadStatus } from "@/constants/leadStatus"

const INTERACTION_TYPE_STATUS_CHANGE = 900

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect()

        const { id } = await context.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid lead ID" },
                { status: 400 }
            )
        }

        const body = await req.json()
        const { status, remarks } = body as {
            status?: LeadStatus
            remarks?: string
        }

        // Validate status presence
        if (!status) {
            return NextResponse.json(
                { success: false, message: "Status is required" },
                { status: 400 }
            )
        }

        if (!remarks || !remarks.trim()) {
            return NextResponse.json(
                { success: false, message: "Remarks are required" },
                { status: 400 }
            )
        }

        const validStatuses = Object.values(LEAD_STATUS).sort((a, b) => a - b)

        // Validate status value
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

        // Prevent updating if already closed
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

        const currentStatus = lead.status

        // === STATUS PROGRESSION LOGIC ===
        if (status !== LEAD_STATUS.LOST) {
            const currentIndex = validStatuses.indexOf(currentStatus)
            const nextAllowedStatus = validStatuses[currentIndex + 1]

            if (status < currentStatus) {
                return NextResponse.json(
                    { success: false, message: "Cannot downgrade lead status" },
                    { status: 400 }
                )
            }

            if (status !== nextAllowedStatus) {
                return NextResponse.json(
                    { success: false, message: "You can only move to the next stage" },
                    { status: 400 }
                )
            }
        }
        // === END ===

        const oldStatus = lead.status

        // 1. Update lead
        lead.status = status
        await lead.save()

        // 2. Create interaction (THIS IS THE NEW PART)
        await Interaction.create({
            entityType: 0,
            entityId: lead._id,
            type: INTERACTION_TYPE_STATUS_CHANGE,

            title: JSON.stringify({
                action: "STATUS_CHANGE",
                from: oldStatus,
                to: status
            }),

            description: remarks,

            createdBy: null
        })

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