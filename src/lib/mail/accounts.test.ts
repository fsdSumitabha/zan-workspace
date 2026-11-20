import test from "node:test"
import assert from "node:assert/strict"

import {
    MAIL_ACCOUNT,
    mailAccountConnection,
    mailAccountReady,
    readMailAccount,
    requireMailAccount,
} from "./accounts"

/**
 * The point of these tests is one rule: sales mail must never fall back to
 * the HR mailbox. Everything else here is the compatibility that keeps a
 * deployed environment working while nobody has renamed anything yet.
 */

const KEYS = [
    "HR_SMTP_HOST",
    "HR_SMTP_PORT",
    "HR_SMTP_USER",
    "HR_SMTP_PASS",
    "SALES_SMTP_HOST",
    "SALES_SMTP_PORT",
    "SALES_SMTP_USER",
    "SALES_SMTP_PASS",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
] as const

/**
 * Runs a case with only the given variables set.
 *
 * Every one of the twelve names is cleared first, so a value left in the
 * developer's own .env cannot change the result. The previous values are
 * put back afterwards, including the absent ones.
 */
function withEnv(values: Partial<Record<(typeof KEYS)[number], string>>, body: () => void) {
    const saved = new Map<string, string | undefined>()

    for (const key of KEYS) {
        saved.set(key, process.env[key])
        delete process.env[key]
    }

    for (const [key, value] of Object.entries(values)) {
        process.env[key] = value
    }

    try {
        body()
    } finally {
        for (const key of KEYS) {
            const value = saved.get(key)
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        }
    }
}

const HR = {
    HR_SMTP_HOST: "smtp.gmail.com",
    HR_SMTP_PORT: "587",
    HR_SMTP_USER: "hr@example.invalid",
    HR_SMTP_PASS: "hr-secret",
} as const

const SALES = {
    SALES_SMTP_HOST: "smtp.gmail.com",
    SALES_SMTP_PORT: "465",
    SALES_SMTP_USER: "sales@example.invalid",
    SALES_SMTP_PASS: "sales-secret",
} as const

test("each account reads its own variables", () => {
    withEnv({ ...HR, ...SALES }, () => {
        const hr = readMailAccount(MAIL_ACCOUNT.HR)
        const sales = readMailAccount(MAIL_ACCOUNT.SALES)

        assert.equal(hr?.user, "hr@example.invalid")
        assert.equal(hr?.pass, "hr-secret")
        assert.equal(sales?.user, "sales@example.invalid")
        assert.equal(sales?.pass, "sales-secret")
    })
})

test("sales never falls back to the HR mailbox", () => {
    // The whole reason the split exists. HR is fully set up and sales is
    // not, which is exactly the state right after this change ships.
    withEnv({ ...HR, SMTP_HOST: "smtp.gmail.com", SMTP_USER: "hr@example.invalid" }, () => {
        assert.equal(readMailAccount(MAIL_ACCOUNT.SALES), null)
        assert.equal(mailAccountReady(MAIL_ACCOUNT.SALES), false)
        assert.throws(() => requireMailAccount(MAIL_ACCOUNT.SALES), /Sales mail account/)
    })
})

test("the error names every missing sales variable", () => {
    withEnv({ SALES_SMTP_HOST: "smtp.gmail.com" }, () => {
        assert.throws(() => requireMailAccount(MAIL_ACCOUNT.SALES), (error: Error) => {
            assert.match(error.message, /SALES_SMTP_PORT/)
            assert.match(error.message, /SALES_SMTP_USER/)
            assert.match(error.message, /SALES_SMTP_PASS/)
            // The one that is set must not be reported as missing.
            assert.doesNotMatch(error.message, /SALES_SMTP_HOST/)
            return true
        })
    })
})

