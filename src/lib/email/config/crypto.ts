import crypto from "crypto"
import { EmailError } from "@/lib/email/http"

/**
 * Encrypts and decrypts the SMTP password.
 *
 * AES-256-GCM, so a tampered ciphertext fails to decrypt rather than
 * producing rubbish. The key comes from EMAIL_SECRET_KEY, which must be 64
 * hex characters (32 bytes).
 *
 * Generate one with:
 *
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * ## Why encrypt at all, when the database is already private
 *
 * A database backup, an export, or a read-only Atlas user would otherwise
 * carry a working password for the company's mail account. Encrypting it
 * means the database alone is not enough to send mail as Zan Services.
 *
 * ## Changing the key
 *
 * There is no key rotation here. Changing EMAIL_SECRET_KEY makes every
 * stored password unreadable, and the settings screen will ask for them
 * again. That is the intended recovery path: re-enter the password.
 */

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12

export interface EncryptedSecret {
    cipher: string
    iv: string
    tag: string
}

function readKey(): Buffer {
    const raw = process.env.EMAIL_SECRET_KEY

    if (!raw) {
        throw new EmailError(
            "EMAIL_SECRET_KEY is not set. Add it to .env.local before saving " +
            "SMTP settings.",
            500
        )
    }

    const key = Buffer.from(raw.trim(), "hex")

    if (key.length !== 32) {
        throw new EmailError(
            "EMAIL_SECRET_KEY must be 64 hex characters (32 bytes). Generate " +
            "one with: node -e \"console.log(require('crypto')" +
            ".randomBytes(32).toString('hex'))\"",
            500
        )
    }

    return key
}

/** True when the key is present and the right length. For the settings UI. */
export function hasValidSecretKey(): boolean {
    try {
        readKey()
        return true
    } catch {
        return false
    }
}

export function encryptSecret(plain: string): EncryptedSecret {
    const key = readKey()
    const iv = crypto.randomBytes(IV_BYTES)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    const encrypted = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final(),
    ])

    return {
        cipher: encrypted.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
    }
}

/**
 * Decrypts a stored password.
 *
 * Throws when the key is wrong or the ciphertext was tampered with. The
 * caller should treat that as "ask for the password again", not as a
 * transient error to retry.
 */
export function decryptSecret(secret: EncryptedSecret): string {
    const key = readKey()

    try {
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            key,
            Buffer.from(secret.iv, "base64")
        )
        decipher.setAuthTag(Buffer.from(secret.tag, "base64"))

        return Buffer.concat([
            decipher.update(Buffer.from(secret.cipher, "base64")),
            decipher.final(),
        ]).toString("utf8")
    } catch {
        throw new EmailError(
            "The stored SMTP password could not be read. It was saved with a " +
            "different EMAIL_SECRET_KEY. Enter the password again in Settings.",
            500
        )
    }
}

/**
 * A stable fingerprint of a provider's connection settings.
 *
 * The transport factory uses it to notice that the settings changed and
 * rebuild the pool. It is a hash, so it never carries the password itself
 * into a log line or a cache key.
 */
export function configFingerprint(parts: {
    host: string
    port: number
    secure: boolean
    user: string
    passCipher?: string
    maxConnections: number
    maxMessages: number
}): string {
    return crypto
        .createHash("sha256")
        .update(
            [
                parts.host,
                parts.port,
                parts.secure,
                parts.user,
                parts.passCipher ?? "",
                parts.maxConnections,
                parts.maxMessages,
            ].join("|")
        )
        .digest("hex")
        .slice(0, 32)
}
