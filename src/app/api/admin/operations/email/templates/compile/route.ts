import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import { requireRole } from "@/lib/auth/requireRole"
import { EMAIL_AUTHOR_ROLES } from "@/constants/emailRoles"
import { errorResponse, readJson, requireString } from "@/lib/email/http"
import { compileMjml } from "@/lib/email/template/compile"
import { renderMerge } from "@/lib/email/personalise/render"
import {
    findUnknownTokens,
    sampleMergeData,
    defaultFallbacks,
} from "@/lib/email/personalise/tokens"
import { checkRateLimit } from "@/lib/security/rateLimit"
import { EmailError } from "@/lib/email/http"
import type { CompileResponse } from "@/types/email"

/**
 * POST /api/admin/operations/email/templates/compile
 *
 * Compiles MJML and hands back the HTML, without saving anything.
 *
 * The editor calls this for the real preview and for the "check before you
 * save" pass. It is the same function the save route uses, so what the
 * designer previews is what the save would store.
 *
 * ## Why it is rate limited
 *
 * Compiling is CPU work on a shared server, and this route takes arbitrary
 * input from a logged-in author. On the Vercel Hobby plan there is no
 * overage billing: exceeding the Active CPU allowance pauses the whole
 * project for 30 days, taking the rest of the CRM down with it. A cap of
 * 60 a minute per person is far above normal editing and well below
 * anything that could do that.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireRole(req, EMAIL_AUTHOR_ROLES)

        const limit = checkRateLimit(`email-compile:${user.id}`, 60, 60_000)
        if (!limit.allowed) {
            throw new EmailError(
                `Too many previews. Try again in ${limit.retryAfterSec} seconds.`,
                429
            )
        }

        await dbConnect()

        const body = await readJson(req)
        const mjml = requireString(body, "mjml", "The template content", 512 * 1024)

        const compiled = compileMjml(mjml)

        // The preview fills merge tokens with sample values, so a designer
        // sees "Hello Priya," rather than "Hello {{first_name}},". Unknown
        // tokens are left visible on purpose: a typo such as {{firstname}}
        // should look wrong, not disappear.
        const preview = body.withSampleData === false
            ? { text: compiled.html }
            : renderMerge(compiled.html, {
                  data: sampleMergeData(),
                  fallbacks: defaultFallbacks(),
              })

        const data: CompileResponse = {
            html: preview.text,
            text: compiled.text,
            linkHosts: compiled.linkHosts,
            mergeTokens: compiled.mergeTokens,
            unknownTokens: findUnknownTokens(mjml),
            warnings: compiled.warnings,
            htmlBytes: compiled.htmlBytes,
        }

        return NextResponse.json({ success: true, data })
    } catch (error) {
        return errorResponse(error, "The template could not be compiled")
    }
}
