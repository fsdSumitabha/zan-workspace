import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Project from "@/models/Project"
import "@/models/Client"
import { SortOrder } from "mongoose"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { requireRole } from "@/lib/auth/requireRole"
import { auditedCreate } from "@/lib/activity-log"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { emitNotification } from "@/lib/notifications/emit"
import { EVENT_CODE } from "@/constants/eventTypes"
import { resolveParentName } from "@/lib/notifications/resolveParentName"

export async function GET(req: NextRequest) {
    try {
        await requireRole(req, [10, 60, 70, 45, 50])

        await dbConnect()

        const { searchParams } = new URL(req.url)

        const page = Number(searchParams.get("page")) || 1
        const limit = Number(searchParams.get("limit")) || 10
        const status = searchParams.get("status")
        const search = searchParams.get("search")
        const clientId = searchParams.get("clientId")
        const from = searchParams.get("from")
        const to = searchParams.get("to")
        const sort = searchParams.get("sort") || "latest"

        const query: any = {}

        if (status) {
            query.status = Number(status)
        }

        if (clientId) {
            query.clientId = clientId
        }

        if (search) {
            const re = { $regex: escapeRegex(search), $options: "i" }
            query.$or = [
                { title: re },
                { companyName: re },
                { description: re },
            ]
        }

        // Date range on createdAt — `to` is treated as end-of-day inclusive.
        if (from || to) {
            const createdAt: Record<string, Date> = {}
            if (from) {
                const f = new Date(from)
                if (!isNaN(f.getTime())) createdAt.$gte = f
            }
            if (to) {
                const t = new Date(to)
                if (!isNaN(t.getTime())) {
                    t.setHours(23, 59, 59, 999)
                    createdAt.$lte = t
                }
            }
            if (Object.keys(createdAt).length > 0) {
                query.createdAt = createdAt
            }
        }

        const skip = (page - 1) * limit

        const sortOption: Record<string, SortOrder> =
            sort === "oldest"
                ? { createdAt: 1 }
                : { createdAt: -1 }

        const [data, total] = await Promise.all([
            Project.find(query)
                .populate("clientId", "name company") // useful for UI
                .populate("createdBy", "name email")
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean(),

            Project.countDocuments(query)
        ])

        return NextResponse.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        })
    } catch (error : any) {

        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            { success: false, message: "Failed to fetch projects" },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        const authUser = await requireRole(req, [10, 60, 70, 45])

        await dbConnect()

        const body = await req.json()

        if (!body.clientId || !body.title) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        const { clientId, title, description, serviceType, budget, status } = body

        const project = await auditedCreate(
            Project,
            ENTITY_TYPE.PROJECT,
            {
                clientId,
                title,
                description,
                serviceType,
                budget,
                status,
                createdBy: authUser.id,
            },
            authUser.id
        )

        const clientName = await resolveParentName(ENTITY_TYPE.CLIENT, String(clientId))
        await emitNotification({
            type: EVENT_CODE.PROJECT_CREATED,
            entityType: ENTITY_TYPE.PROJECT,
            entityId: project._id,
            actor: { id: authUser.id, name: (authUser as any).name, role: authUser.role },
            payload: { project: { _id: project._id, title: project.title }, clientName },
        })

        return NextResponse.json(
            { success: true, data: project },
            { status: 201 }
        )
    } catch(error : any) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            { success: false, message: "Failed to create project" },
            { status: 500 }
        )
    }
}