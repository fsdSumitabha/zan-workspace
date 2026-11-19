import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import {
    EMAIL_ACCESS_ROLES,
    EMAIL_AUTHOR_ROLES,
    EMAIL_MANAGE_ROLES,
} from "@/constants/emailRoles"
import EmailContact, { type IEmailContact } from "@/models/EmailContact"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import {
    EmailError,
    errorResponse,
    isObjectId,
    readJson,
    readString,
} from "@/lib/email/http"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { readAddress } from "@/lib/email/audience/address"
import { serializeContact } from "@/lib/email/audience/serialize"

/**
 * GET /api/admin/operations/email/contacts
 *
 * Marketing contacts who are not Leads or Clients.
 *
 * Query: search, consent ("yes" or "no"), tag, page, limit.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const params = new URL(req.url).searchParams
        const search = (params.get("search") ?? "").trim().slice(0, 100)
        const consent = params.get("consent")
        const tag = (params.get("tag") ?? "").trim().slice(0, 40)

        const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1)
        const limit = Math.min(
            100,
            Math.max(1, Math.floor(Number(params.get("limit"))) || 50)
        )

        const filter: Record<string, unknown> = {}

        if (consent === "yes") filter.marketingConsent = true
        if (consent === "no") filter.marketingConsent = { $ne: true }
        if (tag) filter.tags = tag

        if (search) {
            const re = { $regex: escapeRegex(search), $options: "i" }
            filter.$or = [
                { email: re },
                { firstName: re },
                { lastName: re },
                { company: re },
            ]
        }

        const [rows, total, consented] = await Promise.all([
            EmailContact.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<IEmailContact[]>(),
            EmailContact.countDocuments(filter),
            EmailContact.countDocuments({ marketingConsent: true }),
        ])

        return NextResponse.json({
            success: true,
            data: rows.map(serializeContact),
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
            counts: { consented },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the contacts")
    }
}

/**
 * POST /api/admin/operations/email/contacts
 *
 * Adds or updates one contact by hand.
 *
 * Consent is explicit in the body and recorded with its source and the
 * time, because that is what has to be shown if anybody asks why they were
 * emailed.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_AUTHOR_ROLES)
        await dbConnect()

        const region = resolveWriteRegion(undefined, user)
        const body = await readJson(req)

        const { address, problem } = readAddress(body.email, {
            allowRoleAddresses: true,
        })

        if (problem || !address) {
            throw new EmailError("That email address is not valid.", 400, {
                field: "email",
            })
        }

        const consent = body.marketingConsent === true

        const saved = await EmailContact.findOneAndUpdate(
            { region, emailNormalized: address.normalized },
            {
                $set: {
                    email: address.original,
                    firstName: readString(body, "firstName", 100) ?? "",
                    lastName: readString(body, "lastName", 100) ?? "",
                    company: readString(body, "company", 200) ?? "",
                    marketingConsent: consent,
                    consentSource:
                        readString(body, "consentSource", 200) ?? "added by hand",
                    consentAt: consent ? new Date() : undefined,
                    consentWithdrawnAt: consent ? null : new Date(),
                    tags: Array.isArray(body.tags)
                        ? body.tags
                              .filter((t: unknown): t is string => typeof t === "string")
                              .map((t: string) => t.trim().slice(0, 40))
                              .filter(Boolean)
                              .slice(0, 10)
                        : [],
                },
                $setOnInsert: {
                    region,
                    emailNormalized: address.normalized,
                    createdBy: user.id,
                },
            },
            { upsert: true, returnDocument: "after", new: true, runValidators: true }
        ).lean<IEmailContact>()

        if (!saved) {
            throw new EmailError("The contact could not be saved.", 500)
        }

        return NextResponse.json(
            { success: true, data: serializeContact(saved) },
            { status: 201 }
        )
    } catch (error) {
        return errorResponse(error, "Failed to save the contact")
    }
}

/** DELETE: soft deletes one contact. */
export async function DELETE(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_MANAGE_ROLES)
        await dbConnect()

        const id = new URL(req.url).searchParams.get("id")
        if (!isObjectId(id)) {
            throw new EmailError("Which contact?", 400, { field: "id" })
        }

        const contact = await EmailContact.findById(id)
        if (!contact) {
            throw new EmailError("That contact was not found.", 404)
        }

        contact.deletedAt = new Date()
        contact.deletedBy = user.id as never
        await contact.save()

        return NextResponse.json({ success: true, data: { _id: id } })
    } catch (error) {
        return errorResponse(error, "Failed to remove the contact")
    }
}
