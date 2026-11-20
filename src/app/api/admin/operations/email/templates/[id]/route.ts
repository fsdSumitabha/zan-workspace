import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import {
    EMAIL_ACCESS_ROLES,
    EMAIL_AUTHOR_ROLES,
    EMAIL_MANAGE_ROLES,
    canAuthorEmail,
} from "@/constants/emailRoles"
import EmailTemplate, { type IEmailTemplate } from "@/models/EmailTemplate"
import EmailTemplateVersion, {
    type IEmailTemplateVersion,
} from "@/models/EmailTemplateVersion"
import EmailAsset, { type IEmailAsset } from "@/models/EmailAsset"
import EmailCampaign from "@/models/EmailCampaign"
import { normaliseMjml } from "@/lib/email/template/normalise"
import {
    EmailError,
    errorResponse,
    isObjectId,
    readJson,
    readNumber,
    readString,
} from "@/lib/email/http"
import { MAX_MJML_BYTES } from "@/lib/email/template/validate"
import { STARTER_BLOCKS, starterMjml } from "@/lib/email/template/starter"
import { MERGE_TOKENS } from "@/lib/email/personalise/tokens"
import {
    serializeTemplateRow,
    serializeVersion,
} from "@/lib/email/template/serialize"
import { serializeAsset } from "@/lib/email/template/assets"
import type { EmailEditorPayload } from "@/types/email"

/**
 * GET /api/admin/operations/email/templates/[id]
 *
 * Everything the editor needs to open, in one response: the MJML to edit,
 * the version history, the merge tokens, the starter blocks and the asset
 * library.
 *
 * ## Which MJML it returns
 *
 * The autosaved draft when there is one newer than the current version,
 * otherwise the current version's source. That is what makes closing the
 * tab and coming back safe: the work is still there, and it is clearly
 * labelled as a draft rather than silently published.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const { id } = await params
        const template = await loadTemplate(id)

        const [versions, assets] = await Promise.all([
            EmailTemplateVersion.find({ templateId: template._id })
                .sort({ version: -1 })
                .limit(50)
                .lean<IEmailTemplateVersion[]>(),
            EmailAsset.find({})
                .sort({ createdAt: -1 })
                .limit(200)
                .lean<IEmailAsset[]>(),
        ])

        const current =
            versions.find((v) => String(v._id) === String(template.currentVersionId)) ??
            versions[0] ??
            null

        /**
         * A draft only counts when it is newer than the current version AND
         * actually says something different.
         *
         * Without the content check, any autosave that happened to run while
         * nobody was typing would leave a draft identical to the saved
         * version, and the editor would greet the next person with a warning
         * about work that does not exist. The client avoids writing those in
         * the first place; this makes the banner correct even for drafts
         * written before that fix, or by an older tab.
         */
        const draft = template.draftMjml?.trim()
        const useDraft = Boolean(
            draft &&
            template.draftSavedAt &&
            (!current || template.draftSavedAt > current.createdAt) &&
            (!current || draft !== current.mjml.trim())
        )

        const payload: EmailEditorPayload = {
            template: serializeTemplateRow({
                ...template,
                versionCount: versions.length,
                currentVersion: current?.version ?? 0,
            } as IEmailTemplate & { versionCount: number; currentVersion: number }),
            /**
             * Normalised on the way out as well as in.
             *
             * Templates saved before this existed still hold the bare
             * ampersands the editor's own save wrote, and they cannot be
             * opened. Repairing them here means they heal the next time
             * somebody opens one, instead of staying broken for ever or
             * needing a migration. New rows are already clean, so this
             * changes nothing for them.
             */
            mjml: normaliseMjml(
                useDraft ? draft! : (current?.mjml ?? starterMjml())
            ),
            fromDraft: useDraft,
            currentVersion: current
                ? serializeVersion(current, { includeSource: true })
                : null,
            versions: versions.map((v) => serializeVersion(v)),
            mergeTokens: MERGE_TOKENS.map((t) => ({
                key: t.key,
                label: t.label,
                sample: t.sample,
                description: t.description,
            })),
            starterBlocks: STARTER_BLOCKS.map((b) => ({ ...b })),
            assets: assets.map(serializeAsset),
            canEdit: canAuthorEmail(user.role),
        }

        return NextResponse.json({ success: true, data: payload })
    } catch (error) {
        return errorResponse(error, "Failed to open the template")
    }
}

