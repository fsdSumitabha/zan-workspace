import test from "node:test"
import assert from "node:assert/strict"

import { backoffMs, nextAttemptAt } from "./backoff"

const CONFIG = { backoffBaseMs: 2_000, backoffMaxMs: 900_000 }

test("the ceiling doubles with each attempt", () => {
    // random() returning 1 gives the top of the window, which is the
    // ceiling we are asserting on.
    const top = (attempt: number) => backoffMs(attempt, CONFIG, () => 0.999999)

    assert.ok(top(1) < 2_000 && top(1) > 1_900)
    assert.ok(top(2) < 4_000 && top(2) > 3_900)
    assert.ok(top(3) < 8_000 && top(3) > 7_900)
    assert.ok(top(4) < 16_000 && top(4) > 15_900)
})

test("the ceiling is capped", () => {
    const top = backoffMs(20, CONFIG, () => 0.999999)
    assert.ok(top <= CONFIG.backoffMaxMs)
})

test("full jitter can return a very small wait", () => {
    // This is the property that breaks up a convoy: with half jitter the
    // minimum would be half the ceiling, and fifty jobs would still retry
    // in a narrow band.
    assert.equal(backoffMs(5, CONFIG, () => 0), 0)
})

test("jitter spreads attempts across the whole window", () => {
    const samples = Array.from({ length: 400 }, () => backoffMs(6, CONFIG))
    const ceiling = CONFIG.backoffBaseMs * 2 ** 5

    const lowest = Math.min(...samples)
    const highest = Math.max(...samples)

    assert.ok(highest <= ceiling, "never over the ceiling")
    // Over 400 samples the spread should cover most of the window. If this
    // ever fails, the jitter has become a floor and the convoy is back.
    assert.ok(lowest < ceiling * 0.1, `lowest ${lowest} should be near zero`)
    assert.ok(highest > ceiling * 0.8, `highest ${highest} should near the top`)
})

test("a silly attempt number does not overflow", () => {
    const result = backoffMs(1_000, CONFIG, () => 0.5)

    assert.ok(Number.isFinite(result))
    assert.ok(result <= CONFIG.backoffMaxMs)
})

test("an attempt below 1 is treated as the first", () => {
    const top = (attempt: number) => backoffMs(attempt, CONFIG, () => 0.999999)

    assert.equal(top(0), top(1))
    assert.equal(top(-5), top(1))
})

test("nextAttemptAt is in the future and bounded", () => {
    const now = new Date("2026-11-19T10:00:00Z")
    const at = nextAttemptAt(3, CONFIG, now, () => 0.5)

    assert.ok(at.getTime() >= now.getTime())
    assert.ok(at.getTime() <= now.getTime() + CONFIG.backoffMaxMs)
})
