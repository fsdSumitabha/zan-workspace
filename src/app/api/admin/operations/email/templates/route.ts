import { NextRequest, NextResponse } from "next/server"
import { Types } from "mongoose"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_ACCESS_ROLES, EMAIL_AUTHOR_ROLES } from "@/constants/emailRoles"
import EmailTemplate, { type IEmailTemplate } from "@/models/EmailTemplate"
import EmailTemplateVersion from "@/models/EmailTemplateVersion"
import EmailSenderIdentity, {
    type IEmailSenderIdentity,
} from "@/models/EmailSenderIdentity"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import {
    EmailError,
    errorResponse,
    readJson,
    readNumber,
    readString,
    requireString,
} from "@/lib/email/http"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY } from "@/constants/emailStatus"
import { compileMjml } from "@/lib/email/template/compile"
import { starterMjml } from "@/lib/email/template/starter"
import { serializeTemplateRow } from "@/lib/email/template/serialize"

const MAX_LIMIT = 100

/**
 * GET /api/admin/operations/email/templates
 *
 * The template library. One page of rows plus the category counts.
 *
 * No MJML and no HTML in the response: a library of forty templates would
 * be megabytes. The editor asks for a version by its own endpoint.
 *
 * Query: search, category, page, limit.
 */
export async function GET(req: NextRequest) {
    try {
        await requireRole(req, EMAIL_ACCESS_ROLES)
        await dbConnect()

        const params = new URL(req.url).searchParams

        const search = (params.get("search") ?? "").trim().slice(0, 100)
        const rawCategory = Number(params.get("category"))
        const category = TEMPLATE_CATEGORIES.includes(rawCategory as never)
            ? rawCategory
            : null

        const page = Math.min(
            100_000,
            Math.max(1, Math.floor(Number(params.get("page"))) || 1)
        )
        const limit = Math.min(
            MAX_LIMIT,
            Math.max(1, Math.floor(Number(params.get("limit"))) || 24)
        )

        const filter: Record<string, unknown> = {}
        if (category !== null) filter.category = category
        if (search) {
            const re = { $regex: escapeRegex(search), $options: "i" }
            filter.$or = [{ name: re }, { description: re }, { tags: re }]
        }

        const [rows, total, categoryCounts] = await Promise.all([
            EmailTemplate.find(filter)
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<IEmailTemplate[]>(),
            EmailTemplate.countDocuments(filter),
            EmailTemplate.aggregate<{ _id: number; n: number }>([
                { $group: { _id: "$category", n: { $sum: 1 } } },
            ]),
        ])

        // The version numbers for this page only. One query, not one per row.
        const ids = rows.map((r) => r._id)
        const versions = await EmailTemplateVersion.aggregate<{
            _id: Types.ObjectId
            count: number
            latest: number
        }>([
            { $match: { templateId: { $in: ids } } },
            {
                $group: {
                    _id: "$templateId",
                    count: { $sum: 1 },
                    latest: { $max: "$version" },
                },
            },
        ])

        const byTemplate = new Map(versions.map((v) => [String(v._id), v]))

        return NextResponse.json({
            success: true,
            data: rows.map((row) => {
                const v = byTemplate.get(String(row._id))
                return serializeTemplateRow({
                    ...row,
                    versionCount: v?.count ?? 0,
                    currentVersion: v?.latest ?? 0,
                } as IEmailTemplate & { versionCount: number; currentVersion: number })
            }),
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
            counts: Object.fromEntries(categoryCounts.map((c) => [c._id, c.n])),
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the templates")
    }
}

/**
 * POST /api/admin/operations/email/templates
 *
 * Creates a template and its first version.
 *
 * A new template is not blank. It starts from the Zan starter, which
 * already carries a footer with the unsubscribe link and a postal address
 * token, so the parts the law requires are there before anyone types
 * anything. `mjml` in the body overrides it, which is how Import works.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_AUTHOR_ROLES)
        await dbConnect()

        const region = resolveWriteRegion(undefined, user)
        const body = await readJson(req)

        const name = requireString(body, "name", "A template name", 200)

        const existing = await EmailTemplate.findOne({ region, name })
        if (existing) {
            throw new EmailError(
                `A template called "${name}" already exists.`,
                409,
                { field: "name" }
            )
        }

        const category =
            readNumber(body, "category", 10, 60) ?? TEMPLATE_CATEGORY.GENERAL

        // The default sender's postal address goes into the starter footer,
        // so a new template is compliant without anybody remembering to add
        // it. With no identity yet, the token stays and is filled at send.
        const identity = await EmailSenderIdentity.findOne({ region })
            .sort({ isDefault: -1, createdAt: 1 })
            .lean<IEmailSenderIdentity>()

        const mjml =
            readString(body, "mjml", 512 * 1024) ??
            starterMjml({ postalAddress: identity?.postalAddress })

        // Compile before saving anything. A template that cannot compile is
        // not a template, and a half-created row would confuse the library.
        const compiled = compileMjml(mjml)

        const template = await EmailTemplate.create({
            region,
            name,
            description: readString(body, "description", 1000),
            category,
            tags: readTags(body.tags),
            createdBy: user.id,
        })

        const version = await EmailTemplateVersion.create({
            region,
            templateId: template._id,
            version: 1,
            // compiled.mjml, not mjml: the normalised source is what the
            // editor must be able to reopen. See template/normalise.ts.
            mjml: compiled.mjml,
            html: compiled.html,
            text: compiled.text,
            linkHosts: compiled.linkHosts,
            mergeTokens: compiled.mergeTokens,
            compileWarnings: compiled.warnings,
            htmlBytes: compiled.htmlBytes,
            note: "First version",
            createdBy: user.id,
        })

        template.currentVersionId = version._id as Types.ObjectId
        await template.save()

        return NextResponse.json(
            {
                success: true,
                data: serializeTemplateRow({
                    ...(template.toObject() as IEmailTemplate),
                    versionCount: 1,
                    currentVersion: 1,
                } as IEmailTemplate & { versionCount: number; currentVersion: number }),
            },
            { status: 201 }
        )
    } catch (error) {
        return errorResponse(error, "Failed to create the template")
    }
}

/** Up to ten short tags. Anything else in the field is ignored. */
function readTags(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 10)
}
