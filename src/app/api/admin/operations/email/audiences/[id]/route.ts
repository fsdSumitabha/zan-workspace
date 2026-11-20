import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import {
    EMAIL_ACCESS_ROLES,
    EMAIL_AUTHOR_ROLES,
    EMAIL_MANAGE_ROLES,
} from "@/constants/emailRoles"
import EmailAudience, { type IEmailAudience } from "@/models/EmailAudience"
import EmailCampaign from "@/models/EmailCampaign"
import {
    EmailError,
    errorResponse,
    isObjectId,
    readJson,
    readString,
} from "@/lib/email/http"
import { parseAudienceRules } from "@/lib/email/audience/parseRules"
import { previewAudience } from "@/lib/email/audience/preview"
import { serializeAudience } from "@/lib/email/audience/serialize"

/** GET: one saved audience, with a fresh count. */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const audience = await load((await params).id)
        const preview = await previewAudience(audience.rules, {
            region: audience.region,
        })

        return NextResponse.json({
            success: true,
            data: { ...serializeAudience(audience), preview },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the audience")
    }
}

/** PATCH: rename, re-describe or change the rules. */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, EMAIL_AUTHOR_ROLES)
        await dbConnect()

        const audience = await load((await params).id)
        const body = await readJson(req)

        const updates: Record<string, unknown> = {}

        const name = readString(body, "name", 200)
        if (name && name !== audience.name) {
            const clash = await EmailAudience.findOne({
                region: audience.region,
                name,
                _id: { $ne: audience._id },
            })
            if (clash) {
                throw new EmailError(
                    `An audience called "${name}" already exists.`,
                    409,
                    { field: "name" }
                )
            }
            updates.name = name
        }

        if (body.description !== undefined) {
            updates.description = readString(body, "description", 1000) ?? ""
        }

        let preview
        if (body.rules !== undefined) {
            const rules = parseAudienceRules(body.rules)
            preview = await previewAudience(rules, {
                region: audience.region,
            })
            updates.rules = rules
            updates.lastCount = preview.eligibleTotal
            updates.lastCountedAt = new Date()
        }

        if (Object.keys(updates).length === 0) {
            throw new EmailError("Nothing to change.", 400)
        }

        await EmailAudience.updateOne({ _id: audience._id }, { $set: updates })

        const fresh = await load(String(audience._id))

        return NextResponse.json({
            success: true,
            data: { ...serializeAudience(fresh), preview },
        })
    } catch (error) {
        return errorResponse(error, "Failed to save the audience")
    }
}

/**
 * DELETE: soft deletes an audience.
 *
 * Refused while a campaign still points at it. A campaign keeps its own
 * recipient snapshot, so deleting would not change what was sent, but the
 * report links back here to explain who was targeted and why.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireRole(req, EMAIL_MANAGE_ROLES)
        await dbConnect()

        const audience = await load((await params).id)

        const used = await EmailCampaign.countDocuments({
            audienceId: audience._id,
        })
        if (used > 0) {
            throw new EmailError(
                `This audience is used by ${used} campaign${used === 1 ? "" : "s"}. ` +
                "Their reports link to it, so it cannot be removed.",
                409
            )
        }

        await EmailAudience.updateOne(
            { _id: audience._id },
            { $set: { deletedAt: new Date(), deletedBy: user.id } }
        )

        return NextResponse.json({
            success: true,
            data: { _id: String(audience._id) },
        })
    } catch (error) {
        return errorResponse(error, "Failed to remove the audience")
    }
}

async function load(id: string): Promise<IEmailAudience> {
    if (!isObjectId(id)) {
        throw new EmailError("That audience was not found.", 404)
    }

    const row = await EmailAudience.findById(id).lean<IEmailAudience>()
    if (!row) {
        throw new EmailError("That audience was not found.", 404)
    }

    return row
}
