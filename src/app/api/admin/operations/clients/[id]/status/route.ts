import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Client from "@/models/Client"
import Interaction from "@/models/Interaction"

import { CLIENT_STATUS, CLIENT_STATUS_META, type ClientStatus } from "@/constants/clientStatus"

import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError, requireAuth } from "@/lib/auth/requireAuth"

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, [10, 60])
        
        await dbConnect()

        const { id } = await context.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid client ID" },
                { status: 400 }
            )
        }

        const body = await req.json()
        const { status, remarks } = body as {
            status?: ClientStatus
            remarks?: string
        }

        // Validate presence
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

        // Validate status value
        const validStatuses = Object.values(CLIENT_STATUS)

        if (!validStatuses.includes(status)) {
            return NextResponse.json(
                { success: false, message: "Invalid status value" },
                { status: 400 }
            )
        }

        // Find client
        const client = await Client.findById(id)

        if (!client) {
            return NextResponse.json(
                { success: false, message: "Client not found" },
                { status: 404 }
            )
        }

        const oldStatus = client.status

        // Prevent redundant update
        if (oldStatus === status) {
            return NextResponse.json(
                { success: false, message: "Status is already set" },
                { status: 400 }
            )
        }

        // Optional rule: prevent updates after completion
        if (oldStatus === CLIENT_STATUS.COMPLETED) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Cannot update a completed client"
                },
                { status: 409 }
            )
        }

        // 1. Update client
        client.status = status
        await client.save()

        // 2. Create interaction log
        const interaction = await Interaction.create({
            entityType: 1,
            entityId: client._id,
            type: INTERACTION_TYPE.STATUS_CHANGED,

            title: JSON.stringify({
                action: "STATUS_CHANGE",
                from: oldStatus,
                to: status
            }),

            description: remarks,
            createdBy: null
        })

        // 3. Update last interaction tracking (nice touch)
        client.lastInteractionAt = new Date()
        client.lastInteractionId = interaction._id
        await client.save()

        return NextResponse.json(
            {
                success: true,
                message: "Client status updated successfully",
                data: {
                    id: client._id,
                    oldStatus,
                    newStatus: client.status
                }
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("Update Client Status Error:", error)

        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
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