import nodemailer, { type Transporter } from "nodemailer"

/**
 * A mail sink: a transporter that records instead of sending.
 *
 * It goes through Nodemailer's real `sendMail`, so addresses, headers and
 * the rendered body are all built by the code that production uses. Only
 * the socket is missing.
 *
 * ## Faults can be injected
 *
 * The delivery engine's interesting behaviour is what it does when sends
 * fail, so the sink can be told to fail: a share of sends, specific
 * addresses, or everything with a given SMTP code. That is how the retry,
 * suppression and halt paths are exercised without waiting for a real
 * provider to misbehave.
 */

export interface SentMessage {
    to: string
    subject: string
    messageId: string
    html: string
    text: string
    headers: Record<string, unknown>
    at: number
}

export interface SinkFaults {
    /** 0 to 1. The share of sends that fail. */
    failureRate?: number
    /** These addresses always fail, whatever the rate. */
    failAddresses?: string[]
    /** The SMTP code failures carry. 550 is permanent, 421 transient. */
    failCode?: number
    failMessage?: string
    /** Every send fails with an auth error. For the halt path. */
    authFailure?: boolean
    /** Milliseconds each send takes, to imitate a real round trip. */
    latencyMs?: number
    /** Deterministic failures when set: every nth send fails. */
    failEveryNth?: number
}

export class MailSink {
    readonly sent: SentMessage[] = []
    readonly failed: Array<{ to: string; code: number }> = []
    private count = 0

    constructor(private faults: SinkFaults = {}) {}

    get transporter(): Transporter {
        // jsonTransport returns the built message rather than sending it,
        // so the whole compose path runs for real.
        const inner = nodemailer.createTransport({ jsonTransport: true })
        const sink = this

        const wrapped = {
            ...inner,
            sendMail: async (options: Record<string, unknown>) => {
                sink.count += 1

                if (sink.faults.latencyMs) {
                    await new Promise((r) => setTimeout(r, sink.faults.latencyMs))
                }

                const to = String(options.to ?? "")

                if (sink.shouldFail(to)) {
                    const code = sink.faults.authFailure
                        ? 535
                        : (sink.faults.failCode ?? 550)

                    sink.failed.push({ to, code })

                    const error = new Error(
                        sink.faults.authFailure
                            ? "535 5.7.8 Username and Password not accepted"
                            : (sink.faults.failMessage ??
                               `${code} 5.1.1 No such user here`)
                    ) as Error & { responseCode: number; response: string; code?: string }

                    error.responseCode = code
                    error.response = error.message
                    if (sink.faults.authFailure) error.code = "EAUTH"

                    throw error
                }

                const info = await inner.sendMail(options as never)

                sink.sent.push({
                    to,
                    subject: String(options.subject ?? ""),
                    messageId: String(options.messageId ?? info.messageId ?? ""),
                    html: String(options.html ?? ""),
                    text: String(options.text ?? ""),
                    headers: (options.headers ?? {}) as Record<string, unknown>,
                    at: Date.now(),
                })

                return info
            },
            close: () => inner.close(),
        }

        return wrapped as unknown as Transporter
    }

    private shouldFail(to: string): boolean {
        if (this.faults.authFailure) return true

        if (this.faults.failAddresses?.includes(to.toLowerCase())) return true

        if (this.faults.failEveryNth && this.count % this.faults.failEveryNth === 0) {
            return true
        }

        if (this.faults.failureRate && Math.random() < this.faults.failureRate) {
            return true
        }

        return false
    }

    /** Lets a test change the faults between rounds. */
    setFaults(faults: SinkFaults): void {
        this.faults = faults
    }

    get recipients(): string[] {
        return this.sent.map((m) => m.to.toLowerCase())
    }

    /** True when every message went to exactly one address. */
    get oneRecipientEach(): boolean {
        return this.sent.every((m) => !m.to.includes(",") && m.to.trim() !== "")
    }

    reset(): void {
        this.sent.length = 0
        this.failed.length = 0
        this.count = 0
    }
}
