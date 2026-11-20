import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ACCESS_ROLES, EMAIL_AUTHOR_ROLES } from "@/constants/emailRoles"
import EmailAudience, { type IEmailAudience } from "@/models/EmailAudience"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import {
    EmailError,
    errorResponse,
    readJson,
    readString,
    requireString,
} from "@/lib/email/http"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { parseAudienceRules } from "@/lib/email/audience/parseRules"
import { previewAudience } from "@/lib/email/audience/preview"
import { serializeAudience } from "@/lib/email/audience/serialize"

/**
 * GET /api/admin/operations/email/audiences
 *
 * Saved audiences, newest first.
 *
 * `lastCount` is shown with the date it was taken, because an audience is
 * a definition rather than a list: the number moves as leads are added.
 * Showing it without the date would be a quietly stale figure.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const params = new URL(req.url).searchParams
        const search = (params.get("search") ?? "").trim().slice(0, 100)
        const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1)
        const limit = Math.min(
            100,
            Math.max(1, Math.floor(Number(params.get("limit"))) || 30)
        )

        const filter: Record<string, unknown> = {}
        if (search) {
            const re = { $regex: escapeRegex(search), $options: "i" }
            filter.$or = [{ name: re }, { description: re }]
        }

        const [rows, total] = await Promise.all([
            EmailAudience.find(filter)
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<IEmailAudience[]>(),
            EmailAudience.countDocuments(filter),
        ])

        return NextResponse.json({
            success: true,
            data: rows.map(serializeAudience),
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the audiences")
    }
}

/**
 * POST /api/admin/operations/email/audiences
 *
 * Saves a reusable audience.
 *
 * The count is taken once, here, and stored with its timestamp. It is for
 * the list screen only; a campaign always recounts when it starts, because
 * the number that matters is the one at send time.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_AUTHOR_ROLES)
        await dbConnect()

        const region = resolveWriteRegion(undefined, user)
        const body = await readJson(req)

        const name = requireString(body, "name", "A name for the audience", 200)

        const clash = await EmailAudience.findOne({ region, name })
        if (clash) {
            throw new EmailError(
                `An audience called "${name}" already exists.`,
                409,
                { field: "name" }
            )
        }

        const rules = parseAudienceRules(body.rules)
        const preview = await previewAudience(rules, { region })

        const audience = await EmailAudience.create({
            region,
            name,
            description: readString(body, "description", 1000),
            rules,
            lastCount: preview.eligibleTotal,
            lastCountedAt: new Date(),
            createdBy: user.id,
        })

        return NextResponse.json(
            {
                success: true,
                data: {
                    ...serializeAudience(audience.toObject() as IEmailAudience),
                    preview,
                },
            },
            { status: 201 }
        )
    } catch (error) {
        return errorResponse(error, "Failed to save the audience")
    }
}
