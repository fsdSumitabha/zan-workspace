import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Project from "@/models/Project"
import Interaction from "@/models/Interaction"

import { PROJECT_STATUS, type ProjectStatus } from "@/constants/projectStatus"

import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedFindByIdAndUpdate } from "@/lib/activity-log"

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const authUser = await requireRole(req, [10, 60])

        await dbConnect()

        const { id } = await context.params

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid project ID" },
                { status: 400 }
            )
        }

        const body = await req.json()
        const { status, remarks } = body as {
            status?: ProjectStatus
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
        const validStatuses = Object.values(PROJECT_STATUS)

        if (!validStatuses.includes(status)) {
            return NextResponse.json(
                { success: false, message: "Invalid status value" },
                { status: 400 }
            )
        }

        // Find project
        const project = await Project.findById(id)

        if (!project) {
            return NextResponse.json(
                { success: false, message: "Project not found" },
                { status: 404 }
            )
        }

        const oldStatus = project.status

        // Prevent redundant update
        if (oldStatus === status) {
            return NextResponse.json(
                { success: false, message: "Status is already set" },
                { status: 400 }
            )
        }

        // Prevent updates after closed
        if (oldStatus === PROJECT_STATUS.CLOSED) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Cannot update a closed project"
                },
                { status: 409 }
            )
        }

        const updatedProject = await auditedFindByIdAndUpdate(
            Project,
            "PROJECT",
            id,
            { status },
            {},
            authUser.id
        )

        if (!updatedProject) {
            return NextResponse.json(
                { success: false, message: "Project not found" },
                { status: 404 }
            )
        }

        const interaction = await Interaction.create({
            entityType: 2,
            entityId: updatedProject._id,
            type: INTERACTION_TYPE.STATUS_CHANGED,

            title: JSON.stringify({
                action: "STATUS_CHANGE",
                from: oldStatus,
                to: status
            }),

            description: remarks,
            createdBy: authUser.id
        })

        await auditedFindByIdAndUpdate(
            Project,
            "PROJECT",
            id,
            {
                lastInteractionAt: new Date(),
                lastInteractionId: interaction._id,
            },
            {},
            authUser.id
        )

        return NextResponse.json(
            {
                success: true,
                message: "Project status updated successfully",
                data: {
                    id: updatedProject._id,
                    oldStatus,
                    newStatus: status
                }
            },
            { status: 200 }
        )
    } catch (error : any) {
        console.error("Update Project Status Error:", error)

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