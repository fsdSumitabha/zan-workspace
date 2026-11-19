import { config } from "dotenv"

config({ path: ".env.local" })
config({ path: ".env" })

/**
 * A controlled delivery simulation.
 *
 *     npm run email:simulate -- --recipients=100
 *     npm run email:simulate -- --recipients=300 --rate=20 --fail=0.05
 *
 * It seeds a campaign in the TEST database, sends it through a mail sink,
 * and prints the numbers the operating limits should be set from.
 *
 * ## It cannot touch real people
 *
 * Three independent guards:
 *
 *   1. It connects through the test harness, which rewrites the database
 *      name to one ending in `_test` and refuses to run otherwise.
 *   2. Every seeded address is on `.invalid`, a domain RFC 2606 reserves
 *      and which can never resolve.
 *   3. The transport is a sink that records instead of sending, injected
 *      before any worker starts.
 *
 * Measure, then set the numbers in Email Marketing, Settings. The defaults
 * shipped are reasoned starting points, not measurements.
 */

interface Args {
    recipients: number
    rate: number
    failureRate: number
    latencyMs: number
    concurrency: number
    jobsPerInvocation: number
}

function parseArgs(): Args {
    const get = (name: string, fallback: number): number => {
        const raw = process.argv.find((a) => a.startsWith(`--${name}=`))
        if (!raw) return fallback
        const value = Number(raw.split("=")[1])
        return Number.isFinite(value) ? value : fallback
    }

    return {
        recipients: get("recipients", 100),
        rate: get("rate", 10),
        failureRate: get("fail", 0),
        latencyMs: get("latency", 120),
        concurrency: get("concurrency", 2),
        jobsPerInvocation: get("jobs", 100),
    }
}

/** p50, p95 and p99 of a set of durations. */
function percentiles(values: number[]): {
    p50: number
    p95: number
    p99: number
    mean: number
} {
    if (values.length === 0) return { p50: 0, p95: 0, p99: 0, mean: 0 }

    const sorted = [...values].sort((a, b) => a - b)
    const at = (p: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]

    return {
        p50: at(0.5),
        p95: at(0.95),
        p99: at(0.99),
        mean: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    }
}

