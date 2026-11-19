import { NextRequest, NextResponse } from "next/server"
import type { Types } from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import {
    EMAIL_ACCESS_ROLES,
    EMAIL_AUTHOR_ROLES,
    EMAIL_MANAGE_ROLES,
} from "@/constants/emailRoles"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import CampaignRecipient, {
    type ICampaignRecipient,
} from "@/models/CampaignRecipient"
import {
    EmailError,
    errorResponse,
    isObjectId,
    readJson,
    readString,
} from "@/lib/email/http"
import { CAMPAIGN_STATUS, RECIPIENT_STATUS, isRecipientStatus } from "@/constants/emailStatus"
import { serializeCampaign } from "@/lib/email/campaign/serialize"
import { recountCampaign } from "@/lib/email/campaign/close"

/**
 * GET: one campaign, with a page of its recipients.
 *
 * The counters on the campaign are kept with `$inc` and can drift by a
 * few while a send is running. For a campaign that has finished they are
 * recomputed, so a report that somebody will act on is always exact.
 *
 * Query: recipientStatus, page, limit.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const campaign = await load((await params).id)
        const campaignId = campaign._id as Types.ObjectId

        const search = new URL(req.url).searchParams
        const rawStatus = Number(search.get("recipientStatus"))
        const status = isRecipientStatus(rawStatus) ? rawStatus : null
        const page = Math.max(1, Math.floor(Number(search.get("page"))) || 1)
        const limit = Math.min(
            200,
            Math.max(1, Math.floor(Number(search.get("limit"))) || 50)
        )

        const filter: Record<string, unknown> = { campaignId }
        if (status !== null) filter.status = status

        const [recipients, recipientTotal, byStatus] = await Promise.all([
            CampaignRecipient.find(filter)
                .sort({ finishedAt: -1, _id: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select(
                    "email name status attempts lastError lastSmtpCode " +
                    "submittedAt finishedAt openCount clickCount sourceType"
                )
                .lean<ICampaignRecipient[]>(),
            CampaignRecipient.countDocuments(filter),
            CampaignRecipient.aggregate<{ _id: number; n: number }>([
                { $match: { campaignId } },
                { $group: { _id: "$status", n: { $sum: 1 } } },
            ]),
        ])

        // Finished campaigns get exact numbers; running ones keep the fast
        // denormalised ones, which are good enough for a progress bar.
        const finished =
            campaign.status === CAMPAIGN_STATUS.COMPLETED ||
            campaign.status === CAMPAIGN_STATUS.COMPLETED_WITH_FAILURES ||
            campaign.status === CAMPAIGN_STATUS.CANCELLED

        const fresh = finished
            ? ((await recountCampaign(campaignId)),
              await EmailCampaign.findById(campaignId).lean<IEmailCampaign>())
            : campaign

        return NextResponse.json({
            success: true,
            data: {
                campaign: serializeCampaign(fresh ?? campaign),
                recipients: recipients.map((r) => ({
                    _id: String(r._id),
                    email: r.email,
                    name: r.name ?? "",
                    status: r.status,
                    attempts: r.attempts,
                    lastError: r.lastError ?? "",
                    lastSmtpCode: r.lastSmtpCode ?? null,
                    submittedAt: r.submittedAt?.toISOString() ?? null,
                    finishedAt: r.finishedAt?.toISOString() ?? null,
                    openCount: r.openCount ?? 0,
                    clickCount: r.clickCount ?? 0,
                    sourceType: r.sourceType,
                })),
                recipientPagination: {
                    page,
                    limit,
                    total: recipientTotal,
                    pages: Math.max(1, Math.ceil(recipientTotal / limit)),
                },
                recipientCounts: Object.fromEntries(
                    byStatus.map((r) => [String(r._id), r.n])
                ),
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the campaign")
    }
}

/**
 * PATCH: edits a draft.
 *
 * Only a draft. Once a campaign is scheduled its content is fixed, because
 * the recipient count and the preview somebody approved were for that
 * content. To change it, unschedule first.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, EMAIL_AUTHOR_ROLES)
        await dbConnect()

        const campaign = await load((await params).id)

        if (campaign.status !== CAMPAIGN_STATUS.DRAFT) {
            throw new EmailError(
                "Only a draft can be edited. Unschedule this campaign first.",
                409
            )
        }

        const body = await readJson(req)
        const updates: Record<string, unknown> = {}

        const name = readString(body, "name", 200)
        if (name && name !== campaign.name) {
            const clash = await EmailCampaign.findOne({
                region: campaign.region,
                name,
                _id: { $ne: campaign._id },
            })
            if (clash) {
                throw new EmailError(
                    `A campaign called "${name}" already exists.`,
                    409,
                    { field: "name" }
                )
            }
            updates.name = name
        }

        for (const field of ["description", "subject", "preheader"] as const) {
            if (body[field] !== undefined) {
                updates[field] = readString(body, field, 1000) ?? ""
            }
        }

        for (const field of [
            "templateId",
            "templateVersionId",
            "senderIdentityId",
            "audienceId",
        ] as const) {
            if (body[field] !== undefined) {
                if (body[field] === null) updates[field] = undefined
                else if (isObjectId(body[field])) updates[field] = body[field]
                else {
                    throw new EmailError(`${field} is not valid.`, 400, {
                        field,
                    })
                }
            }
        }

        if (body.mergeFallbacks && typeof body.mergeFallbacks === "object") {
            const entries = Object.entries(
                body.mergeFallbacks as Record<string, unknown>
            )
                .filter(([, v]) => typeof v === "string")
                .slice(0, 30)
            updates.mergeFallbacks = Object.fromEntries(entries)
        }

        if (Object.keys(updates).length === 0) {
            throw new EmailError("Nothing to change.", 400)
        }

        await EmailCampaign.updateOne({ _id: campaign._id }, { $set: updates })

        const fresh = await EmailCampaign.findById(
            campaign._id
        ).lean<IEmailCampaign>()

        return NextResponse.json({
            success: true,
            data: serializeCampaign(fresh ?? campaign),
        })
    } catch (error) {
        return errorResponse(error, "Failed to save the campaign")
    }
}

/**
 * DELETE: soft deletes a campaign, and its recipient rows with it.
 *
 * Refused once anything has been sent. A campaign that reached real people
 * is a record of what they were sent, and deleting it would leave a reply
 * or a complaint with nothing to explain it.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireRole(req, EMAIL_MANAGE_ROLES)
        await dbConnect()

        const campaign = await load((await params).id)
        const campaignId = campaign._id as Types.ObjectId

        const sent = await CampaignRecipient.countDocuments({
            campaignId,
            status: {
                $in: [
                    RECIPIENT_STATUS.SUBMITTED,
                    RECIPIENT_STATUS.DELIVERED,
                    RECIPIENT_STATUS.BOUNCED,
                    RECIPIENT_STATUS.UNKNOWN_OUTCOME,
                ],
            },
        })

        if (sent > 0) {
            throw new EmailError(
                `This campaign reached ${sent} recipient${sent === 1 ? "" : "s"}, ` +
                "so it is a record of mail that was sent. Archive it instead.",
                409
            )
        }

        await EmailCampaign.updateOne(
            { _id: campaignId },
            { $set: { deletedAt: new Date(), deletedBy: user.id } }
        )

        // Nothing was sent, so these rows describe nothing that happened.
        await CampaignRecipient.deleteMany({ campaignId })

        return NextResponse.json({
            success: true,
            data: { _id: String(campaignId) },
        })
    } catch (error) {
        return errorResponse(error, "Failed to delete the campaign")
    }
}

async function load(id: string): Promise<IEmailCampaign> {
    if (!isObjectId(id)) {
        throw new EmailError("That campaign was not found.", 404)
    }

    const campaign = await EmailCampaign.findById(id).lean<IEmailCampaign>()

    if (!campaign) {
        throw new EmailError("That campaign was not found.", 404)
    }

    return campaign
}
