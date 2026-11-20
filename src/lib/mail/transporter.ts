import nodemailer, { type Transporter } from "nodemailer"
import { requireMailAccount, type MailAccount } from "./accounts"

/**
 * One SMTP transporter per mailbox, built the first time it is asked for.
 *
 * ## Why one per account
 *
 * There used to be a single exported transporter, built when this module
 * was first imported. That had two problems. It tied the whole app to one
 * mailbox, and it ran `createTransport` at import time, so a missing
 * environment variable produced a broken object rather than an error
 * anybody could read.
 *
 * Now each account gets its own, on demand. The HR mailbox and the sales
 * mailbox hold separate connections and separate credentials, and neither
 * one is built until something actually sends from it.
 *
 * ## Why caching by account alone is enough
 *
 * These settings come from environment variables, which do not change while
 * the process lives. The marketing engine caches by a fingerprint of its
 * settings because those live in the database and an admin can edit them
 * mid-campaign. Nothing like that applies here.
 */

const cache = new Map<MailAccount, Transporter>()

/**
 * The transporter for one mailbox.
 *
 * Throws, with the missing variable names, when that mailbox is not set up.
 * Failing here is deliberate: the alternative is sending a customer's
 * quotation out of the HR mailbox.
 */
export function getMailTransporter(account: MailAccount): Transporter {
    const existing = cache.get(account)
    if (existing) return existing

    const settings = requireMailAccount(account)

    const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: {
            user: settings.user,
            pass: settings.pass,
        },
    })

    cache.set(account, transporter)
    return transporter
}

/**
 * Closes every open transporter. For scripts and tests, so a process can
 * exit instead of hanging on a socket.
 */
export function closeMailTransporters(): void {
    for (const transporter of cache.values()) {
        try {
            transporter.close()
        } catch {
            // A transporter that is already shut is not a problem.
        }
    }
    cache.clear()
}
