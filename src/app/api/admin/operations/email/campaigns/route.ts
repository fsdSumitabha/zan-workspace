import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ACCESS_ROLES, EMAIL_AUTHOR_ROLES } from "@/constants/emailRoles"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
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
import { escapeRegex } from "@/lib/search/escapeRegex"
import {
    CAMPAIGN_STATUS,
    CAMPAIGN_STATUSES,
    isCampaignStatus,
} from "@/constants/emailStatus"
import { defaultFallbacks } from "@/lib/email/personalise/tokens"
import { serializeCampaign } from "@/lib/email/campaign/serialize"

/**
 * GET /api/admin/operations/email/campaigns
 *
 * One page of campaigns plus the count for every status tab, so the tabs
 * and the rows arrive together. Same shape as the lead sources list.
 *
 * Query: status, search, mine, page, limit.
 */
export async function GET(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const params = new URL(req.url).searchParams
        const rawStatus = Number(params.get("status"))
        const status = isCampaignStatus(rawStatus) ? rawStatus : null
        const search = (params.get("search") ?? "").trim().slice(0, 100)
        const mine = params.get("mine") === "1"

        const page = Math.min(
            100_000,
            Math.max(1, Math.floor(Number(params.get("page"))) || 1)
        )
        const limit = Math.min(
            100,
            Math.max(1, Math.floor(Number(params.get("limit"))) || 25)
        )

        const filter: Record<string, unknown> = {}

        // Archived is a tab of its own. Without this an archived campaign
        // would sit in the main list for ever.
        if (status !== null) filter.status = status
        else filter.status = { $ne: CAMPAIGN_STATUS.ARCHIVED }

        if (mine) filter.createdBy = user.id

        if (search) {
            const re = { $regex: escapeRegex(search), $options: "i" }
            filter.$or = [{ name: re }, { subject: re }]
        }

        const [rows, total, byStatus] = await Promise.all([
            EmailCampaign.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<IEmailCampaign[]>(),
            EmailCampaign.countDocuments(filter),
            EmailCampaign.aggregate<{ _id: number; n: number }>([
                { $group: { _id: "$status", n: { $sum: 1 } } },
            ]),
        ])

        const counts: Record<string, number> = {}
        for (const code of CAMPAIGN_STATUSES) counts[String(code)] = 0
        for (const row of byStatus) counts[String(row._id)] = row.n

        return NextResponse.json({
            success: true,
            data: rows.map(serializeCampaign),
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
            counts,
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the campaigns")
    }
}

/**
 * POST /api/admin/operations/email/campaigns
 *
 * Creates a draft. Nothing is scheduled and nothing is sent; that is the
 * action route's job, and it is deliberately a separate step.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_AUTHOR_ROLES)
        await dbConnect()

        const region = resolveWriteRegion(undefined, user)
        const body = await readJson(req)

        const name = requireString(body, "name", "A campaign name", 200)

        const clash = await EmailCampaign.findOne({ region, name })
        if (clash) {
            throw new EmailError(
                `A campaign called "${name}" already exists.`,
                409,
                { field: "name" }
            )
        }

        // The default sender, so a new campaign is nearly ready rather than
        // demanding four choices before anything can be typed.
        const identity = await EmailSenderIdentity.findOne({ region })
            .sort({ isDefault: -1, createdAt: 1 })
            .lean<IEmailSenderIdentity>()

        const campaign = await EmailCampaign.create({
            region,
            name,
            description: readString(body, "description", 1000),
            subject: readString(body, "subject", 300) ?? "",
            preheader: readString(body, "preheader", 300),
            status: CAMPAIGN_STATUS.DRAFT,
            senderIdentityId: identity?._id,
            templateId: isObjectId(body.templateId) ? body.templateId : undefined,
            templateVersionId: isObjectId(body.templateVersionId)
                ? body.templateVersionId
                : undefined,
            audienceId: isObjectId(body.audienceId) ? body.audienceId : undefined,
            mergeFallbacks: defaultFallbacks(),
            createdBy: user.id,
        })

        return NextResponse.json(
            {
                success: true,
                data: serializeCampaign(campaign.toObject() as IEmailCampaign),
            },
            { status: 201 }
        )
    } catch (error) {
        return errorResponse(error, "Failed to create the campaign")
    }
}
