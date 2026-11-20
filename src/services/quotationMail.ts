import Quotation from "@/models/Quotation"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import { ENTITY_TYPE, ENTITY_TYPE_META, type EntityType } from "@/constants/entityTypes"
import { MAIL_ACCOUNT } from "@/lib/mail/accounts"
import { sendMail, type MailAttachment } from "@/lib/mail/sendMail"
import { quotationMailTemplate } from "@/lib/templates/quotationMailTemplate"

/**
 * Emails a quotation to the client, from the sales mailbox.
 *
 * ## The rule this follows
 *
 * The quotation is saved before this runs, and the CRM is the record. So a
 * mail failure never undoes the quotation. The failure is saved on the
 * quotation instead (`mail.error`), and the timeline shows it with a Try
 * again button. This is the same arrangement as a meeting that could not
 * reach Google Calendar. See src/lib/google/calendar/syncMeeting.ts.
 *
 * It therefore never throws. Every outcome comes back as a result.
 *
 * ## Why the sales mailbox
 *
 * A quotation goes to a customer, and a customer who replies must reach
 * sales. The HR mailbox is for the user module. See
 * src/lib/mail/accounts.ts.
 */

/**
 * What happened.
 * - sent: the mail server took it. `to` is where it went.
 * - failed: it did not go. `message` says why, in words a salesperson can
 *   act on, and the quotation keeps it.
 */
export type QuotationMailResult =
    | { status: "sent"; to: string; attached: boolean; message: string }
    | { status: "failed"; message: string }

/** The quotation fields this needs. A document or a lean object both work. */
export interface SendableQuotation {
    _id: unknown
    entityType: number
    entityId: unknown
    title?: string
    amount: number
    gst_percentage: number
    url?: string
    mail?: { attempts?: number } | null
}

/**
 * The largest file we will attach, in bytes.
 *
 * Gmail refuses anything over 25MB, and a big attachment makes the person
 * who pressed Send wait for the upload. Over this, the email still carries
 * the link, so the client can always get the document. The create form caps
 * uploads at 10MB, so in practice nothing reaches this.
 */
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

/** How long to wait for the file. The sending request is held open for it. */
const FILE_FETCH_TIMEOUT_MS = 20_000

export async function sendQuotationMail(
    quotation: SendableQuotation,
    extra?: { description?: string }
): Promise<QuotationMailResult> {
    const id = String(quotation._id)

    try {
        const recipient = await resolveRecipient(
            quotation.entityType,
            String(quotation.entityId)
        )

        if (!recipient) {
            return record(id, {
                status: "failed",
                message: `This quotation's ${parentLabel(
                    quotation.entityType
                ).toLowerCase()} could not be found, so there is nobody to send it to.`,
            })
        }

        if (!recipient.email) {
            return record(id, {
                status: "failed",
                message: `${
                    recipient.name || parentLabel(quotation.entityType)
                } has no email address, so the quotation was not sent. Add one, then press Try again.`,
            })
        }

        const attachment = await loadAttachment(quotation.url)

        const mail = quotationMailTemplate({
            recipientName: recipient.name || "there",
            title: quotation.title,
            description: extra?.description,
            amount: quotation.amount,
            gstPercentage: quotation.gst_percentage,
            fileUrl: quotation.url,
            attached: Boolean(attachment.file),
        })

        await sendMail({
            account: MAIL_ACCOUNT.SALES,
            to: recipient.email,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            attachments: attachment.file ? [attachment.file] : undefined,
        })

        return record(id, {
            status: "sent",
            to: recipient.email,
            attached: Boolean(attachment.file),
            message: attachment.note
                ? `Quotation emailed to ${recipient.email}. ${attachment.note}`
                : `Quotation emailed to ${recipient.email}.`,
        })
    } catch (err) {
        console.error(`[quotation-mail] sending quotation ${id} failed:`, err)
        return record(id, { status: "failed", message: explain(err) })
    }
}

/**
 * The client's or lead's name and address.
 *
 * A project has no address of its own, so it uses its client's. That is the
 * same answer src/lib/google/calendar/resolveEntityEmail.ts gives for a
 * meeting, and the two must not disagree: a client who gets a meeting
 * invite at one address and a quotation at another would be confused, and
 * rightly.
 *
 * Returns null when the parent record itself is gone. That is different
 * from a parent with no address, and the caller says something different
 * about each.
 */
