import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Client from "@/models/Client"
import { SortOrder } from "mongoose"
import { requireAuth } from "@/lib/auth/requireAuth"
import { requireRole } from "@/lib/auth/requireRole"
import { auditedCreate } from "@/lib/activity-log"
import { AuthError } from "@/lib/auth/requireAuth"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { notifyEvent } from "@/lib/notifications/dispatch"
import { EVENT_CODE } from "@/constants/eventTypes"
import { ENTITY_TYPE } from "@/constants/entityTypes"

export async function GET(req: NextRequest) {
    try {

        await requireRole(req, [10, 60, 70, 45, 50])

        await dbConnect()

        const { searchParams } = new URL(req.url)

        const page = Number(searchParams.get("page")) || 1
        const limit = Number(searchParams.get("limit")) || 10
        const status = searchParams.get("status")
        const search = searchParams.get("search")
        const from = searchParams.get("from")
        const to = searchParams.get("to")
        const sort = searchParams.get("sort") || "latest"

        const query: any = {}

        if (status) {
            query.status = Number(status)
        }

        if (search) {
            const re = { $regex: escapeRegex(search), $options: "i" }
            query.$or = [
                { name: re },
                { company: re },
                { email: re },
                { phone: re },
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
            Client.find(query)
                .populate("createdBy", "name email role")
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean(),

            Client.countDocuments(query)
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
    } catch (error: any) {

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
            { success: false, message: "Failed to fetch clients" },
            { status: 500 }
        )
    }
}

export async function POST(req: NextRequest) {
    try {
        const authUser = await requireRole(req, [10, 60, 45, 70])

        await dbConnect()

        const body = await req.json()

        if (!body.name || !body.company || !body.phone) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        const existing = await Client.findOne({ phone: body.phone })

        if (existing) {
            return NextResponse.json(
                { success: false, message: "Phone already exists" },
                { status: 409 }
            )
        }

        const client = await auditedCreate(
            Client,
            1,
            body,
            authUser.id
        )

        await notifyEvent({
            type: EVENT_CODE.CLIENT_CREATED,
            entityType: ENTITY_TYPE.CLIENT,
            entityId: client._id,
            actor: { id: authUser.id, name: (authUser as any).name, role: authUser.role },
            payload: { client: { _id: client._id, name: client.name, company: client.company } },
        })

        return NextResponse.json(
            { success: true, data: client },
            { status: 201 }
        )
    } catch (error: any) {
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
            { success: false, message: "Failed to create client" },
            { status: 500 }
        )
    }
}