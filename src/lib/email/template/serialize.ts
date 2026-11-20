import type { IEmailTemplate } from "@/models/EmailTemplate"
import type { IEmailTemplateVersion } from "@/models/EmailTemplateVersion"
import type { EmailTemplateRow, EmailTemplateVersionView } from "@/types/email"

/**
 * Rows for the template list and the editor.
 *
 * `mjml` and `html` are large. The list never sends them; only the editor
 * and the preview ask for a full version. That keeps a library of forty
 * templates to a few kilobytes instead of a few megabytes.
 */

export function serializeTemplateRow(
    row: IEmailTemplate & { versionCount?: number; currentVersion?: number }
): EmailTemplateRow {
    return {
        _id: String(row._id),
        name: row.name,
        description: row.description ?? "",
        category: row.category,
        tags: row.tags ?? [],
        thumbnailUrl: row.thumbnailUrl ?? "",
        currentVersionId: row.currentVersionId ? String(row.currentVersionId) : null,
        currentVersion: row.currentVersion ?? 0,
        versionCount: row.versionCount ?? 0,
        hasDraft: Boolean(row.draftMjml),
        draftSavedAt: row.draftSavedAt ? row.draftSavedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    }
}

export function serializeVersion(
    row: IEmailTemplateVersion,
    options: { includeSource?: boolean } = {}
): EmailTemplateVersionView {
    return {
        _id: String(row._id),
        templateId: String(row.templateId),
        version: row.version,
        mjml: options.includeSource ? row.mjml : "",
        html: options.includeSource ? row.html : "",
        linkHosts: row.linkHosts ?? [],
        mergeTokens: row.mergeTokens ?? [],
        compileWarnings: row.compileWarnings ?? [],
        htmlBytes: row.htmlBytes ?? 0,
        note: row.note ?? "",
        createdAt: row.createdAt.toISOString(),
    }
}
