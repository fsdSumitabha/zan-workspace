import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_AUTHOR_ROLES } from "@/constants/emailRoles"
import EmailTemplate, { type IEmailTemplate } from "@/models/EmailTemplate"
import EmailTemplateVersion, {
    type IEmailTemplateVersion,
} from "@/models/EmailTemplateVersion"
import EmailAudience, { type IEmailAudience } from "@/models/EmailAudience"
import EmailSenderIdentity, {
    type IEmailSenderIdentity,
} from "@/models/EmailSenderIdentity"
import EmailProviderConfig, {
    type IEmailProviderConfig,
} from "@/models/EmailProviderConfig"
import { errorResponse } from "@/lib/email/http"
import {
    getDeliverySettings,
    schedulePrecisionMinutes,
} from "@/lib/email/config/deliveryConfig"
import { providerCapabilities } from "@/lib/email/config/providerConfig"
import { pinnedRegion } from "@/lib/email/region"
import { MERGE_TOKENS } from "@/lib/email/personalise/tokens"
import { ZONE_CHOICES } from "@/lib/time/zone"
import { hasValidSecretKey } from "@/lib/email/config/crypto"

/**
 * GET /api/admin/operations/email/campaigns/choices
 *
 * Everything the campaign wizard needs, in one request: templates with
 * their current version, saved audiences, sender identities, time zones,
 * merge tokens, and whether the setup is complete enough to send.
 *
 * One call rather than six, because the wizard needs all of it before it
 * can render step one, and six round trips on a slow connection is a
 * visibly slower screen.
 *
 * `readiness` is the useful part. A person should find out that there is
 * no SMTP password on the first screen, not after filling in six steps.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, EMAIL_AUTHOR_ROLES)
        await dbConnect()

        const region = pinnedRegion()

        const [templates, audiences, identities, provider] = await Promise.all([
            EmailTemplate.find({ currentVersionId: { $ne: null } })
                .sort({ updatedAt: -1 })
                .limit(100)
                .select("_id name category currentVersionId thumbnailUrl")
                .lean<IEmailTemplate[]>(),
            EmailAudience.find({})
                .sort({ updatedAt: -1 })
                .limit(100)
                .select("_id name description lastCount lastCountedAt")
                .lean<IEmailAudience[]>(),
            EmailSenderIdentity.find({})
                .sort({ isDefault: -1, createdAt: 1 })
                .lean<IEmailSenderIdentity[]>(),
            EmailProviderConfig.findOne({})
                .sort({ isDefault: -1, createdAt: 1 })
                .select("+passCipher")
                .lean<IEmailProviderConfig>(),
        ])

        // The merge tokens each template actually uses, so step four can
        // show only the ones worth setting a fallback for.
        // A type predicate, not `.filter(Boolean)`: the latter does not
        // narrow away the undefined and the query refuses the array.
        const versionIds = templates
            .map((t) => t.currentVersionId)
            .filter((id): id is NonNullable<typeof id> => Boolean(id))

        const versions = await EmailTemplateVersion.find({
            _id: { $in: versionIds },
        })
            .select("_id templateId version mergeTokens htmlBytes")
            .lean<IEmailTemplateVersion[]>()

        const versionByTemplate = new Map(
            versions.map((v) => [String(v.templateId), v])
        )

        const settings = region ? await getDeliverySettings(region) : null

        return NextResponse.json({
            success: true,
            data: {
                templates: templates.map((t) => {
                    const version = versionByTemplate.get(String(t._id))
                    return {
                        _id: String(t._id),
                        name: t.name,
                        category: t.category,
                        thumbnailUrl: t.thumbnailUrl ?? "",
                        versionId: version ? String(version._id) : null,
                        version: version?.version ?? 0,
                        mergeTokens: version?.mergeTokens ?? [],
                        htmlBytes: version?.htmlBytes ?? 0,
                    }
                }),
                audiences: audiences.map((a) => ({
                    _id: String(a._id),
                    name: a.name,
                    description: a.description ?? "",
                    lastCount: a.lastCount ?? null,
                    lastCountedAt: a.lastCountedAt
                        ? a.lastCountedAt.toISOString()
                        : null,
                })),
                identities: identities.map((i) => ({
                    _id: String(i._id),
                    fromName: i.fromName,
                    fromEmail: i.fromEmail,
                    replyTo: i.replyTo ?? "",
                    isDefault: i.isDefault,
                    verified: Boolean(i.verifiedAt),
                })),
                zones: ZONE_CHOICES.map((z) => ({
                    zone: z.zone,
                    place: z.place,
                    hint: z.hint ?? "",
                })),
                mergeTokens: MERGE_TOKENS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    sample: t.sample,
                    defaultFallback: t.defaultFallback,
                })),

                /**
                 * Whether a campaign could actually go out. Checked on the
                 * first screen rather than at the end, so nobody fills in
                 * six steps to be told the password is missing.
                 */
                readiness: {
                    region,
                    needsRegionPick: region === null,
                    secretKeyReady: hasValidSecretKey(),
                    providerReady: Boolean(provider?.passCipher),
                    identityReady: identities.length > 0,
                    templateReady: templates.length > 0,
                    audienceReady: audiences.length > 0,
                    killSwitch: provider?.killSwitch ?? false,
                    sendRatePerSecond: provider?.globalPerSecond ?? 0,
                    reportsDelivery: provider?.reportsDelivery ?? false,
                    capabilityNote: provider
                        ? providerCapabilities(provider.host).note
                        : "",
                },

                schedulePrecisionMinutes: settings
                    ? schedulePrecisionMinutes(settings)
                    : null,
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the campaign options")
    }
}
