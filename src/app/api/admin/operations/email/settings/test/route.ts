import { NextRequest, NextResponse } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ADMIN_ROLES } from "@/constants/emailRoles"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import { EmailError, errorResponse } from "@/lib/email/http"
import { MAIL_ACCOUNT, readMailAccount } from "@/lib/mail/accounts"
import { recordTestResult } from "@/lib/email/config/providerConfig"
import { testConnection } from "@/lib/email/delivery/transport"
import { checkRateLimit } from "@/lib/security/rateLimit"
import type { SmtpTestResult } from "@/types/email"

/**
 * POST /api/admin/operations/email/settings/test
 *
 * Opens an SMTP connection to the sales mailbox and signs in. Sends
 * nothing, so it cannot reach anybody.
 *
 * It takes no body. There is nothing to try out: the credentials come from
 * the server's SALES_SMTP_* variables, and those are what a campaign will
 * use. Testing anything else would prove nothing about whether a campaign
 * can send.
 *
 * The result is recorded so the settings and overview screens can say when
 * the connection was last proved, and what the server said if it refused.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_ADMIN_ROLES)

        // Each test opens a real connection to someone else's server.
        // Without a limit, a held-down button looks like an attack to the
        // provider and gets the account throttled.
        const limit = checkRateLimit(`email-smtp-test:${user.id}`, 10, 60_000)
        if (!limit.allowed) {
            throw new EmailError(
                `Too many tests. Try again in ${limit.retryAfterSec} seconds.`,
                429
            )
        }

        await dbConnect()

        const region = resolveWriteRegion(undefined, user)
        const account = readMailAccount(MAIL_ACCOUNT.SALES)

        if (!account) {
            throw new EmailError(
                "The sales mailbox is not set up on this server. Set " +
                    "SALES_SMTP_HOST, SALES_SMTP_PORT, SALES_SMTP_USER and " +
                    "SALES_SMTP_PASS, then restart it.",
                400
            )
        }

        const result = await testConnection({
            host: account.host,
            port: account.port,
            secure: account.secure,
            user: account.user,
            pass: account.pass,
        })

        await recordTestResult(region, result)

        const body: SmtpTestResult = {
            ok: result.ok,
            message: result.ok
                ? `Signed in to ${account.user} on ${account.host}.`
                : result.message,
            testedAt: new Date().toISOString(),
        }

        // 200 either way. The request worked; the answer is in the body.
        // A failed sign-in is information, not a broken endpoint.
        return NextResponse.json({ success: true, data: body })
    } catch (error) {
        return errorResponse(error, "The connection test could not run")
    }
}
