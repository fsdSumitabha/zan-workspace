import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import {
    EMAIL_ACCESS_ROLES,
    EMAIL_AUTHOR_ROLES,
    EMAIL_MANAGE_ROLES,
} from "@/constants/emailRoles"
import EmailAsset, { type IEmailAsset } from "@/models/EmailAsset"
import { imagekit } from "@/lib/imagekit/imagekit"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import { EmailError, errorResponse, isObjectId } from "@/lib/email/http"
import { escapeRegex } from "@/lib/search/escapeRegex"
import { ASSET_CATEGORIES, ASSET_CATEGORY } from "@/constants/emailStatus"
import {
    MAX_ASSET_BYTES,
    readImageSize,
    serializeAsset,
    sniffImageType,
} from "@/lib/email/template/assets"
import { checkRateLimit } from "@/lib/security/rateLimit"

/**
 * GET /api/admin/operations/email/assets
 *
 * The image library, newest first. The editor's Assets panel reads this.
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
        const category = ASSET_CATEGORIES.includes(rawCategory as never)
            ? rawCategory
            : null

        const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1)
        const limit = Math.min(
            100,
            Math.max(1, Math.floor(Number(params.get("limit"))) || 60)
        )

        const filter: Record<string, unknown> = {}
        if (category !== null) filter.category = category
        if (search) {
            const re = { $regex: escapeRegex(search), $options: "i" }
            filter.$or = [{ name: re }, { tags: re }, { altTextDefault: re }]
        }

        const [rows, total] = await Promise.all([
            EmailAsset.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<IEmailAsset[]>(),
            EmailAsset.countDocuments(filter),
        ])

        return NextResponse.json({
            success: true,
            data: rows.map(serializeAsset),
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
        })
    } catch (error) {
        return errorResponse(error, "Failed to load the assets")
    }
}

/**
 * POST /api/admin/operations/email/assets
 *
 * Uploads an image to ImageKit and records it in the library.
 *
 * ## Why ImageKit and not the filesystem
 *
 * Vercel throws the function filesystem away on every deploy. The app
 * already has this problem with call recordings (see OVERVIEW.md, known
 * issues) and it is not worth repeating: an email sent in March must still
 * show its images in September.
 *
 * ## The type check reads bytes, not names
 *
 * `file.type` is whatever the browser chose to send, and an extension is
 * just text. `sniffImageType` reads the file's own header and refuses
 * anything that is not really a PNG, JPEG, GIF or WebP.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_AUTHOR_ROLES)

        const limit = checkRateLimit(`email-asset-upload:${user.id}`, 30, 60_000)
        if (!limit.allowed) {
            throw new EmailError(
                `Too many uploads. Try again in ${limit.retryAfterSec} seconds.`,
                429
            )
        }

        await dbConnect()
        const region = resolveWriteRegion(undefined, user)

        const form = await req.formData().catch(() => null)
        const file = form?.get("file")

        if (!form || !(file instanceof File)) {
            throw new EmailError("Choose an image to upload.", 400, {
                field: "file",
            })
        }

        if (file.size > MAX_ASSET_BYTES) {
            throw new EmailError(
                `That image is ${Math.round(file.size / 1024 / 1024 * 10) / 10} MB. ` +
                `The limit is ${MAX_ASSET_BYTES / 1024 / 1024} MB. Large images ` +
                "also make emails slow to open.",
                413,
                { field: "file" }
            )
        }

        if (file.size === 0) {
            throw new EmailError("That file is empty.", 400, { field: "file" })
        }

        const buffer = Buffer.from(await file.arrayBuffer())

        // Throws a 415 when the bytes are not one of the four formats.
        const mimeType = sniffImageType(buffer)
        const size = readImageSize(buffer, mimeType)

        const rawName = String(form.get("name") ?? file.name ?? "image")
        const name = rawName.trim().slice(0, 200) || "image"

        const rawCategory = Number(form.get("category"))
        const category = ASSET_CATEGORIES.includes(rawCategory as never)
            ? rawCategory
            : ASSET_CATEGORY.GENERAL

        const safeName = file.name.replace(/[^\w.-]/g, "_").slice(0, 120)

        const uploaded = await imagekit.upload({
            file: buffer,
            fileName: `${Date.now()}-${safeName}`,
            folder: "/email-assets",
            useUniqueFileName: true,
            tags: ["email-asset", `region:${region}`],
        })

        const asset = await EmailAsset.create({
            region,
            name,
            url: uploaded.url,
            imagekitFileId: uploaded.fileId,
            thumbnailUrl: uploaded.thumbnailUrl ?? "",
            width: size?.width,
            height: size?.height,
            sizeBytes: file.size,
            mimeType,
            altTextDefault: String(form.get("altText") ?? "").trim().slice(0, 300),
            category,
            uploadedBy: user.id,
        })

        return NextResponse.json(
            {
                success: true,
                data: serializeAsset(asset.toObject() as IEmailAsset),
            },
            { status: 201 }
        )
    } catch (error) {
        return errorResponse(error, "Failed to upload the image")
    }
}

/**
 * DELETE /api/admin/operations/email/assets?id=...
 *
 * Soft deletes the library row and removes the file from ImageKit.
 *
 * A template that already uses the image keeps a plain URL to it, so
 * deleting here will break that image in any email sent afterwards. The UI
 * warns about that; we do not try to find every template that references
 * the URL, because an email already delivered cannot be fixed either way.
 */
export async function DELETE(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_MANAGE_ROLES)
        await dbConnect()

        const id = new URL(req.url).searchParams.get("id")
        if (!isObjectId(id)) {
            throw new EmailError("Which image?", 400, { field: "id" })
        }

        const asset = await EmailAsset.findById(id)
        if (!asset) {
            throw new EmailError("That image was not found.", 404)
        }

        if (asset.imagekitFileId) {
            try {
                await imagekit.deleteFile(asset.imagekitFileId)
            } catch (error) {
                // The row still goes. A file left behind in ImageKit costs a
                // little storage; a row that cannot be removed because the
                // CDN is down is worse.
                console.error("[email] ImageKit delete failed:", error)
            }
        }

        asset.deletedAt = new Date()
        asset.deletedBy = user.id as never
        await asset.save()

        return NextResponse.json({ success: true, data: { _id: id } })
    } catch (error) {
        return errorResponse(error, "Failed to remove the image")
    }
}
