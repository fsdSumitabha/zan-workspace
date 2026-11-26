import { z } from "zod"
import { REGION_CODES } from "@/lib/region"
import { IntegrationError, type FieldProblem } from "./http"

/**
 * What a website sends to /api/integrations/leads and
 * /api/integrations/newsletter. The two websites send exactly this; their
 * copies of it are in server/services/workspace.service.ts in each repo.
 * docs/website-integrations.md has the whole contract with examples.
 *
 * Free text is cleaned and cut to its limit rather than refused, so a long
 * ad link or message can never cost a lead. Identifiers, the region and the
 * dates are checked strictly: a wrong one is a bug in the website.
 */

// Control characters, except tab and newline in multi-line text.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cleanLine(value: string, max: number): string {
    return value.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, max)
}

function cleanText(value: string, max: number): string {
    return value
        .replace(/\r\n?/g, "\n")
        .replace(CONTROL, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max)
}

/** A required line of text. */
const line = (max: number, field: string) =>
    z.string().transform((v) => cleanLine(v, max)).refine((v) => v.length > 0, `${field} is required`)

/** A line of text that may be missing, null or empty. Empty becomes null. */
const optionalLine = (max: number) =>
    z
        .union([z.string(), z.null()])
        .optional()
        .transform((v) => (v ? cleanLine(v, max) : "") || null)

const optionalText = (max: number) =>
    z
        .union([z.string(), z.null()])
        .optional()
        .transform((v) => (v ? cleanText(v, max) : "") || null)

const list = (itemMax: number) =>
    z
        .array(z.string())
        .max(50)
        .optional()
        .transform((items) => (items ?? []).map((item) => cleanLine(item, itemMax)).filter(Boolean))

/** Lower case. A lead may come without one. */
const optionalEmail = z
    .union([z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
        const value = v?.trim().toLowerCase() ?? ""
        if (!value) return null
        if (value.length > 254 || !EMAIL_SHAPE.test(value)) {
            ctx.addIssue({ code: "custom", message: "email is not a valid address" })
            return z.NEVER
        }
        return value
    })

/** Every body starts with these. */
const envelope = {
    /** Made by the website for this one record. Also sent as Idempotency-Key. */
    id: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, "id must be 8 to 100 letters, digits, - or _"),
    /** The website's id. It must be the website whose key was sent. */
    source: z.string().min(1).max(60),
    /** When the website received the form. */
    sentAt: z.iso.datetime({ offset: true }),
    region: z.enum(REGION_CODES),
    /** Which form on the website, as a snake_case id. See FORM_LABELS. */
    form: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, "form must be a short snake_case id"),
    /** Host, path and query string of the page the form was on. */
    page: optionalLine(500),
}

const chatSchema = z.object({
    conversationId: line(100, "chat.conversationId"),
    leadScore: optionalLine(20),
    service: optionalLine(120),
    projectType: optionalLine(200),
    budget: optionalLine(200),
    timeline: optionalLine(200),
    requirements: list(200),
    technology: list(200),
    summary: optionalText(2000),
})

export const leadSchema = z.object({
    ...envelope,
    name: line(120, "name"),
    /** Not every form asks for one: the chat assistant's card does not. */
    email: optionalEmail,
    /**
     * Required: every lead form on both websites asks for it, and every lead
     * in the CRM has one (Lead.phone is required and unique). E.164 when the
     * website could read it, otherwise as the person typed it.
     */
    phone: line(40, "phone"),
    service: optionalLine(120),
    /** The package picked on a landing page. */
    interest: optionalLine(120),
    message: optionalText(5000),
    /** The chat assistant's notes. Only for the chat_widget form. */
    chat: chatSchema.nullable().optional().transform((v) => v ?? null),
})

export const newsletterSchema = z.object({
    ...envelope,
    /** Checked and normalised with readAddress, like an imported contact. */
    email: z.string().trim().min(3).max(320),
    consent: z.object({
        /** The exact words next to the box the person ticked. */
        text: z
            .string()
            .transform((v) => cleanText(v, 1000))
            .refine((v) => v.length > 0, "consent.text is required"),
        /** Which version of those words. Changes whenever the words do. */
        version: line(40, "consent.version"),
        /** When the person agreed, by the website's clock. */
        at: z.iso.datetime({ offset: true }),
    }),
})

export type LeadBody = z.output<typeof leadSchema>
export type NewsletterBody = z.output<typeof newsletterSchema>

/** Every body has these, whichever route it goes to. */
export type EnvelopeBody = Pick<LeadBody, "id" | "source" | "sentAt" | "region" | "form" | "page">

/** Parses a body, or throws 400 with one line per problem. */
export function parseContract<T>(schema: z.ZodType<T>, raw: unknown): T {
    const parsed = schema.safeParse(raw)
    if (parsed.success) return parsed.data

    const details: FieldProblem[] = parsed.error.issues.slice(0, 20).map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
    }))
    throw new IntegrationError("The body does not match the contract.", 400, details)
}

/**
 * The forms the websites have today, as the CRM shows them. A form that is
 * not listed is still accepted, and shows by its id, so a new form on a
 * website does not need a zan-workspace release first.
 */
export const FORM_LABELS: Record<string, string> = {
    contact_form: "Contact form",
    contact_modal: "Contact popup",
    service_page_form: "Service page form",
    landing_page_form: "Landing page form",
    chat_widget: "Chat assistant",
    webmcp: "AI agent (WebMCP)",
    api: "API",
    newsletter_form: "Newsletter form",
}

export function formLabel(form: string): string {
    return FORM_LABELS[form] ?? form
}
