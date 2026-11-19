import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ADMIN_ROLES } from "@/constants/emailRoles"
import EmailProviderConfig, {
    type IEmailProviderConfig,
} from "@/models/EmailProviderConfig"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import { EmailError, errorResponse, readJson, readString } from "@/lib/email/http"
import { decryptSecret } from "@/lib/email/config/crypto"
import { testConnection } from "@/lib/email/delivery/transport"
import { checkRateLimit } from "@/lib/security/rateLimit"
import type { SmtpTestResult } from "@/types/email"

/**
 * POST /api/admin/operations/email/settings/test
 *
 * Opens an SMTP connection and signs in. Sends nothing.
 *
 * It tests the password in the body when one is sent, so somebody can
 * check a new password before saving it. With no password in the body it
 * tests the stored one.
 *
 * The result is written back to the provider row, so the settings screen
 * can show when it was last checked and what the server said.
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
        const body = await readJson(req)

        const stored = await EmailProviderConfig.findOne({ region })
            .sort({ isDefault: -1, createdAt: 1 })
            .select("+passCipher +passIv +passTag")
            .lean<IEmailProviderConfig>()

        const host = readString(body, "host", 255) ?? stored?.host
        const user_ = readString(body, "user", 255) ?? stored?.user
        const rawPort = body.port === undefined ? stored?.port : Number(body.port)

        if (!host || !user_ || !Number.isFinite(rawPort)) {
            throw new EmailError(
                "Enter the host, the port and the username before testing.",
                400
            )
        }

        const port = Number(rawPort)
        const secure =
            body.secure === undefined
                ? (stored?.secure ?? port === 465)
                : Boolean(body.secure)

        const pass = resolvePassword(readString(body, "pass", 500), stored)

        const result = await testConnection({ host, port, secure, user: user_, pass })
        const testedAt = new Date()

        // Record it even when it failed. "Last checked 10 minutes ago, 535
        // bad password" is the most useful line on the settings screen.
        if (stored) {
            await EmailProviderConfig.updateOne(
                { _id: stored._id },
                {
                    $set: {
                        lastTestAt: testedAt,
                        lastTestOk: result.ok,
                        lastTestMessage: result.message,
                    },
                }
            )
        }

        const data: SmtpTestResult = {
            ok: result.ok,
            message: result.message,
            testedAt: testedAt.toISOString(),
        }

        return NextResponse.json({ success: true, data })
    } catch (error) {
        return errorResponse(error, "The connection test could not be run")
    }
}

/** The typed password if one was sent, otherwise the stored one. */
function resolvePassword(
    typed: string | undefined,
    stored: IEmailProviderConfig | null
): string {
    if (typed) return typed

    if (!stored?.passCipher || !stored.passIv || !stored.passTag) {
        throw new EmailError(
            "No password is saved yet. Enter one to test the connection.",
            400,
            { field: "pass" }
        )
    }

    return decryptSecret({
        cipher: stored.passCipher,
        iv: stored.passIv,
        tag: stored.passTag,
    })
}
