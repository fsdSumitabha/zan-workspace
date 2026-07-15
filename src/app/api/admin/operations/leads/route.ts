import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import { SortOrder } from "mongoose"
import { requireAuth } from "@/lib/auth/requireAuth"
import { requireRole } from "@/lib/auth/requireRole"
import { auditedCreate } from "@/lib/activity-log"
import { AuthError } from "@/lib/auth/requireAuth"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { emitNotification } from "@/lib/notifications/emit"
import { EVENT_CODE } from "@/constants/eventTypes"
import { ENTITY_TYPE } from "@/constants/entityTypes"

export async function GET(req: NextRequest) {
    try {
        await requireRole(req, [10, 15, 60, 70, 45, 50])

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
            Lead.find(query)
                .populate("createdBy", "name email role")
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean(),

            Lead.countDocuments(query)
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
        // 2. Handle auth errors properly
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
                message: "Failed to fetch leads"
            },
            { status: 500 }
        )
    }
}


export async function POST(req: NextRequest) {
    try {
        const authUser = await requireRole(req, [10, 15, 50, 60, 70, 45])

        await dbConnect()

        const body = await req.json()

        if (!body.name || !body.phone || !body.source) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        const existing = await Lead.findOne({ phone: body.phone })

        if (existing) {
            return NextResponse.json(
                { success: false, message: "Phone already exists" },
                { status: 409 }
            )
        }

        const { name, email, phone, source } = body

        const lead = await auditedCreate(
            Lead,
            0,
            {
                name,
                email,
                phone,
                source,
                createdBy: authUser.id,
            },
            authUser.id
        )

        await emitNotification({
            type: EVENT_CODE.LEAD_CREATED,
            entityType: ENTITY_TYPE.LEAD,
            entityId: lead._id,
            actor: { id: authUser.id, name: (authUser as any).name, role: authUser.role },
            payload: { lead: { _id: lead._id, name: lead.name, source: lead.source } },
        })

        return NextResponse.json(
            {
                success: true,
                data: lead
            },
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
            { success: false, message: "Failed to create lead" },
            { status: 500 }
        )
    }
}