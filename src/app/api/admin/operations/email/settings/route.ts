import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import {
    EMAIL_ACCESS_ROLES,
    EMAIL_ADMIN_ROLES,
    canAdministerEmail,
} from "@/constants/emailRoles"
import EmailProviderConfig, {
    type IEmailProviderConfig,
} from "@/models/EmailProviderConfig"
import EmailSenderIdentity, {
    type IEmailSenderIdentity,
} from "@/models/EmailSenderIdentity"
import EmailDeliveryConfig from "@/models/EmailDeliveryConfig"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import {
    EmailError,
    errorResponse,
    readJson,
    readNumber,
    readString,
    requireString,
} from "@/lib/email/http"
import { encryptSecret, hasValidSecretKey } from "@/lib/email/config/crypto"
import {
    DELIVERY_DEFAULTS,
    DELIVERY_FIELD_HELP,
    getDeliverySettings,
    schedulePrecisionMinutes,
    type DeliverySettings,
} from "@/lib/email/config/deliveryConfig"
import {
    providerCapabilities,
    suggestedFromEnv,
} from "@/lib/email/config/providerConfig"
import {
    serializeIdentity,
    serializeProvider,
} from "@/lib/email/settings/serialize"
import { pinnedRegion, regionsInView } from "@/lib/email/region"
import type { EmailSettingsResponse } from "@/types/email"

/**
 * GET /api/admin/operations/email/settings
 *
 * The whole settings screen in one response: the SMTP connection, the
 * sender identities, every delivery limit with its default and its
 * explanation, and whether the encryption key is set up.
 *
 * Readable by anyone who can open the email pages. The password is not in
 * the response at any permission level; `hasPassword` says whether one is
 * stored and that is all.
 */
export async function GET(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        // These settings are per region: one SMTP connection, one set of
        // delivery limits. There is nothing sensible to show when the
        // session is looking at three regions at once, so the screen asks
        // for one. It does NOT use resolveWriteRegion, which throws, because
        // an admin on "all regions" is the normal case and not an error.
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

        const [providerRow, identityRows, delivery] = await Promise.all([
            EmailProviderConfig.findOne({ region })
                .sort({ isDefault: -1, createdAt: 1 })
                .select("+passCipher")
                .lean<IEmailProviderConfig>(),
            EmailSenderIdentity.find({ region })
                .sort({ isDefault: -1, createdAt: 1 })
                .lean<IEmailSenderIdentity[]>(),
            getDeliverySettings(region),
        ])

        const host = providerRow?.host ?? suggestedFromEnv()?.host ?? ""

        const body: EmailSettingsResponse = {
            needsRegionPick: false,
            regionsInView: [region],
            region,
            provider: providerRow ? serializeProvider(providerRow) : null,
            identities: identityRows.map(serializeIdentity),
            delivery,
            deliveryDefaults: DELIVERY_DEFAULTS,
            deliveryHelp: DELIVERY_FIELD_HELP,
            secretKeyReady: hasValidSecretKey(),
            suggestion: providerRow ? null : suggestedFromEnv(),
            capabilityNote: host ? providerCapabilities(host).note : "",
            schedulePrecisionMinutes: schedulePrecisionMinutes(delivery),
            canEdit: canAdministerEmail(user.role),
        }

        return NextResponse.json({ success: true, data: body })
    } catch (error) {
        return errorResponse(error, "Failed to load the email settings")
    }
}

/**
 * PUT /api/admin/operations/email/settings
 *
 * Saves the SMTP connection and the delivery limits. Admin only.
 *
 * The password is write-only. Send `pass` to set or change it; leave it
 * out to keep the one that is stored. There is no way to read it back.
 */
