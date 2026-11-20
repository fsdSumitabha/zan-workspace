import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import Quotation from "@/models/Quotation"
import { requireRole } from "@/lib/auth/requireRole"
import { AuthError } from "@/lib/auth/requireAuth"
import { sendQuotationMail } from "@/services/quotationMail"

/**
 * POST /api/admin/operations/quotations/:id/send
 *
 * The "Try again" button, and the way to email a quotation that was created
 * before this existed.
 *
 * Nothing about the quotation itself changes, so there is no timeline entry
 * and no notification. Only the record of whether the email arrived is
 * updated. See src/services/quotationMail.ts.
 *
 * Sending twice is allowed on purpose. A salesperson who is not sure the
 * first one arrived should be able to send it again without asking anybody,
 * and `mail.attempts` keeps the count. The screen shows when it last went
 * and to which address, so a second send is a deliberate act rather than an
 * accident.
 *
 * The same roles as creating a quotation. Somebody who may raise a
 * quotation may send it.
 */
const QUOTATION_ROLES = [10, 15, 50, 60, 69, 70, 45]

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, QUOTATION_ROLES)
        await dbConnect()

        const { id } = await context.params
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, message: "Invalid quotation ID" },
                { status: 400 }
            )
        }

        // Region-scoped by regionScopePlugin on the model, so a quotation
        // from another region is simply not found.
        const quotation = await Quotation.findById(id)
        if (!quotation) {
            return NextResponse.json(
                { success: false, message: "Quotation not found" },
                { status: 404 }
            )
        }

        const mail = await sendQuotationMail(quotation)

        const fresh = await Quotation.findById(id)
            .select("mail")
            .lean<{ mail?: unknown }>()

        return NextResponse.json(
            {
                success: mail.status === "sent",
                message: mail.message,
                mail,
                data: { mail: fresh?.mail ?? null },
            },
            // 502: the request was fine, the mail server is the problem.
            { status: mail.status === "sent" ? 200 : 502 }
        )
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }
        console.error("QUOTATION SEND ERROR:", error)
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        )
    }
}
