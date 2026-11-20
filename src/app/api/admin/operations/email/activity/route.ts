import { NextRequest, NextResponse } from "next/server"
import { Types } from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ACCESS_ROLES } from "@/constants/emailRoles"
import EmailDeliveryAttempt, {
    type IEmailDeliveryAttempt,
} from "@/models/EmailDeliveryAttempt"
import CampaignRecipient, {
    type ICampaignRecipient,
} from "@/models/CampaignRecipient"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import { errorResponse, isObjectId } from "@/lib/email/http"
import { ATTEMPT_OUTCOME, ERROR_CLASS } from "@/constants/emailStatus"

/**
 * GET /api/admin/operations/email/activity
 *
 * Every send attempt, newest first. This is what somebody opens when a
 * campaign looks wrong and they need to know what the mail server actually
 * said.
 *
 * ## Why it matters more on Vercel Hobby
 *
 * Hobby keeps runtime logs for one hour. A campaign that ran this morning
 * has no platform logs left, so this collection is the only record. It
 * holds 90 days.
 *
 * Query: campaign, outcome, errorClass, search, hours, page, limit.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const params = new URL(req.url).searchParams

        const campaignId = params.get("campaign")
        const rawOutcome = Number(params.get("outcome"))
        const rawClass = Number(params.get("errorClass"))
        const search = (params.get("search") ?? "").trim().slice(0, 120)
        const hours = Math.min(
            24 * 90,
            Math.max(1, Math.floor(Number(params.get("hours"))) || 24 * 7)
        )

        const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1)
        const limit = Math.min(
            200,
            Math.max(1, Math.floor(Number(params.get("limit"))) || 50)
        )

        const filter: Record<string, unknown> = {
            startedAt: { $gte: new Date(Date.now() - hours * 60 * 60 * 1_000) },
        }

        if (isObjectId(campaignId)) {
            filter.campaignId = new Types.ObjectId(campaignId)
        }

        if (Object.values(ATTEMPT_OUTCOME).includes(rawOutcome as never)) {
            filter.outcome = rawOutcome
        }

        if (Object.values(ERROR_CLASS).includes(rawClass as never)) {
            filter.errorClass = rawClass
        }

        // Searching by address means finding the recipients first: the
        // attempt row holds an id, not an address, so that one row is not
        // a copy of the recipient's details.
        if (search) {
            const recipients = await CampaignRecipient.find({
                emailNormalized: { $regex: escape(search.toLowerCase()) },
            })
                .select("_id")
                .limit(500)
                .lean<{ _id: Types.ObjectId }[]>()

            filter.recipientId = { $in: recipients.map((r) => r._id) }
        }

        const [rows, total, byOutcome] = await Promise.all([
            EmailDeliveryAttempt.find(filter)
                .sort({ startedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<IEmailDeliveryAttempt[]>(),
            EmailDeliveryAttempt.countDocuments(filter),
            EmailDeliveryAttempt.aggregate<{ _id: number; n: number }>([
                { $match: filter },
                { $group: { _id: "$outcome", n: { $sum: 1 } } },
            ]),
        ])

        // The addresses and campaign names for this page only. Two queries
        // rather than one per row.
        const recipientIds = rows.map((r) => r.recipientId)
        const campaignIds = Array.from(
            new Set(rows.map((r) => String(r.campaignId)))
        )

        const [recipients, campaigns] = await Promise.all([
            CampaignRecipient.find({ _id: { $in: recipientIds } })
                .select("_id email")
                .lean<ICampaignRecipient[]>(),
            EmailCampaign.find({ _id: { $in: campaignIds } })
                .select("_id name")
                .lean<IEmailCampaign[]>(),
        ])

        const emailById = new Map(
            recipients.map((r) => [String(r._id), r.email])
        )
        const nameById = new Map(campaigns.map((c) => [String(c._id), c.name]))

        /**
         * Latency percentiles over the filtered window.
         *
         * Computed in the database rather than by pulling every row back:
         * the point of this screen is to work when there are a lot of rows.
         */
        const durations = await EmailDeliveryAttempt.find({
            ...filter,
            durationMs: { $gt: 0 },
        })
            .select("durationMs")
            .sort({ durationMs: 1 })
            .limit(10_000)
            .lean<{ durationMs: number }[]>()

        const values = durations.map((d) => d.durationMs)
        const at = (p: number) =>
            values.length === 0
                ? 0
                : values[Math.min(values.length - 1, Math.floor(values.length * p))]

        return NextResponse.json({
            success: true,
            data: rows.map((row) => ({
                _id: String(row._id),
                campaignId: String(row.campaignId),
                campaignName: nameById.get(String(row.campaignId)) ?? "",
                recipientId: String(row.recipientId),
                email: emailById.get(String(row.recipientId)) ?? "",
                attemptNo: row.attemptNo,
                workerId: row.workerId,
                startedAt: row.startedAt.toISOString(),
                durationMs: row.durationMs ?? null,
                outcome: row.outcome,
                smtpCode: row.smtpCode ?? null,
                smtpResponse: row.smtpResponse ?? "",
                errorClass: row.errorClass ?? null,
                errorMessage: row.errorMessage ?? "",
            })),
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
            counts: Object.fromEntries(byOutcome.map((o) => [String(o._id), o.n])),
            latency: {
                samples: values.length,
                p50: at(0.5),
                p95: at(0.95),
                p99: at(0.99),
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the delivery activity")
    }
}

/** Escapes a search term so it cannot act as a regular expression. */
function escape(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