test("HR still works from the old unprefixed names", () => {
    withEnv(
        {
            SMTP_HOST: "smtp.gmail.com",
            SMTP_PORT: "587",
            SMTP_USER: "hr@example.invalid",
            SMTP_PASS: "hr-secret",
        },
        () => {
            const hr = readMailAccount(MAIL_ACCOUNT.HR)
            assert.equal(hr?.host, "smtp.gmail.com")
            assert.equal(hr?.user, "hr@example.invalid")
            assert.equal(hr?.pass, "hr-secret")
        }
    )
})

test("a prefixed HR value wins over the old name", () => {
    withEnv({ ...HR, SMTP_USER: "old@example.invalid" }, () => {
        assert.equal(readMailAccount(MAIL_ACCOUNT.HR)?.user, "hr@example.invalid")
    })
})

test("the HR fallback is per variable, not all or nothing", () => {
    // Half-renaming a deployment must leave mail working. Three old names
    // and one new one is a valid state, not a broken one.
    withEnv(
        {
            SMTP_HOST: "smtp.gmail.com",
            SMTP_PORT: "587",
            SMTP_PASS: "hr-secret",
            HR_SMTP_USER: "hr@example.invalid",
        },
        () => {
            const hr = readMailAccount(MAIL_ACCOUNT.HR)
            assert.equal(hr?.host, "smtp.gmail.com")
            assert.equal(hr?.user, "hr@example.invalid")
            assert.equal(hr?.pass, "hr-secret")
        }
    )
})

test("the HR error still reports the prefixed names", () => {
    // Somebody setting this up now should be told to add HR_SMTP_HOST, not
    // the name we are moving away from.
    withEnv({}, () => {
        assert.throws(() => requireMailAccount(MAIL_ACCOUNT.HR), (error: Error) => {
            assert.match(error.message, /HR_SMTP_HOST/)
            assert.match(error.message, /SMTP_\* names are also accepted/)
            return true
        })
    })
})

test("port 465 is secure and 587 is not", () => {
    withEnv({ ...HR, ...SALES }, () => {
        assert.equal(readMailAccount(MAIL_ACCOUNT.HR)?.secure, false)
        assert.equal(readMailAccount(MAIL_ACCOUNT.SALES)?.secure, true)
    })
})

test("a port that is not a usable number counts as missing", () => {
    for (const port of ["", "   ", "abc", "0", "-1", "587.5", "70000"]) {
        withEnv({ ...SALES, SALES_SMTP_PORT: port }, () => {
            assert.equal(
                readMailAccount(MAIL_ACCOUNT.SALES),
                null,
                `port ${JSON.stringify(port)} should not be accepted`
            )
        })
    }
})

test("surrounding spaces are trimmed", () => {
    withEnv(
        {
            ...SALES,
            SALES_SMTP_USER: "  sales@example.invalid  ",
            SALES_SMTP_PORT: " 465 ",
        },
        () => {
            const sales = readMailAccount(MAIL_ACCOUNT.SALES)
            assert.equal(sales?.user, "sales@example.invalid")
            assert.equal(sales?.port, 465)
        }
    )
})

test("the connection view carries no password", () => {
    withEnv({ ...SALES }, () => {
        const sales = mailAccountConnection(MAIL_ACCOUNT.SALES)
        assert.equal(sales?.user, "sales@example.invalid")
        assert.equal("pass" in (sales as object), false)
    })
})

test("the connection view survives a missing password", () => {
    // The settings form pre-fills from this. A half-filled environment
    // should still fill in the host and the address.
    withEnv(
        {
            SALES_SMTP_HOST: "smtp.gmail.com",
            SALES_SMTP_PORT: "465",
            SALES_SMTP_USER: "sales@example.invalid",
        },
        () => {
            assert.equal(mailAccountConnection(MAIL_ACCOUNT.SALES)?.host, "smtp.gmail.com")
            // Sending, however, is still refused.
            assert.equal(readMailAccount(MAIL_ACCOUNT.SALES), null)
        }
    )
})

test("the connection view is null when the host is missing", () => {
    withEnv({ SALES_SMTP_PASS: "sales-secret" }, () => {
        assert.equal(mailAccountConnection(MAIL_ACCOUNT.SALES), null)
    })
})
