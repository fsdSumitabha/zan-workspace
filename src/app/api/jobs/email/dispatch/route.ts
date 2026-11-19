import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { errorResponse } from "@/lib/email/http"
import { requireJobSecret } from "@/lib/email/jobs/auth"
import { runDispatcher } from "@/lib/email/jobs/dispatcher"

/**
 * POST /api/jobs/email/dispatch
 *
 * The heartbeat's target. Starts due campaigns, wakes stalled ones,
 * expires dead leases and closes finished campaigns.
 *
 * ## Who calls it
 *
 * Anything that can send an HTTP POST with the right header: a Vercel
 * schedule, a free external pinger, a cron line on a server. That is the
 * point. The schedule is a URL, not a platform feature, so moving off
 * Vercel means pointing something else at it.
 *
 * ## It is cheap when there is nothing to do
 *
 * The usual case is one indexed query that finds no due campaign, and a
 * return. That matters on the Vercel Hobby plan, where a heartbeat every
 * 15 minutes is about 2,880 invocations a month and has to stay a
 * rounding error against the allowance.
 *
 * GET is accepted as well, because some schedulers only send GET.
 */
export async function POST(req: NextRequest) {
    return handle(req)
}

export async function GET(req: NextRequest) {
    return handle(req)
}

async function handle(req: NextRequest) {
    const startedAt = Date.now()

    try {
        requireJobSecret(req)
        await dbConnect()

        const result = await runDispatcher()

        return NextResponse.json({
            success: true,
            data: { ...result, durationMs: Date.now() - startedAt },
        })
    } catch (error) {
        return errorResponse(error, "The dispatcher failed")
    }
}

/**
 * The worker loop can run for a while, and so can a snapshot of a large
 * audience. 300 seconds is the Vercel Hobby ceiling; the dispatcher's own
 * budget is well inside it.
 */
export const maxDuration = 300
export const dynamic = "force-dynamic"
