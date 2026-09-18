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
import { validatePhone } from "@/lib/phone"
import { DUPLICATE_LEAD_MESSAGE, findLeadPhoneConflict } from "@/lib/leads/findLeadByPhone"
import { getRegion } from "@/lib/region"

export async function GET(req: NextRequest) {
    try {
        await requireRole(req, [10, 15, 50, 60, 65, 69, 70, 45])

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
            // Phones are saved as "+14155550142", so "(415) 555-0142"
            // only matches by its digits. Same rule as the global search.
            const digitsOnly = search.replace(/\D/g, "")
            if (digitsOnly.length >= 4) {
                query.$or.push({ phone: { $regex: escapeRegex(digitsOnly) } })
            }
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
        const authUser = await requireRole(req, [10, 15, 50, 60, 69, 70, 45])

        await dbConnect()

        const body = await req.json()

        if (!body.name || !body.source) {
            return NextResponse.json(
                { success: false, message: "Missing required fields" },
                { status: 400 }
            )
        }

        const { phoneCountry } = getRegion()
        const check = validatePhone(body.phone, phoneCountry)
        if (!check.ok) {
            return NextResponse.json(
                { success: false, message: check.message, field: "phone" },
                { status: 400 }
            )
        }
        const phone = check.e164

        const conflict = await findLeadPhoneConflict(phone, phoneCountry)
        if (conflict) {
            return NextResponse.json(
                { success: false, message: conflict, field: "phone" },
                { status: 409 }
            )
        }

        const { name, email, source } = body

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

        // Deleted leads are checked before the save. So a duplicate error
        // here means another request saved the same number at the same time.
        if (error?.code === 11000) {
            return NextResponse.json(
                { success: false, message: DUPLICATE_LEAD_MESSAGE, field: "phone" },
                { status: 409 }
            )
        }

        return NextResponse.json(
            { success: false, message: "Failed to create lead" },
            { status: 500 }
        )
    }
}