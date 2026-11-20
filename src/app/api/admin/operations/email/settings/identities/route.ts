import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ADMIN_ROLES } from "@/constants/emailRoles"
import EmailSenderIdentity, {
    type IEmailSenderIdentity,
} from "@/models/EmailSenderIdentity"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import {
    EmailError,
    errorResponse,
    isObjectId,
    readJson,
    readString,
    requireString,
} from "@/lib/email/http"
import { serializeIdentity } from "@/lib/email/settings/serialize"

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * POST /api/admin/operations/email/settings/identities
 *
 * Adds or updates a sender identity: who a campaign appears to come from.
 *
 * `postalAddress` is required. CAN-SPAM needs a real postal address in
 * every marketing email, and most providers read a missing one as a spam
 * signal. The model requires it too, so a campaign can never be sent from
 * an identity without one.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_ADMIN_ROLES)
        await dbConnect()

        const region = resolveWriteRegion(undefined, user)
        const body = await readJson(req)

        const fromName = requireString(body, "fromName", "The sender name", 100)
        const fromEmail = requireString(
            body,
            "fromEmail",
            "The sender address",
            255
        ).toLowerCase()
        const postalAddress = requireString(
            body,
            "postalAddress",
            "A postal address",
            500
        )

        if (!EMAIL_SHAPE.test(fromEmail)) {
            throw new EmailError("That sender address is not valid.", 400, {
                field: "fromEmail",
            })
        }

        const replyTo = readString(body, "replyTo", 255)?.toLowerCase()
        if (replyTo && !EMAIL_SHAPE.test(replyTo)) {
            throw new EmailError("That reply-to address is not valid.", 400, {
                field: "replyTo",
            })
        }

        const isDefault = Boolean(body.isDefault)

        // Only one default per region. Clear the old one first, so a
        // campaign form never finds two.
        if (isDefault) {
            await EmailSenderIdentity.updateMany(
                { region },
                { $set: { isDefault: false } }
            )
        }

        const verified = Boolean(body.verified)

        const saved = await EmailSenderIdentity.findOneAndUpdate(
            { region, fromEmail },
            {
                $set: {
                    fromName,
                    postalAddress,
                    replyTo,
                    isDefault,
                    verifiedAt: verified ? new Date() : null,
                    verifiedBy: verified ? user.id : undefined,
                    verificationNote: readString(body, "verificationNote", 500),
                },
                $setOnInsert: { region, fromEmail, createdBy: user.id },
            },
            { upsert: true, returnDocument: "after", runValidators: true }
        ).lean<IEmailSenderIdentity>()

        if (!saved) {
            throw new EmailError("The sender identity could not be saved.", 500)
        }

        return NextResponse.json({
            success: true,
            data: serializeIdentity(saved),
        })
    } catch (error) {
        return errorResponse(error, "Failed to save the sender identity")
    }
}

/**
 * DELETE /api/admin/operations/email/settings/identities?id=...
 *
 * Soft deletes an identity. A campaign that already points at it keeps
 * working, because the campaign holds the id and the row is still there.
 */
export async function DELETE(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_ADMIN_ROLES)
        await dbConnect()

        const id = new URL(req.url).searchParams.get("id")
        if (!isObjectId(id)) {
            throw new EmailError("Which identity?", 400, { field: "id" })
        }

        const row = await EmailSenderIdentity.findById(id)
        if (!row) {
            throw new EmailError("That sender identity was not found.", 404)
        }

        row.deletedAt = new Date()
        row.deletedBy = user.id as never
        row.isDefault = false
        await row.save()

        return NextResponse.json({ success: true, data: { _id: String(row._id) } })
    } catch (error) {
        return errorResponse(error, "Failed to remove the sender identity")
    }
}
