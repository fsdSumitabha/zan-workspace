import test from "node:test"
import assert from "node:assert/strict"

import { attemptsFor, classifySmtpError, shouldSuppressOnFailure } from "./classify"
import { ERROR_CLASS } from "@/constants/emailStatus"

/**
 * Classification decides whether we try again. Getting it wrong costs
 * sender reputation in one direction and lost recipients in the other, so
 * every branch has a case here.
 */

/** Builds an error shaped like the ones Nodemailer throws. */
function smtpError(parts: {
    message?: string
    code?: string
    responseCode?: number
    response?: string
}): Error {
    const error = new Error(parts.message ?? "send failed") as Error & typeof parts
    Object.assign(error, parts)
    return error
}

test("a 550 with 'no such user' is permanent", () => {
    const result = classifySmtpError(
        smtpError({
            responseCode: 550,
            response: "550 5.1.1 <nobody@example.com>: no such user",
        })
    )

    assert.equal(result.errorClass, ERROR_CLASS.PERMANENT)
    assert.equal(result.smtpCode, 550)
    assert.ok(shouldSuppressOnFailure(result.errorClass))
})

test("a 421 is transient", () => {
    const result = classifySmtpError(
        smtpError({ responseCode: 421, response: "421 Service not available" })
    )

    assert.equal(result.errorClass, ERROR_CLASS.TRANSIENT)
    assert.ok(!shouldSuppressOnFailure(result.errorClass))
})

test("a 535 is an auth failure, not a bad recipient", () => {
    const result = classifySmtpError(
        smtpError({
            code: "EAUTH",
            responseCode: 535,
            response: "535-5.7.8 Username and Password not accepted",
        })
    )

    assert.equal(result.errorClass, ERROR_CLASS.AUTH)
    // Never suppress on an auth failure. Nothing is wrong with the address.
    assert.ok(!shouldSuppressOnFailure(result.errorClass))
})

test("Gmail's 550 rate limit is throttling, not permanent", () => {
    // The case the wording check exists for. By code alone this is a 5xx
    // and would never be retried, but the message would have gone through
    // a minute later.
    const result = classifySmtpError(
        smtpError({
            responseCode: 550,
            response:
                "550 5.4.5 Daily user sending limit exceeded. Rate limit reached.",
        })
    )

    assert.equal(result.errorClass, ERROR_CLASS.THROTTLE)
    assert.ok(!shouldSuppressOnFailure(result.errorClass))
})

test("a 454 too many connections is throttling", () => {
    const result = classifySmtpError(
        smtpError({
            responseCode: 454,
            response: "454 4.7.0 Too many concurrent connections",
        })
    )

    assert.equal(result.errorClass, ERROR_CLASS.THROTTLE)
})

test("a socket timeout is transient, with no SMTP code", () => {
    const result = classifySmtpError(
        smtpError({ code: "ETIMEDOUT", message: "Connection timed out" })
    )

    assert.equal(result.errorClass, ERROR_CLASS.TRANSIENT)
    assert.equal(result.smtpCode, undefined)
})

test("connection refused is transient", () => {
    const result = classifySmtpError(smtpError({ code: "ECONNREFUSED" }))
    assert.equal(result.errorClass, ERROR_CLASS.TRANSIENT)
})

test("an unreadable error is unknown, not permanent", () => {
    // Safe default: we keep trying a few times rather than silently
    // dropping somebody because of an error we failed to parse.
    const result = classifySmtpError(smtpError({ message: "something odd" }))

    assert.equal(result.errorClass, ERROR_CLASS.UNKNOWN)
    assert.ok(!shouldSuppressOnFailure(result.errorClass))
})

test("a non-Error is unknown rather than a crash", () => {
    const result = classifySmtpError("a string")
    assert.equal(result.errorClass, ERROR_CLASS.UNKNOWN)
})

test("the server's own words are kept verbatim", () => {
    const response = "550 5.1.1 The email account that you tried to reach does not exist"
    const result = classifySmtpError(smtpError({ responseCode: 550, response }))

    assert.equal(result.response, response)
})

test("a permanent failure gets exactly one attempt", () => {
    const config = { maxAttemptsTransient: 5, maxAttemptsPermanent: 1 }

    assert.equal(attemptsFor(ERROR_CLASS.PERMANENT, config), 1)
    assert.equal(attemptsFor(ERROR_CLASS.AUTH, config), 1)
})

test("a transient failure gets the full allowance, unknown gets fewer", () => {
    const config = { maxAttemptsTransient: 5, maxAttemptsPermanent: 1 }

    assert.equal(attemptsFor(ERROR_CLASS.TRANSIENT, config), 5)
    assert.equal(attemptsFor(ERROR_CLASS.THROTTLE, config), 5)
    assert.equal(attemptsFor(ERROR_CLASS.UNKNOWN, config), 3)
})