/**
 * PATCH /api/admin/operations/email/templates/[id]
 *
 * Renames a template, changes its category or tags, or saves the editor's
 * autosave draft.
 *
 * ## The draft is not a version
 *
 * `draftMjml` is written every twenty seconds while somebody is editing. It
 * is NOT compiled and NOT validated here, because autosave must never fail
 * and must never block typing. Half-finished MJML is expected in a draft.
 * The checks happen when a version is saved, which is the moment the
 * content can actually be sent.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireRole(req, EMAIL_AUTHOR_ROLES)
        await dbConnect()

        const { id } = await params
        const template = await loadTemplate(id)
        const body = await readJson(req)

        const updates: Record<string, unknown> = {}

        const name = readString(body, "name", 200)
        if (name && name !== template.name) {
            const clash = await EmailTemplate.findOne({
                region: template.region,
                name,
                _id: { $ne: template._id },
            })
            if (clash) {
                throw new EmailError(
                    `A template called "${name}" already exists.`,
                    409,
                    { field: "name" }
                )
            }
            updates.name = name
        }

        if (body.description !== undefined) {
            updates.description = readString(body, "description", 1000) ?? ""
        }

        const category = readNumber(body, "category", 10, 60)
        if (category !== undefined) updates.category = category

        if (Array.isArray(body.tags)) {
            updates.tags = body.tags
                .filter((t): t is string => typeof t === "string")
                .map((t) => t.trim().slice(0, 40))
                .filter(Boolean)
                .slice(0, 10)
        }

        if (typeof body.draftMjml === "string") {
            const draft = body.draftMjml
            if (Buffer.byteLength(draft, "utf8") > MAX_MJML_BYTES) {
                throw new EmailError(
                    "This template is too large to autosave. Remove some " +
                    "content.",
                    400,
                    { field: "draftMjml" }
                )
            }
            // A draft is reopened by the editor like any version, so it
            // gets the same treatment. Nothing is compiled here: an
            // autosave must never refuse half-typed markup.
            updates.draftMjml = normaliseMjml(draft)
            updates.draftSavedAt = new Date()
            updates.draftSavedBy = user.id
        }

        // Discard the draft, which is what "revert to the saved version"
        // does in the editor.
        if (body.clearDraft === true) {
            updates.draftMjml = ""
            updates.draftSavedAt = null
        }

        if (Object.keys(updates).length === 0) {
            throw new EmailError("Nothing to change.", 400)
        }

        await EmailTemplate.updateOne({ _id: template._id }, { $set: updates })

        return NextResponse.json({ success: true, data: { _id: id } })
    } catch (error) {
        return errorResponse(error, "Failed to save the template")
    }
}

/**
 * DELETE /api/admin/operations/email/templates/[id]
 *
 * Soft deletes a template. Refused while a campaign still points at one of
 * its versions, because a campaign report describes the mail that was
 * actually sent and it has to stay readable.
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireRole(req, EMAIL_MANAGE_ROLES)
        await dbConnect()

        const { id } = await params
        const template = await loadTemplate(id)

        const used = await EmailCampaign.countDocuments({ templateId: template._id })
        if (used > 0) {
            throw new EmailError(
                `This template is used by ${used} campaign${used === 1 ? "" : "s"}. ` +
                "Delete or archive those first.",
                409
            )
        }

        await EmailTemplate.updateOne(
            { _id: template._id },
            { $set: { deletedAt: new Date(), deletedBy: user.id } }
        )

        return NextResponse.json({ success: true, data: { _id: id } })
    } catch (error) {
        return errorResponse(error, "Failed to delete the template")
    }
}

/**
 * Loads a template the caller is allowed to see.
 *
 * The region filter is applied by regionScopePlugin, so a template in
 * another region simply is not found. 404 rather than 403: confirming that
 * an id exists in a region the caller cannot read is itself a leak.
 */
async function loadTemplate(id: string): Promise<IEmailTemplate> {
    if (!isObjectId(id)) {
        throw new EmailError("That template was not found.", 404)
    }

    const template = await EmailTemplate.findById(id).lean<IEmailTemplate>()

    if (!template) {
        throw new EmailError("That template was not found.", 404)
    }

    return template
}
