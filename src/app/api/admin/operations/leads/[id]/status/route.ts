import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import Interaction from "@/models/Interaction"
import { LEAD_STATUS, LEAD_STATUS_META, LeadStatus } from "@/constants/leadStatus"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedCreate, auditedFindByIdAndUpdate } from "@/lib/activity-log"

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const authUser = await requireRole(req, [10, 60, 45, 70])
        
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

        const updatedLead = await auditedFindByIdAndUpdate(
            Lead,
            "LEAD",
            id,
            { status },
            {},
            authUser.id
        )

        if (!updatedLead) {
            return NextResponse.json(
                { success: false, message: "Lead not found" },
                { status: 404 }
            )
        }

        // Create interaction (timeline entry)
        await auditedCreate(
            Interaction,
            "INTERACTION",
            {
                entityType: 0,
                entityId: lead._id,
                type: INTERACTION_TYPE.STATUS_CHANGED,
                title: JSON.stringify({
                    action: "STATUS_CHANGE",
                    from: oldStatus,
                    to: status
                }),
                description: remarks,
                createdBy: authUser.id
            },
            authUser.id
        )

        return NextResponse.json(
            {
                success: true,
                message: "Lead status updated successfully",
                data: {
                    id: updatedLead._id,
                    oldStatus,
                    newStatus: updatedLead.status
                }
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("Update Lead Status Error:", error)

        if (error instanceof AuthError) {
            return NextResponse.json(
                {
                    success: false,
                    message: error.message
                },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            {
                success: false,
                message: "Internal server error"
            },
            { status: 500 }
        )
    }
}