export async function PUT(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_ADMIN_ROLES)
        await dbConnect()

        // A write needs exactly one region. The message names the switch
        // rather than listing codes, because that is the thing to click.
        const region = pinnedRegion()
        if (!region) {
            throw new EmailError(
                "Pick one region in the header before saving email settings. " +
                "Each region has its own SMTP connection and its own limits.",
                400,
                { field: "region" }
            )
        }

        const body = await readJson(req)

        const provider = await saveProvider(body, region, user.id)
        const delivery = await saveDelivery(body, region, user.id)

        return NextResponse.json({
            success: true,
            data: {
                provider: serializeProvider(provider),
                delivery,
                schedulePrecisionMinutes: schedulePrecisionMinutes(delivery),
                capabilityNote: providerCapabilities(provider.host).note,
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to save the email settings")
    }
}

async function saveProvider(
    body: Record<string, unknown>,
    region: string,
    userId: string
): Promise<IEmailProviderConfig> {
    const name = requireString(body, "name", "A name for the connection", 100)
    const host = requireString(body, "host", "The SMTP host", 255)
    const user = requireString(body, "user", "The SMTP username", 255)

    const port = readNumber(body, "port", 1, 65535)
    if (port === undefined) {
        throw new EmailError("The SMTP port is required.", 400, { field: "port" })
    }

    // The key chosen here decides which sends share one rate budget. It is
    // derived from the host and user so two rows pointing at the same
    // mailbox cannot each get a full budget.
    const providerKey = `${host.toLowerCase()}:${user.toLowerCase()}`

    const update: Record<string, unknown> = {
        name,
        providerKey,
        host,
        port,
        secure: body.secure === undefined ? port === 465 : Boolean(body.secure),
        user,
        maxConnections: readNumber(body, "maxConnections", 1, 20) ?? 1,
        maxMessages: readNumber(body, "maxMessages", 1, 10_000) ?? 100,
        globalPerSecond: readNumber(body, "globalPerSecond", 1, 500) ?? 2,
        globalPerDay: readNumber(body, "globalPerDay", 1, 1_000_000) ?? 500,
        reportsDelivery: Boolean(body.reportsDelivery),
        reportsBounces: Boolean(body.reportsBounces),
        isDefault: true,
    }

    // The kill switch carries who set it and why, so the banner can say so.
    if (body.killSwitch !== undefined) {
        const on = Boolean(body.killSwitch)
        update.killSwitch = on
        update.killSwitchReason = on
            ? readString(body, "killSwitchReason", 500) ?? "Switched off by an admin."
            : undefined
        update.killSwitchAt = on ? new Date() : undefined
        update.killSwitchBy = on ? userId : undefined
    }

    // Write-only. No password in the body means keep the stored one.
    const pass = readString(body, "pass", 500)
    if (pass) {
        const secret = encryptSecret(pass)
        update.passCipher = secret.cipher
        update.passIv = secret.iv
        update.passTag = secret.tag
    }

    const saved = await EmailProviderConfig.findOneAndUpdate(
        { region, providerKey },
        { $set: update, $setOnInsert: { region, createdBy: userId } },
        { upsert: true, returnDocument: "after", runValidators: true }
    )
        .select("+passCipher")
        .lean<IEmailProviderConfig>()

    if (!saved) {
        throw new EmailError("The SMTP settings could not be saved.", 500)
    }

    return saved
}

async function saveDelivery(
    body: Record<string, unknown>,
    region: string,
    userId: string
): Promise<DeliverySettings> {
    const raw = body.delivery

    if (!raw || typeof raw !== "object") {
        return getDeliverySettings(region as never)
    }

    const incoming = raw as Record<string, unknown>
    const update: Record<string, unknown> = { updatedBy: userId }

    // Only fields that exist in the defaults are accepted, so nothing in
    // the body can reach a field this screen does not own.
    const RANGES: Record<string, [number, number]> = {
        logicalBatchSize: [1, 1000],
        maxJobsPerInvocation: [1, 500],
        sendConcurrency: [1, 20],
        workerDurationBudgetMs: [5_000, 280_000],
        workerSafetyFraction: [0.1, 0.95],
        leaseDurationMs: [10_000, 600_000],
        maxAttemptsTransient: [1, 10],
        maxAttemptsPermanent: [1, 1],
        backoffBaseMs: [500, 600_000],
        backoffMaxMs: [1_000, 86_400_000],
        globalCampaignConcurrency: [1, 20],
        unknownOutcomePolicy: [10, 20],
        unknownOutcomeWindowMs: [0, 86_400_000],
        heartbeatIntervalMinutes: [1, 1440],
        bounceRateThreshold: [0, 1],
        bounceRateMinSample: [1, 100_000],
    }

    for (const [key, [min, max]] of Object.entries(RANGES)) {
        const value = readNumber(incoming, key, min, max)
        if (value !== undefined) update[key] = value
    }

    if (incoming.suppressionRecheckBeforeSend !== undefined) {
        update.suppressionRecheckBeforeSend = Boolean(
            incoming.suppressionRecheckBeforeSend
        )
    }

    await EmailDeliveryConfig.findOneAndUpdate(
        { region },
        { $set: update, $setOnInsert: { region, ...DELIVERY_DEFAULTS } },
        { upsert: true, runValidators: true }
    )

    return getDeliverySettings(region as never)
}
