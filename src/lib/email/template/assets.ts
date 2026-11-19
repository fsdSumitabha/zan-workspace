import type { IEmailAsset } from "@/models/EmailAsset"
import type { EmailAssetView } from "@/types/email"
import { EmailError } from "@/lib/email/http"

/** Images only, and only the formats every mail client renders. */
export const ALLOWED_IMAGE_TYPES = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
] as const

export const MAX_ASSET_BYTES = 5 * 1024 * 1024

/**
 * Magic numbers for the formats we accept.
 *
 * The browser's `file.type` is whatever the browser felt like sending, and
 * a renamed `.exe` arrives as `image/png` if the client says so. These are
 * the first bytes of the real file, which is the only thing worth
 * trusting.
 */
const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
    { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
    { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
    { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
    // WEBP is "RIFF....WEBP": check the RIFF header and the WEBP tag at 8.
    { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
]

/**
 * Works out what a file really is, from its bytes.
 *
 * Returns the MIME type, or throws when the bytes are not one of the
 * formats we accept. Never trusts the declared type or the extension.
 */
export function sniffImageType(buffer: Buffer): string {
    for (const sig of SIGNATURES) {
        const offset = sig.offset ?? 0
        const matches = sig.bytes.every((b, i) => buffer[offset + i] === b)

        if (!matches) continue

        if (sig.mime === "image/webp") {
            // "WEBP" at byte 8, after the RIFF size field.
            const tag = buffer.subarray(8, 12).toString("ascii")
            if (tag !== "WEBP") continue
        }

        return sig.mime
    }

    throw new EmailError(
        "That file is not a PNG, JPEG, GIF or WebP image. Images are the only " +
        "thing an email can carry.",
        415,
        { field: "file" }
    )
}

/**
 * Width and height, read from the file header.
 *
 * Only PNG, GIF and JPEG are read; WebP returns null and the editor simply
 * does not pre-fill the size. Dimensions are a convenience, so a format we
 * cannot measure is not an error.
 */
export function readImageSize(
    buffer: Buffer,
    mime: string
): { width: number; height: number } | null {
    try {
        if (mime === "image/png") {
            // IHDR width and height are big-endian at bytes 16 and 20.
            return {
                width: buffer.readUInt32BE(16),
                height: buffer.readUInt32BE(20),
            }
        }

        if (mime === "image/gif") {
            // Little-endian, at bytes 6 and 8.
            return {
                width: buffer.readUInt16LE(6),
                height: buffer.readUInt16LE(8),
            }
        }

        if (mime === "image/jpeg") {
            // Walk the segment markers to SOF0..SOF3, which carry the size.
            let i = 2
            while (i < buffer.length - 9) {
                if (buffer[i] !== 0xff) {
                    i++
                    continue
                }
                const marker = buffer[i + 1]
                if (marker >= 0xc0 && marker <= 0xc3) {
                    return {
                        height: buffer.readUInt16BE(i + 5),
                        width: buffer.readUInt16BE(i + 7),
                    }
                }
                i += 2 + buffer.readUInt16BE(i + 2)
            }
        }
    } catch {
        // A truncated or odd header. Not worth failing an upload over.
    }

    return null
}

export function serializeAsset(row: IEmailAsset): EmailAssetView {
    return {
        _id: String(row._id),
        name: row.name,
        url: row.url,
        thumbnailUrl: row.thumbnailUrl ?? "",
        width: row.width ?? null,
        height: row.height ?? null,
        sizeBytes: row.sizeBytes ?? 0,
        mimeType: row.mimeType,
        altTextDefault: row.altTextDefault ?? "",
        category: row.category,
        tags: row.tags ?? [],
        createdAt: row.createdAt.toISOString(),
    }
}
