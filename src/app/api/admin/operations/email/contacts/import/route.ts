import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_AUTHOR_ROLES } from "@/constants/emailRoles"
import { resolveWriteRegion } from "@/lib/region-scope/resolveWriteRegion"
import { EmailError, errorResponse } from "@/lib/email/http"
import { MAX_IMPORT_BYTES, importContacts } from "@/lib/email/contacts/import"
import { checkRateLimit } from "@/lib/security/rateLimit"

/**
 * POST /api/admin/operations/email/contacts/import
 *
 * Imports a .xlsx or .csv of contacts.
 *
 * Existing addresses are updated rather than duplicated, keyed on the
 * normalised address, so importing a corrected file twice does not create
 * two of everybody.
 *
 * ## Consent is a decision the importer makes, in the open
 *
 * `marketingConsent` comes from a tick box with the wording beside it, not
 * from a default. The file name and the importer's note are stored on each
 * contact, so months later it can be shown where an address came from.
 * Importing with the box unticked is allowed and useful: the contacts are
 * stored but excluded from every audience until consent is recorded.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_AUTHOR_ROLES)

        const limit = checkRateLimit(`email-contact-import:${user.id}`, 10, 60_000)
        if (!limit.allowed) {
            throw new EmailError(
                `Too many imports. Try again in ${limit.retryAfterSec} seconds.`,
                429
            )
        }

        await dbConnect()
        const region = resolveWriteRegion(undefined, user)

        const form = await req.formData().catch(() => null)
        const file = form?.get("file")

        if (!form || !(file instanceof File)) {
            throw new EmailError("Choose a .xlsx or .csv file.", 400, {
                field: "file",
            })
        }

        if (file.size === 0) {
            throw new EmailError("That file is empty.", 400, { field: "file" })
        }

        if (file.size > MAX_IMPORT_BYTES) {
            throw new EmailError(
                `That file is ${Math.round(file.size / 1024 / 1024)} MB. The ` +
                `limit is ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`,
                413,
                { field: "file" }
            )
        }

        const tags = String(form.get("tags") ?? "")
            .split(/[,;]/)
            .map((t) => t.trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 10)

        const result = await importContacts(await file.arrayBuffer(), {
            region,
            fileName: file.name,
            userId: user.id,
            marketingConsent: form.get("marketingConsent") === "true",
            consentNote: String(form.get("consentNote") ?? "").trim() || undefined,
            tags,
        })

        return NextResponse.json({ success: true, data: result })
    } catch (error) {
        return errorResponse(error, "Failed to import the contacts")
    }
}