async function resolveRecipient(
    entityType: number,
    entityId: string
): Promise<{ name: string; email: string } | null> {
    switch (entityType) {
        case ENTITY_TYPE.LEAD: {
            const lead = await Lead.findById(entityId)
                .select("name email")
                .lean<{ name?: string; email?: string }>()
            if (!lead) return null
            return { name: lead.name ?? "", email: (lead.email ?? "").trim() }
        }
        case ENTITY_TYPE.CLIENT: {
            const client = await Client.findById(entityId)
                .select("name email")
                .lean<{ name?: string; email?: string }>()
            if (!client) return null
            return { name: client.name ?? "", email: (client.email ?? "").trim() }
        }
        case ENTITY_TYPE.PROJECT: {
            const project = await Project.findById(entityId)
                .select("clientId")
                .lean<{ clientId?: unknown }>()
            if (!project) return null
            if (!project.clientId) return { name: "", email: "" }

            const client = await Client.findById(String(project.clientId))
                .select("name email")
                .lean<{ name?: string; email?: string }>()
            if (!client) return { name: "", email: "" }
            return { name: client.name ?? "", email: (client.email ?? "").trim() }
        }
        default:
            return null
    }
}

function parentLabel(entityType: number): string {
    return ENTITY_TYPE_META[entityType as EntityType]?.label ?? "record"
}

/**
 * Fetches the uploaded quotation file so it can be attached.
 *
 * Nodemailer could take the URL and fetch it itself, but then a file that
 * is missing or far too big surfaces as an opaque send failure. Fetching it
 * here means a size problem is reported as a size problem, and the email
 * still goes out with the link in it.
 *
 * A quotation with no file is normal: the figures are in the email body.
 */
async function loadAttachment(
    url?: string
): Promise<{ file?: MailAttachment; note?: string }> {
    if (!url) return {}

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FILE_FETCH_TIMEOUT_MS)

    try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) {
            return {
                note: "The file could not be attached, so the email links to it instead.",
            }
        }

        // Trust the body over the header: a wrong Content-Length would
        // otherwise let an oversized file through.
        const bytes = Buffer.from(await res.arrayBuffer())
        if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
            return {
                note: "The file was too large to attach, so the email links to it instead.",
            }
        }

        return {
            file: {
                filename: filenameFromUrl(url),
                content: bytes,
                contentType: res.headers.get("content-type") ?? undefined,
            },
        }
    } catch (err) {
        console.error(`[quotation-mail] could not fetch ${url}:`, err)
        return {
            note: "The file could not be attached, so the email links to it instead.",
        }
    } finally {
        clearTimeout(timer)
    }
}

/**
 * A filename for the attachment, taken from the URL.
 *
 * Uploads are stored as `<timestamp>-<original name>`, so the timestamp is
 * dropped: a client should see "proposal.pdf", not "1764..-proposal.pdf".
 */
export function filenameFromUrl(url: string): string {
    const path = url.split("?")[0].split("#")[0]
    const last = decodeURIComponent(path.split("/").pop() || "")
    const cleaned = last.replace(/^\d{10,}-/, "").trim()
    return cleaned || "quotation.pdf"
}

/**
 * Saves the outcome on the quotation, then returns it.
 *
 * updateOne, not save: this is bookkeeping about a message, not a change a
 * person made to the quotation, so it stays out of the activity log. Same
 * reasoning as the meeting sync.
 */
async function record(
    id: string,
    result: QuotationMailResult
): Promise<QuotationMailResult> {
    const update =
        result.status === "sent"
            ? {
                  $set: {
                      "mail.status": "sent",
                      "mail.to": result.to,
                      "mail.sentAt": new Date(),
                  },
                  $inc: { "mail.attempts": 1 },
                  $unset: { "mail.error": "" },
              }
            : {
                  $set: {
                      "mail.status": "failed",
                      "mail.error": result.message,
                  },
                  $inc: { "mail.attempts": 1 },
              }

    try {
        await Quotation.updateOne({ _id: id }, update)
    } catch (err) {
        console.error(
            `[quotation-mail] could not save the mail result of quotation ${id}:`,
            err
        )
    }

    return result
}

/**
 * Turns a thrown error into one line a salesperson can act on.
 *
 * The missing-account message from requireMailAccount is already written
 * for a person, and it names the environment variable to add, so it is
 * passed through whole.
 */
function explain(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err)

    if (raw.includes("mail account is not set up")) return raw

    const code = (err as { code?: string } | null)?.code
    if (code === "EAUTH") {
        return "The sales mailbox refused the sign-in. Check SALES_SMTP_USER and SALES_SMTP_PASS, then press Try again."
    }
    if (code === "ECONNECTION" || code === "ECONNREFUSED" || code === "EDNS") {
        return "The mail server could not be reached. Check SALES_SMTP_HOST and SALES_SMTP_PORT, then press Try again."
    }
    if (code === "ETIMEDOUT" || code === "ESOCKET") {
        return "The mail server timed out. Press Try again."
    }
    if (code === "EENVELOPE") {
        return `The mail server would not accept the address (${raw.slice(
            0,
            120
        )}). Check the email address on the record.`
    }

    return `The quotation was not emailed (${raw.slice(0, 160)}). Press Try again.`
}
