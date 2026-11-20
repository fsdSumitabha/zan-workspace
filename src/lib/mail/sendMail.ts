import { getMailTransporter } from "./transporter"
import { requireMailAccount, type MailAccount } from "./accounts"

/**
 * Sends one transactional mail from a named mailbox.
 *
 * `account` is required, and that is the point of it. The caller has to say
 * whether this is HR mail or sales mail, because the two go out from
 * different addresses to different kinds of reader. A default would quietly
 * put every new message back in one mailbox, which is what this split
 * undid.
 *
 * Bulk campaigns do not come through here. They go through the email
 * marketing engine, which has its own transport, rate limits and kill
 * switch. See src/lib/email/delivery/send.ts.
 */

/** One file to send with the message. */
export interface MailAttachment {
    filename: string
    content: Buffer
    /** The MIME type. Left out, Nodemailer guesses from the filename. */
    contentType?: string
}

interface SendMailOptions {
    /** Which mailbox it is from. See MAIL_ACCOUNT in ./accounts. */
    account: MailAccount
    to: string
    subject: string
    html: string
    /**
     * The plain text version. Worth sending: some clients show it, and a
     * message with no text part scores worse with spam filters.
     */
    text?: string
    attachments?: MailAttachment[]
}

export async function sendMail(options: SendMailOptions) {
    const { account, ...message } = options

    // Read the settings before the transporter, so a missing variable is
    // reported as a missing variable rather than a connection failure.
    const settings = requireMailAccount(account)

    await getMailTransporter(account).sendMail({
        from: settings.user,
        ...message,
    })
}
