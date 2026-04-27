import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import dbConnect from "@/lib/db/dbConnect"

import Lead from "@/models/Lead"
import Client from "@/models/Client"

import { LEAD_STATUS } from "@/constants/leadStatus"
import { CLIENT_STATUS } from "@/constants/clientStatus"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const session = await mongoose.startSession()

    try {
        await requireRole(req, [10, 60])
        await dbConnect()

        const { id } = await context.params
        const body = await req.json()

        if (!body.company) {
            return NextResponse.json(
                { success: false, message: "Company is required" },
                { status: 400 }
            )
        }

        const lead = await Lead.findById(id)

        if (!lead) {
            return NextResponse.json(
                { success: false, message: "Lead not found" },
                { status: 404 }
            )
        }

        if (lead.convertedClientId) {
            return NextResponse.json(
                { success: false, message: "Lead already converted" },
                { status: 400 }
            )
        }

        if (lead.status < 50 || lead.status > 59) {
            return NextResponse.json(
                { success: false, message: "Lead not eligible for conversion" },
                { status: 400 }
            )
        }

        const existingClient = await Client.findOne({ phone: lead.phone })
        if (existingClient) {
            return NextResponse.json(
                { success: false, message: "Client already exists with this phone" },
                { status: 409 }
            )
        }

        session.startTransaction()

        const client = await Client.create(
            [
                {
                    name: lead.name,
                    company: body.company,
                    phone: lead.phone,
                    email: lead.email,
                    status: CLIENT_STATUS.ACTIVE,
                },
            ],
            { session }
        )

        const createdClient = client[0]

        lead.status = LEAD_STATUS.CONVERTED
        lead.convertedClientId = createdClient._id
        await lead.save({ session })

        await session.commitTransaction()

        return NextResponse.json(
            { success: true, data: { clientId: createdClient._id } },
            { status: 201 }
        )
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction()
        }

        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        return NextResponse.json(
            { success: false, message: "Conversion failed" },
            { status: 500 }
        )
    } finally {
        session.endSession()
    }
}