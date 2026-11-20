import { NextRequest, NextResponse } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import {
    EMAIL_ACCESS_ROLES,
    EMAIL_ADMIN_ROLES,
    canAdministerEmail,
} from "@/constants/emailRoles"
import EmailSenderIdentity, {
    type IEmailSenderIdentity,
} from "@/models/EmailSenderIdentity"
import { EmailError, errorResponse, readJson } from "@/lib/email/http"
import {
    DELIVERY_FIELD_HELP,
    DELIVERY_LIMITS,
    deliverySettings,
    schedulePrecisionMinutes,
} from "@/lib/email/config/deliveryConfig"
import {
    getProvider,
    providerCapabilities,
    setKillSwitch,
} from "@/lib/email/config/providerConfig"
import { serializeIdentity } from "@/lib/email/settings/serialize"
import { pinnedRegion, regionsInView } from "@/lib/email/region"
import { schedulerHealth } from "@/lib/email/jobs/health"
import type { EmailSettingsResponse } from "@/types/email"

/**
 * The email settings screen.
 *
 * There is almost nothing to set here any more, and that is the point.
 *
 * - The **connection** is the `SALES_SMTP_*` environment variables, the
 *   same mailbox quotations use. It is shown, never edited.
 * - The **limits** are constants in src/lib/email/config/deliveryConfig.ts,
 *   derived from what Gmail and Vercel allow and from what this
 *   application was measured doing. They are shown with the one-line
 *   explanation of each, never edited.
 * - The **kill switch** is the only thing this route writes. It is the one
 *   control that has to change while mail is going out, and an environment
 *   variable cannot change without a redeploy.
 *
 * Sender identities are managed by their own routes and are only listed
 * here.
 */

/**
 * GET: the whole screen in one response.
 *
 * Readable by anyone who can open the email pages. No password is in the
 * response at any permission level.
 */
export async function GET(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        // The kill switch is per region, so the screen asks for one rather
        // than guessing. It does NOT use resolveWriteRegion, which throws,
        // because an admin on "all regions" is normal and not an error.
        const region = pinnedRegion()

        if (!region) {
            return NextResponse.json({
                success: true,
                data: {
                    needsRegionPick: true,
                    regionsInView: regionsInView(),
                    canEdit: canAdministerEmail(user.role),
                },
            })
        }

        const delivery = deliverySettings()

        const [provider, identityRows] = await Promise.all([
            getProvider(region),
            EmailSenderIdentity.find({ region })
                .sort({ isDefault: -1, createdAt: 1 })
                .lean<IEmailSenderIdentity[]>(),
        ])

        const body: EmailSettingsResponse = {
            needsRegionPick: false,
            regionsInView: [region],
            region,
            provider,
            identities: identityRows.map(serializeIdentity),
            delivery,
            deliveryLimits: DELIVERY_LIMITS,
            deliveryHelp: DELIVERY_FIELD_HELP,
            capabilityNote: provider
                ? providerCapabilities(provider.host).note
                : "",
            schedulePrecisionMinutes: schedulePrecisionMinutes(delivery),
            // The interval below is what the code assumes. This is what
            // is actually happening. They are not always the same, and
            // the gap is invisible everywhere else.
            schedulerLastRunAt: (await schedulerHealth()).lastRunAt,
            canEdit: canAdministerEmail(user.role),
        }

        return NextResponse.json({ success: true, data: body })
    } catch (error) {
        return errorResponse(error, "Failed to load the email settings")
    }
}

/**
 * PUT: turn campaign sending off or on.
 *
 * The only write. Body: `{ killSwitch: boolean, killSwitchReason?: string }`.
 *
 * Switching off takes effect within one worker cycle, because every worker
 * checks it before it claims any work. Nothing is lost: recipients stay
 * queued and go out when it is switched back on.
 */
export async function PUT(req: NextRequest) {
    try {
        await requireRole(req, EMAIL_ADMIN_ROLES)
        await dbConnect()

        const region = pinnedRegion()
        if (!region) {
            throw new EmailError(
                "Pick one region in the header first. Sending is switched " +
                    "off per region.",
                400,
                { field: "region" }
            )
        }

        const body = await readJson(req)

        if (typeof body.killSwitch !== "boolean") {
            throw new EmailError(
                "Send killSwitch as true or false.",
                400,
                { field: "killSwitch" }
            )
        }

        const reason =
            typeof body.killSwitchReason === "string"
                ? body.killSwitchReason
                : undefined

        // A reason is required when switching off. Whoever finds sending
        // stopped needs to know whether it is safe to turn back on, and
        // "no reason given" is the state that causes a second outage.
        if (body.killSwitch && !reason?.trim()) {
            throw new EmailError(
                "Give a reason for switching sending off, so whoever finds " +
                    "it knows whether it is safe to turn back on.",
                400,
                { field: "killSwitchReason" }
            )
        }

        const result = await setKillSwitch(region, body.killSwitch, reason)
        const provider = await getProvider(region)
        const delivery = deliverySettings()

        return NextResponse.json({
            success: true,
            message: result.killSwitch
                ? "Sending is switched off. Workers stop within one cycle."
                : "Sending is switched back on.",
            data: {
                provider,
                delivery,
                schedulePrecisionMinutes: schedulePrecisionMinutes(delivery),
                capabilityNote: provider
                    ? providerCapabilities(provider.host).note
                    : "",
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to change the kill switch")
    }
}
