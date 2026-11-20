import crypto from "crypto"
import { Types } from "mongoose"
import CampaignRecipient from "@/models/CampaignRecipient"
import EmailCampaign, { type IEmailCampaign } from "@/models/EmailCampaign"
import { RECIPIENT_STATUS } from "@/constants/emailStatus"
import { EmailError } from "@/lib/email/http"
import { resolveEligibleRecipients } from "@/lib/email/audience/preview"
import type { IAudienceRules } from "@/models/EmailAudience"

/**
 * Freezes a campaign's audience into recipient rows.
 *
 * ## The snapshot rule
 *
 * Once this has run, the campaign's recipients are fixed. Editing a lead
 * tomorrow does not change a campaign scheduled yesterday, and the count a
 * person approved is the count that is sent. Merge values are copied onto
 * each row here and never read from the CRM again.
 *
 * ## It is safe to run twice
 *
 * The unique index on { campaignId, emailNormalized } plus an unordered
 * bulk insert means a second run inserts nothing and errors on nothing.
 * That matters because the dispatcher can be interrupted between building
 * the rows and marking the campaign SENDING, and the next tick has to be
 * able to finish the job rather than give up or duplicate.
 */

export interface SnapshotResult {
    written: number
    /** Already present from an earlier, interrupted run. */
    alreadyThere: number
    total: number
    excluded: Record<string, number>
}

/** Mongo's duplicate key error. Expected here, not a failure. */
const DUPLICATE_KEY = 11000

/**
 * Only the two fields this needs, not a whole Mongoose document.
 *
 * Callers sometimes hold a `.lean()` result or a copy with a corrected
 * `_id`, and demanding the full Document type would force a cast at every
 * call site for no benefit.
 */
export interface SnapshotTarget {
    _id: Types.ObjectId
    region: IEmailCampaign["region"]
}

export async function buildSnapshot(
    campaign: SnapshotTarget,
    rules: IAudienceRules | null | undefined
): Promise<SnapshotResult> {
    const campaignId = campaign._id

    const { eligible, excluded } = await resolveEligibleRecipients(rules)

    if (eligible.length === 0) {
        throw new EmailError(
            "This campaign has no recipients. Check the audience: everyone " +
            "who matched was excluded, or nothing matched at all.",
            400
        )
    }

    const now = new Date()

    const docs = eligible.map((r) => ({
        region: campaign.region,
        campaignId,
        email: r.email,
        emailNormalized: r.emailNormalized,
        name: r.name,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        mergeData: r.mergeData,
        status: RECIPIENT_STATUS.QUEUED,
        attempts: 0,
        maxAttempts: 5,
        queuedAt: now,
        // Generated here so the pixel and click URLs can be built without
        // another write. HMAC of the ids, so it is neither guessable nor
        // reversible into a recipient id.
        trackingToken: buildTrackingToken(campaignId, r.emailNormalized),
    }))

    let written = 0

    try {
        // Unordered: one duplicate must not stop the other 99.
        const result = await CampaignRecipient.insertMany(docs, {
            ordered: false,
        })
        written = result.length
    } catch (error) {
        const err = error as { code?: number; writeErrors?: unknown[]; result?: { nInserted?: number } }

        // Every failure being a duplicate is the expected outcome of a
        // re-run. Anything else is a real problem.
        const writeErrors = (err.writeErrors ?? []) as Array<{ err?: { code?: number }; code?: number }>
        const allDuplicates =
            writeErrors.length > 0 &&
            writeErrors.every((w) => (w.err?.code ?? w.code) === DUPLICATE_KEY)

        if (!allDuplicates && err.code !== DUPLICATE_KEY) {
            throw error
        }

        written = docs.length - writeErrors.length
    }

    const total = await CampaignRecipient.countDocuments({ campaignId })

    // The counters the UI reads. Written once here rather than incremented
    // from zero, so a re-run corrects them instead of doubling them.
    await EmailCampaign.updateOne(
        { _id: campaignId },
        {
            $set: {
                "counts.total": total,
                "counts.queued": await CampaignRecipient.countDocuments({
                    campaignId,
                    status: RECIPIENT_STATUS.QUEUED,
                }),
                "counts.suppressed": excluded.suppressed + excluded.noConsent,
            },
        }
    )

    return {
        written,
        alreadyThere: total - written,
        total,
        excluded: excluded as unknown as Record<string, number>,
    }
}

/**
 * The token in an open pixel or click URL.
 *
 * HMAC of the campaign and the address, keyed with EMAIL_TRACKING_SECRET.
 * Not an ObjectId: a sequential id in a URL invites somebody to try the
 * next one, and a reversible one leaks who was emailed.
 *
 * Changing the secret invalidates old links. Counts already recorded are
 * kept, because they live on the recipient row rather than in the token.
 */
export function buildTrackingToken(
    campaignId: Types.ObjectId | string,
    emailNormalized: string
): string {
    const secret = process.env.EMAIL_TRACKING_SECRET

    if (!secret) {
        // A random token still works for this send; it just cannot be
        // re-derived later. Better than refusing to send, and the settings
        // screen warns that the variable is missing.
        return crypto.randomBytes(16).toString("hex")
    }

    return crypto
        .createHmac("sha256", secret)
        .update(`${campaignId}:${emailNormalized}`)
        .digest("hex")
        .slice(0, 32)
}
