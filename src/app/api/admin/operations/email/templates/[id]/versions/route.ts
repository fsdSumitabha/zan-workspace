import { NextRequest, NextResponse } from "next/server"
import type { Types } from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ACCESS_ROLES, EMAIL_AUTHOR_ROLES } from "@/constants/emailRoles"
import EmailTemplate, { type IEmailTemplate } from "@/models/EmailTemplate"
import EmailTemplateVersion, {
    type IEmailTemplateVersion,
} from "@/models/EmailTemplateVersion"
import {
    EmailError,
    errorResponse,
    isObjectId,
    readJson,
    readString,
    requireString,
} from "@/lib/email/http"
import { compileMjml } from "@/lib/email/template/compile"
import { serializeVersion } from "@/lib/email/template/serialize"

/**
 * GET /api/admin/operations/email/templates/[id]/versions
 *
 * The version history. Source is included only for one version, asked for
 * by `?version=3`, because the history list is shown as a sidebar and the
 * MJML would make it heavy.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const { id } = await params
        if (!isObjectId(id)) {
            throw new EmailError("That template was not found.", 404)
        }

        const wanted = Number(new URL(req.url).searchParams.get("version"))

        const rows = await EmailTemplateVersion.find({ templateId: id })
            .sort({ version: -1 })
            .limit(100)
            .lean<IEmailTemplateVersion[]>()

        return NextResponse.json({
            success: true,
            data: rows.map((r) =>
                serializeVersion(r, { includeSource: r.version === wanted })
            ),
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the version history")
    }
}

/**
 * POST /api/admin/operations/email/templates/[id]/versions
 *
 * Saves a new version. This is the explicit Save in the editor.
 *
 * ## The server compiles, not the browser
 *
 * The editor compiles too, with mjml-browser, so the designer sees a live
 * preview. That output is never sent anywhere. The HTML stored here is
 * produced by this route, from the MJML it was given, and if it does not
 * compile the save is refused with the errors. The client is not trusted
 * to produce the bytes we mail to people.
 *
 * ## Versions are immutable
 *
 * Saving always inserts. Nothing updates an existing version, because a
 * campaign pins a version id and a report has to keep describing the mail
 * that actually went out.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await requireRole(req, EMAIL_AUTHOR_ROLES)
        await dbConnect()

        const { id } = await params
        if (!isObjectId(id)) {
            throw new EmailError("That template was not found.", 404)
        }

        const template = await EmailTemplate.findById(id)
        if (!template) {
            throw new EmailError("That template was not found.", 404)
        }

        const body = await readJson(req)
        const mjml = requireString(body, "mjml", "The template content", 512 * 1024)

        // Throws EmailError with readable messages when it cannot compile.
        const compiled = compileMjml(mjml)

        // Race-safe version numbering. Two saves a second apart both read
        // "latest is 4" and both try to write 5; the unique index on
        // { templateId, version } refuses the second, and it retries.
        const version = await insertNextVersion({
            templateId: template._id as Types.ObjectId,
            region: template.region,
            mjml,
            compiled,
            note: readString(body, "note", 500) ?? "",
            userId: user.id,
        })

        // The new version becomes current, and the draft is cleared: what
        // was being drafted is now saved, so keeping it would make the
        // editor reopen with a "draft" banner over identical content.
        await EmailTemplate.updateOne(
            { _id: template._id },
            {
                $set: {
                    currentVersionId: version._id,
                    draftMjml: "",
                    draftSavedAt: null,
                },
            }
        )

        return NextResponse.json(
            {
                success: true,
                data: {
                    version: serializeVersion(
                        version.toObject() as IEmailTemplateVersion,
                        { includeSource: true }
                    ),
                    warnings: compiled.warnings,
                },
            },
            { status: 201 }
        )
    } catch (error) {
        return errorResponse(error, "Failed to save the template")
    }
}

const DUPLICATE_KEY = 11000

async function insertNextVersion(input: {
    templateId: Types.ObjectId
    region: string
    mjml: string
    compiled: ReturnType<typeof compileMjml>
    note: string
    userId: string
}) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const latest = await EmailTemplateVersion.findOne({
            templateId: input.templateId,
        })
            .sort({ version: -1 })
            .select("version")
            .lean<{ version: number }>()

        const next = (latest?.version ?? 0) + 1

        try {
            return await EmailTemplateVersion.create({
                region: input.region,
                templateId: input.templateId,
                version: next,
                mjml: input.mjml,
                html: input.compiled.html,
                text: input.compiled.text,
                linkHosts: input.compiled.linkHosts,
                mergeTokens: input.compiled.mergeTokens,
                compileWarnings: input.compiled.warnings,
                htmlBytes: input.compiled.htmlBytes,
                note: input.note,
                createdBy: input.userId,
            })
        } catch (error) {
            const code = (error as { code?: number }).code
            if (code !== DUPLICATE_KEY) throw error
            // Somebody else took this number. Read again and retry.
        }
    }

    throw new EmailError(
        "The template is being saved from somewhere else. Try again.",
        409
    )
}
