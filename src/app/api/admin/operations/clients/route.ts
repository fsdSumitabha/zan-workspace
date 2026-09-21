import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Client from "@/models/Client"
import { SortOrder } from "mongoose"
import { requireAuth } from "@/lib/auth/requireAuth"
import { requireRole } from "@/lib/auth/requireRole"
import { auditedCreate } from "@/lib/activity-log"
import { AuthError } from "@/lib/auth/requireAuth"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { emitNotification } from "@/lib/notifications/emit"
import { EVENT_CODE } from "@/constants/eventTypes"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { phoneLookupCondition, validatePhone } from "@/lib/phone"
import { getRegion } from "@/lib/region"
import { resolveWriteRegion, RegionChoiceError } from "@/lib/region-scope/resolveWriteRegion"

export async function GET(req: NextRequest) {
    try {

        await requireRole(req, [10, 15, 50, 60, 69, 70, 45])

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
        const authUser = await requireRole(req, [10, 15, 60, 69, 45, 70])

        await dbConnect()

        const body = await req.json()

        if (!body.name || !body.company) {
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
        body.phone = check.e164

        const existing = await Client.findOne({
            phone: phoneLookupCondition(body.phone, phoneCountry)
        })

        if (existing) {
            return NextResponse.json(
                { success: false, message: "Another client already has this phone number.", field: "phone" },
                { status: 409 }
            )
        }

        // `body` is spread into the document, so `region` has to be
        // replaced with a checked value. Otherwise a request could name
        // any region and it would be saved as sent.
        const region = resolveWriteRegion(body.region, authUser)

        const client = await auditedCreate(
            Client,
            1,
            { ...body, region },
            authUser.id
        )

        await emitNotification({
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