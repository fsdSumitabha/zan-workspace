import "./testing/tsxPhoneFix"
import test from "node:test"
import assert from "node:assert/strict"

import { AD_PLATFORM, LEAD_IMPORT_ROW_RESULT } from "@/constants/adTracking"
import { decodeCsv, parseCsv } from "@/lib/lead-sources/sheet/csv"
import { checkImportRows } from "./checkRows"
import {
    answerText,
    findImportHeaderRow,
    matchImportHeaders,
    questionLabel,
    readDateTime,
    readPlatformId,
} from "./sheet"

/**
 * The two Meta exports the team uses today: web development and digital
 * marketing. They share most columns and differ in the questions and in
 * work_phone_number / work_email. Neither should need a config change.
 */

const WEB_DEV = [
    "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name",
    "form_id", "form_name", "is_organic", "platform",
    "what_type_of_website_do_you_need?", "when_do_you_want_to_launch_your_website?",
    "full_name", "phone_number", "email", "company_name",
]

const DIGITAL_MARKETING = [
    "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name",
    "form_id", "form_name", "is_organic", "platform",
    "what_are_you_looking_to_achieve_through_performance_marketing?", "when_are_you_looking_to_start?",
    "full_name", "work_phone_number", "work_email", "company_name", "website",
]

const OPTIONS = { platform: AD_PLATFORM.META, source: "", fallbackCountry: "IN" as const, zone: "Asia/Kolkata" }

test("both Meta exports match, and their questions are read as questions", () => {
    for (const headers of [WEB_DEV, DIGITAL_MARKETING]) {
        const match = matchImportHeaders(headers)
        assert.deepEqual(match.missingRequired, [])
        assert.equal(match.questions.length, 2)
    }

    const web = matchImportHeaders(WEB_DEV)
    assert.deepEqual(
        web.questions.map((q) => q.label),
        ["What type of website do you need?", "When do you want to launch your website?"]
    )

    const dm = matchImportHeaders(DIGITAL_MARKETING)
    assert.equal(dm.columns.find((c) => c.header === "work_phone_number")?.key, "phone")
    assert.equal(dm.columns.find((c) => c.header === "work_email")?.key, "email")
    assert.equal(dm.columns.find((c) => c.header === "website")?.key, "website")
})

test("the header 'd', as first pasted, is read as the lead id", () => {
    const match = matchImportHeaders(["d", ...WEB_DEV.slice(1)])
    assert.equal(match.columns[0].key, "leadId")
})

test("a file with no phone column is refused with the closest match", () => {
    const found = findImportHeaderRow([["full_name", "email"], ["Asha", "a@b.co"]])
    assert.equal(found?.complete, false)
    assert.deepEqual(found?.match.missingRequired, ["phone_number"])
})

test("Meta id prefixes are removed, and ids Excel rounded are refused", () => {
    assert.deepEqual(readPlatformId("c:120212345678901234", "META"), { ok: true, id: "120212345678901234" })
    assert.deepEqual(readPlatformId("ag:120212345678901000", "META"), { ok: true, id: "120212345678901000" })
    assert.equal(readPlatformId("1.20212E+17", "META").ok, false)
    assert.equal(readPlatformId("120212345678901000", "META").ok, false)
    assert.equal(readPlatformId("abc", "META").ok, false)
})

test("created_time is exact when it has a zone, and read in the region's zone when not", () => {
    assert.equal(readDateTime("2026-11-20T10:23:45+05:30", "Asia/Kolkata")?.toISOString(), "2026-11-20T04:53:45.000Z")
    assert.equal(readDateTime("2026-11-20 10:23", "Asia/Kolkata")?.toISOString(), "2026-11-20T04:53:00.000Z")
    assert.equal(readDateTime("yesterday", "Asia/Kolkata"), null)
})

test("answers and questions read like sentences", () => {
    assert.equal(answerText("within_1_month"), "Within 1 month")
    assert.equal(answerText("I need a shop"), "I need a shop")
    assert.equal(answerText("https://acme.in/my_page"), "https://acme.in/my_page")
    assert.equal(questionLabel("when_are_you_looking_to_start?"), "When are you looking to start?")
})

test("rows: fail without a phone, duplicate within the file, organic without an ad", () => {
    const rows = [
        WEB_DEV,
        ["l:1", "2026-11-20T10:00:00+05:30", "ag:11", "Ad A", "as:21", "Set 1", "c:31", "Web", "f:41", "Form", "false", "fb", "e-commerce_website", "asap", "Asha Rao", "p:+919876543210", "asha@example.com", "Rao Traders"],
        ["l:2", "2026-11-20T11:00:00+05:30", "ag:12", "Ad B", "as:21", "Set 1", "c:31", "Web", "f:41", "Form", "false", "ig", "blog", "later", "Vikram", "p:+919812345678", "not-an-email", ""],
        ["l:3", "2026-11-20T12:00:00+05:30", "", "", "", "", "", "", "f:41", "Form", "true", "fb", "portfolio", "asap", "Neha", "p:+919900112233", "", ""],
        ["l:4", "", "ag:11", "Ad A", "as:21", "Set 1", "c:31", "Web", "f:41", "Form", "false", "fb", "", "", "No Phone", "", "", ""],
        ["l:5", "", "ag:11", "Ad A", "as:21", "Set 1", "c:31", "Web", "f:41", "Form", "false", "fb", "", "", "Asha Again", "+91 98765 43210", "", ""],
    ]
    const found = findImportHeaderRow(rows)
    assert.ok(found?.complete)
    const checked = checkImportRows(rows, found!.index, found!.match, OPTIONS)

    assert.deepEqual(
        checked.map((r) => r.result),
        [
            LEAD_IMPORT_ROW_RESULT.IMPORTED,
            LEAD_IMPORT_ROW_RESULT.WARNED,
            LEAD_IMPORT_ROW_RESULT.IMPORTED,
            LEAD_IMPORT_ROW_RESULT.FAILED,
            LEAD_IMPORT_ROW_RESULT.DUPLICATE,
        ]
    )

    const [asha, vikram, neha, , again] = checked
    assert.equal(asha.phone, "+919876543210")
    assert.equal(asha.source, "facebook")
    assert.equal(asha.externalLeadId, "1")
    assert.deepEqual(asha.refs.ad, { id: "11", name: "Ad A" })
    assert.deepEqual(asha.answers.map((a) => a.answer), ["E-commerce website", "asap"])
    assert.deepEqual(asha.details, [{ label: "Company", value: "Rao Traders" }])

    assert.equal(vikram.source, "instagram")
    assert.equal(vikram.email, "")

    assert.equal(neha.organic, true)
    assert.equal(neha.refs.ad, undefined)

    assert.match(again.messages[0], /row 2/)
})

test("Meta's UTF-16 tab-separated export decodes and splits", () => {
    const text = "id\tfull_name\tphone_number\r\nl:1\tAsha\tp:+919876543210\r\n"
    const bytes = new Uint8Array(2 + text.length * 2)
    bytes[0] = 0xff
    bytes[1] = 0xfe
    for (let i = 0; i < text.length; i++) {
        bytes[2 + i * 2] = text.charCodeAt(i) & 0xff
        bytes[3 + i * 2] = text.charCodeAt(i) >> 8
    }
    const rows = parseCsv(decodeCsv(bytes))
    assert.deepEqual(rows, [["id", "full_name", "phone_number"], ["l:1", "Asha", "p:+919876543210"]])
})
