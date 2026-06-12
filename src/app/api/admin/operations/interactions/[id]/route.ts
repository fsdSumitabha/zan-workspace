import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import Interaction from "@/models/Interaction"
import User from "@/models/User"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"

const EDIT_ROLES = [10, 60, 45, 50, 70]

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const authUser = await requireRole(req, EDIT_ROLES)
        await dbConnect()

        const { id } = await context.params
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ success: false, message: "Invalid interaction id" }, { status: 400 })
        }

        const body = await req.json().catch(() => ({}))
        const incomingTitle = typeof body?.title === "string" ? body.title.trim() : undefined
        const incomingDescription = typeof body?.description === "string" ? body.description.trim() : undefined

        if (incomingTitle === undefined && incomingDescription === undefined) {
            return NextResponse.json({ success: false, message: "Nothing to update" }, { status: 400 })
        }

        const interaction = await Interaction.findById(id)
        if (!interaction) {
            return NextResponse.json({ success: false, message: "Interaction not found" }, { status: 404 })
        }

        const isNote = interaction.type === INTERACTION_TYPE.NOTE_ADDED
        const isStatusChange = interaction.type === INTERACTION_TYPE.STATUS_CHANGED

        if (!isNote && !isStatusChange) {
            return NextResponse.json({ success: false, message: "This interaction type cannot be edited" }, { status: 409 })
        }

        // Status-change records have JSON-encoded titles (from/to codes). Title edits are blocked there.
        if (isStatusChange && incomingTitle !== undefined) {
            return NextResponse.json({ success: false, message: "Status cannot be edited; only the remarks can be updated" }, { status: 409 })
        }

        const titleChanged = isNote && incomingTitle !== undefined && incomingTitle !== (interaction.title ?? "")
        const descriptionChanged = incomingDescription !== undefined && incomingDescription !== (interaction.description ?? "")

        if (!titleChanged && !descriptionChanged) {
            return NextResponse.json({ success: false, message: "No changes detected" }, { status: 400 })
        }

        const historyEntry: Record<string, unknown> = {
            editedBy: new mongoose.Types.ObjectId(authUser.id),
            editedAt: new Date(),
        }
        if (titleChanged) historyEntry.oldTitle = interaction.title ?? ""
        if (descriptionChanged) historyEntry.oldDescription = interaction.description ?? ""

        if (titleChanged) interaction.title = incomingTitle
        if (descriptionChanged) interaction.description = incomingDescription

        interaction.editHistory = [...(interaction.editHistory ?? []), historyEntry as any]
        interaction.$locals._auditUserId = authUser.id
        await interaction.save()

        await interaction.populate({
            path: "editHistory.editedBy",
            model: User,
            select: "_id name email avatar role",
        })

        return NextResponse.json({ success: true, data: interaction }, { status: 200 })
    } catch (err: any) {
        console.error("INTERACTION_EDIT_ERROR:", err)
        if (err instanceof AuthError) {
            return NextResponse.json({ success: false, message: err.message }, { status: err.statusCode })
        }
        return NextResponse.json({ success: false, message: "Failed to update interaction" }, { status: 500 })
    }
}