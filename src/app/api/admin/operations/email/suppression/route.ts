import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import {
    EMAIL_ACCESS_ROLES,
    EMAIL_ADMIN_ROLES,
    EMAIL_MANAGE_ROLES,
} from "@/constants/emailRoles"
import EmailSuppression, {
    type IEmailSuppression,
} from "@/models/EmailSuppression"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import {
    EmailError,
    errorResponse,
    isObjectId,
    readJson,
    readString,
} from "@/lib/email/http"
import { escapeRegex } from "@/lib/search/escapeRegex"
import {
    SUPPRESSION_REASON,
    SUPPRESSION_REASONS,
    isSuppressionReason,
} from "@/constants/emailStatus"
import { splitPastedAddresses, readAddress } from "@/lib/email/audience/address"
import { serializeSuppression } from "@/lib/email/audience/serialize"

/**
 * GET /api/admin/operations/email/suppression
 *
 * The do-not-send list, newest first, with a count per reason.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const params = new URL(req.url).searchParams
        const search = (params.get("search") ?? "").trim().slice(0, 100)
        const rawReason = Number(params.get("reason"))
        const reason = isSuppressionReason(rawReason) ? rawReason : null

        const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1)
        const limit = Math.min(
            200,
            Math.max(1, Math.floor(Number(params.get("limit"))) || 50)
        )

        const filter: Record<string, unknown> = {}
        if (reason !== null) filter.reason = reason
        if (search) {
            filter.emailNormalized = {
                $regex: escapeRegex(search.toLowerCase()),
            }
        }

        const [rows, total, byReason] = await Promise.all([
            EmailSuppression.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<IEmailSuppression[]>(),
            EmailSuppression.countDocuments(filter),
            EmailSuppression.aggregate<{ _id: number; n: number }>([
                { $group: { _id: "$reason", n: { $sum: 1 } } },
            ]),
        ])

        return NextResponse.json({
            success: true,
            data: rows.map(serializeSuppression),
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
            counts: Object.fromEntries(byReason.map((r) => [r._id, r.n])),
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the suppression list")
    }
}

/**
 * POST /api/admin/operations/email/suppression
 *
 * Adds one or many addresses by hand. Accepts a pasted list.
 *
 * Adding is deliberately easy and open to managers. Taking an address off
 * the list is a different matter: see DELETE.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_MANAGE_ROLES)
        await dbConnect()

        const region = resolveWriteRegion(undefined, user)
        const body = await readJson(req)

        const raw =
            typeof body.emails === "string"
                ? body.emails
                : Array.isArray(body.emails)
                  ? body.emails.filter((e: unknown) => typeof e === "string").join("\n")
                  : typeof body.email === "string"
                    ? body.email
                    : ""

        const entries = splitPastedAddresses(raw)

        if (entries.length === 0) {
            throw new EmailError("Enter at least one email address.", 400, {
                field: "emails",
            })
        }

        const rawReason = Number(body.reason)
        const reason = SUPPRESSION_REASONS.includes(rawReason as never)
            ? rawReason
            : SUPPRESSION_REASON.MANUAL

        const note = readString(body, "note", 1000)

        let added = 0
        let alreadyThere = 0
        const invalid: string[] = []

        for (const entry of entries) {
            const { address, problem } = readAddress(entry, {
                allowRoleAddresses: true,
            })

            if (problem || !address) {
                invalid.push(entry.slice(0, 80))
                continue
            }

            // Upsert, because adding an address that is already suppressed
            // is not an error. It is somebody being careful.
            const result = await EmailSuppression.updateOne(
                { region, emailNormalized: address.normalized },
                {
                    $setOnInsert: {
                        region,
                        emailNormalized: address.normalized,
                        email: address.original,
                        reason,
                        note,
                        addedBy: user.id,
                    },
                },
                { upsert: true }
            )

            if (result.upsertedCount) added += 1
            else alreadyThere += 1
        }

        return NextResponse.json({
            success: true,
            data: { added, alreadyThere, invalid },
        })
    } catch (error) {
        return errorResponse(error, "Failed to update the suppression list")
    }
}

/**
 * DELETE /api/admin/operations/email/suppression?id=...
 *
 * Takes an address off the list. Admin only, and a real delete.
 *
 * ## Why this is the narrowest permission in the module
 *
 * Every other destructive action here is a soft delete. This one removes
 * the record that somebody asked not to be emailed, and the next campaign
 * will then send to them. An unsubscribe honoured for a month and then
 * quietly dropped is worse than one never recorded, so the action is kept
 * to admins and written to the activity log by the audit plugin.
 */
export async function DELETE(req: NextRequest) {
    try {
        await requireRole(req, EMAIL_ADMIN_ROLES)
        await dbConnect()

        const id = new URL(req.url).searchParams.get("id")
        if (!isObjectId(id)) {
            throw new EmailError("Which address?", 400, { field: "id" })
        }

        const row = await EmailSuppression.findById(id)
        if (!row) {
            throw new EmailError("That address is not on the list.", 404)
        }

        if (row.reason === SUPPRESSION_REASON.UNSUBSCRIBED) {
            throw new EmailError(
                "This person unsubscribed themselves. Their choice cannot be " +
                "undone from here. If they have asked to be added again, " +
                "delete this row directly in the database and record why.",
                409
            )
        }

        await EmailSuppression.deleteOne({ _id: row._id })

        return NextResponse.json({ success: true, data: { _id: id } })
    } catch (error) {
        return errorResponse(error, "Failed to update the suppression list")
    }
}
