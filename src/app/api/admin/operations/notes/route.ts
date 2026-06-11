import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Interaction from "@/models/Interaction"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { auditedCreate, auditedUpdateByNumericEntityType } from "@/lib/activity-log"
import { emitNotification } from "@/lib/notifications/emit"
import { EVENT_CODE } from "@/constants/eventTypes"
import { resolveParentName } from "@/lib/notifications/resolveParentName"

function parentUrl(et: number, eid: string): string | undefined {
    if (et === ENTITY_TYPE.LEAD) return `/admin/operations/leads/${eid}`
    if (et === ENTITY_TYPE.CLIENT) return `/admin/operations/clients/${eid}`
    if (et === ENTITY_TYPE.PROJECT) return `/admin/operations/projects/${eid}`
    return undefined
}


export async function POST(req: NextRequest) {
    try {
        const authUser = await requireRole(req, [10, 60, 45, 50, 70])

        await dbConnect()

        const body = await req.json()

        const {
            entityType,
            entityId,
            title,
            description,
            status
        } = body

        if (entityType === undefined || entityType === null || !entityId) {
            return NextResponse.json(
                { success: false, error: "entityType and entityId are required" },
                { status: 400 }
            )
        }

        // 1. Create Interaction (timeline entry)
        const note = await auditedCreate(
            Interaction,
            ENTITY_TYPE.INTERACTION,
            {
                entityType,
                entityId,
                type: INTERACTION_TYPE.NOTE_ADDED,
                title,
                description,
                createdBy: authUser.id
            },
            authUser.id
        )

        // 2. Prepare update payload
        const updatePayload = {
            lastInteractionAt: new Date(),
            lastInteractionId: note._id
        }

        switch (entityType) {
            case ENTITY_TYPE.LEAD:
            case ENTITY_TYPE.CLIENT:
            case ENTITY_TYPE.PROJECT:
                await auditedUpdateByNumericEntityType(
                    entityType,
                    entityId,
                    updatePayload,
                    authUser.id
                )
                break

            default:
                return NextResponse.json(
                    { success: false, error: "Invalid entityType" },
                    { status: 400 }
                )
        }

        const parentName = await resolveParentName(entityType, String(entityId))
        await emitNotification({
            type: EVENT_CODE.NOTE_ADDED,
            entityType,
            entityId,
            actor: { id: authUser.id, name: (authUser as any).name, role: authUser.role },
            payload: { parentUrl: parentUrl(entityType, String(entityId)), parentName, title, description },
        })

        return NextResponse.json(
            { success: true, data: note },
            { status: 201 }
        )
    } catch (error : any) {
        console.error(error)

        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            { success: false, error: "Failed to create note" },
            { status: 500 }
        )
    }
}