async function main() {
    const args = parseArgs()

    const { connectTestDb, disconnectTestDb, withoutRegionScope } = await import(
        "@/lib/email/testing/db"
    )
    const { MailSink } = await import("@/lib/email/testing/sink")
    const { resetEmailData, seedScenario, statusCounts } = await import(
        "@/lib/email/testing/scenario"
    )
    const { setTestTransport } = await import("@/lib/email/delivery/transport")
    const { setQueue } = await import("@/lib/email/queue")
    const { runWorker } = await import("@/lib/email/jobs/worker")
    const mongooseModule = await import("mongoose")
    const EmailDeliveryAttempt = (
        await import("@/models/EmailDeliveryAttempt")
    ).default
    const { RECIPIENT_STATUS_META } = await import("@/constants/emailStatus")

    await connectTestDb()
    const dbName = mongooseModule.default.connection.db?.databaseName

    console.log("")
    console.log("  Email delivery simulation")
    console.log("  " + "-".repeat(46))
    console.log(`  database        ${dbName}`)
    console.log(`  recipients      ${args.recipients}`)
    console.log(`  rate            ${args.rate}/sec`)
    console.log(`  send concurrency ${args.concurrency}`)
    console.log(`  SMTP latency    ${args.latencyMs}ms (simulated)`)
    console.log(`  failure rate    ${Math.round(args.failureRate * 100)}%`)
    console.log("")

    // Chaining is recorded rather than followed, so one run is one worker.
    const chained: number[] = []
    setQueue({
        name: "simulation",
        async enqueue(signal) {
            chained.push(signal.hop)
            return true
        },
    })

    const sink = new MailSink({
        latencyMs: args.latencyMs,
        failureRate: args.failureRate,
        failCode: 421,
        failMessage: "421 4.7.0 Try again later",
    })
    setTestTransport(sink.transporter)

    await withoutRegionScope(resetEmailData)

    const { campaignId } = await withoutRegionScope(() =>
        seedScenario({
            recipients: args.recipients,
            perSecond: args.rate,
            perDay: args.recipients * 10,
            sendConcurrency: args.concurrency,
            maxJobsPerInvocation: args.jobsPerInvocation,
        })
    )

    const before = process.memoryUsage().rss
    const startedAt = Date.now()

    const result = await withoutRegionScope(() =>
        runWorker({ campaignId: String(campaignId) })
    )

    const elapsed = Date.now() - startedAt
    const peak = process.memoryUsage().rss

    const attempts = await withoutRegionScope(() =>
        EmailDeliveryAttempt.find({ campaignId })
            .select("durationMs")
            .lean<{ durationMs?: number }[]>()
    )

    const latencies = attempts
        .map((a) => a.durationMs ?? 0)
        .filter((d) => d > 0)
    const p = percentiles(latencies)

    const counts = await withoutRegionScope(() => statusCounts(campaignId))

    console.log("  Results")
    console.log("  " + "-".repeat(46))
    console.log(`  wall clock      ${(elapsed / 1000).toFixed(1)}s`)
    console.log(
        `  throughput      ${(sink.sent.length / (elapsed / 1000)).toFixed(2)}/sec`
    )
    console.log(`  worker rounds   ${result.rounds}`)
    console.log(`  stopped because ${result.stopped}`)
    console.log(`  chained workers ${chained.length}`)
    console.log("")
    console.log("  SMTP latency")
    console.log(`    mean          ${p.mean}ms`)
    console.log(`    p50           ${p.p50}ms`)
    console.log(`    p95           ${p.p95}ms`)
    console.log(`    p99           ${p.p99}ms`)
    console.log("")
    console.log("  Outcomes")
    for (const [code, n] of Object.entries(counts)) {
        const meta = RECIPIENT_STATUS_META[Number(code) as never] as
            | { label: string }
            | undefined
        console.log(`    ${(meta?.label ?? code).padEnd(14)}${n}`)
    }
    console.log("")
    console.log(`  accepted by sink ${sink.sent.length}`)
    console.log(`  refused by sink  ${sink.failed.length}`)
    console.log(`  one address each ${sink.oneRecipientEach ? "yes" : "NO"}`)
    console.log(
        `  duplicates       ${sink.sent.length - new Set(sink.recipients).size}`
    )
    console.log("")
    console.log(`  RSS before      ${Math.round(before / 1024 / 1024)} MB`)
    console.log(`  RSS peak        ${Math.round(peak / 1024 / 1024)} MB`)
    console.log("")

    const perInvocation = Math.ceil(
        args.recipients / Math.max(1, chained.length + 1)
    )
    const throughput = sink.sent.length / (elapsed / 1000)

    /**
     * What actually limited the run.
     *
     * Worth computing rather than assuming. The obvious guess is the send
     * rate, but each recipient also costs three database writes (the
     * Message-ID before the send, the outcome after it, and the attempt
     * row), and against a remote cluster those round trips can easily
     * outweigh the SMTP call.
     *
     * If the measured throughput is well under the configured rate, the
     * rate limit was not the constraint and raising it will not help.
     */
    const rateCeiling = args.rate
    const usedRate = throughput / rateCeiling

    console.log("  What limited this run")
    console.log("  " + "-".repeat(46))
    console.log(`  a campaign of ${args.recipients} took ${(elapsed / 1000).toFixed(1)}s`)
    console.log(`  about ${perInvocation} recipients per worker invocation`)
    console.log(
        `  measured ${throughput.toFixed(2)}/sec against a limit of ${rateCeiling}/sec ` +
        `(${Math.round(usedRate * 100)}% of it)`
    )

    if (usedRate < 0.7) {
        const dbShare = Math.max(
            0,
            elapsed - (sink.sent.length / rateCeiling) * 1000
        )
        console.log("")
        console.log("  The send rate was NOT the constraint.")
        console.log(
            `  About ${(dbShare / 1000).toFixed(1)}s went somewhere other than ` +
            "waiting on the rate limit."
        )
        console.log(
            "  Each recipient costs three database writes, so on a remote"
        )
        console.log(
            "  cluster the round trips dominate. Raising the send rate will"
        )
        console.log("  not make this faster; reducing latency to the database will.")
    } else {
        console.log("")
        console.log("  The send rate was the constraint, as intended.")
        console.log("  Raise it only as far as the provider allows.")
    }
    console.log("")

    setTestTransport(null)
    setQueue(null)
    await disconnectTestDb()
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
