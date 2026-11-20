import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { runWithoutRegionScope } from "@/lib/region-scope"
import { EmailError, errorResponse, isObjectId } from "@/lib/email/http"
import { requireJobSecret } from "@/lib/email/jobs/auth"
import { runWorker } from "@/lib/email/jobs/worker"

/**
 * POST /api/jobs/email/work
 *
 * Sends a bounded set of a campaign's recipients.
 *
 * ## Safe to call twice
 *
 * Every adapter is at-least-once, so this will sometimes be invoked twice
 * for the same signal. That is fine: claiming is atomic, and a second
 * worker simply finds nothing left to claim and returns. Nobody is sent
 * two copies because of a duplicate wake-up.
 *
 * ## It runs outside the region scope
 *
 * Like the dispatcher, this is a system process with no signed-in person.
 * An empty region context matches nothing on purpose, so the work has to
 * run inside the documented bypass.
 */
export async function POST(req: NextRequest) {
    const startedAt = Date.now()

    try {
        requireJobSecret(req)

        const body = await req.json().catch(() => null)
        const campaignId = body?.campaignId

        if (!isObjectId(campaignId)) {
            throw new EmailError("campaignId is required.", 400)
        }

        const hop = Number(body?.hop) || 0

        // A chain that will not end. Each worker increments the hop, so a
        // loop shows up as a rising number rather than as a quiet drain on
        // the function allowance.
        if (hop > 200) {
            throw new EmailError(
                `Refusing to continue: ${hop} workers have chained for this ` +
                "campaign. Something is wrong with the delivery loop.",
                409
            )
        }

        await dbConnect()

        const result = await runWithoutRegionScope(() =>
            runWorker({ campaignId, hop })
        )

        return NextResponse.json({
            success: true,
            data: { ...result, totalMs: Date.now() - startedAt },
        })
    } catch (error) {
        return errorResponse(error, "The worker failed")
    }
}

export const maxDuration = 300
export const dynamic = "force-dynamic"
