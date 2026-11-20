import test from "node:test"
import assert from "node:assert/strict"
import { unzipSync, strFromU8 } from "fflate"

import {
    attachmentHeader,
    buildCampaignWorkbook,
    buildComparisonWorkbook,
    XLSX_MIME,
    type AttemptExportRow,
    type RecipientExportRow,
    type WorkbookInput,
} from "./workbook"
import type { CampaignReport } from "./aggregate"
import { RECIPIENT_STATUS } from "@/constants/emailStatus"

/**
 * The workbook is checked by reading the file back.
 *
 * An .xlsx is a zip of XML parts. Asserting on the buffer's length would
 * pass for a file Excel refuses to open, so these tests unzip it and look
 * at the sheets and the cell types.
 *
 * `write-excel-file` keeps text in a shared string table: a text cell is
 * `t="s"` holding an index into xl/sharedStrings.xml, and a number cell
 * carries no `t` at all. That matters because a text cell can never be a
 * formula, whatever the text starts with. The helpers below resolve those
 * indices, so a test can assert on what a reader would see.
 *
 * fflate is used to unzip. It is the zip library write-excel-file itself
 * depends on, so it is always installed with it.
 */

const REPORT: CampaignReport = {
    campaignId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    name: "November newsletter",
    subject: "What we shipped",
    status: 70,
    totals: {
        recipients: 100,
        accepted: 94,
        delivered: 0,
        failed: 4,
        bounced: 2,
        suppressed: 2,
        cancelled: 0,
        unknown: 0,
        stillToSend: 0,
    },
    engagement: {
        uniqueOpens: 41,
        totalOpens: 73,
        uniqueClicks: 12,
        totalClicks: 19,
        unsubscribes: 1,
        complaints: 0,
    },
    rates: {
        acceptedOfRecipients: 94,
        failedOfRecipients: 4,
        bouncedOfAccepted: 2.1,
        deliveredOfAccepted: null,
        openedOfAccepted: 43.6,
        clickedOfAccepted: 12.8,
        clickedOfOpened: 29.3,
        unsubscribedOfAccepted: 1.1,
    },
    deliveryConfirmed: false,
    timing: {
        startedAt: "2026-11-19T09:00:00.000Z",
        finishedAt: "2026-11-19T09:00:26.900Z",
        durationMs: 26_900,
        throughput: 3.49,
    },
    latency: { samples: 94, p50: 210, p95: 640, p99: 1_240 },
    failures: [
        {
            errorClass: 10,
            label: "Address rejected",
            count: 4,
            example: "550 5.1.1 No such user",
        },
    ],
    links: [
        { url: "https://example.invalid/pricing", clicks: 14, uniqueClicks: 9 },
    ],
}

/** A contact name that Excel would run if it were not written as text. */
const FORMULA_NAME = "=cmd|' /c calc'!A1"

const RECIPIENTS: RecipientExportRow[] = [
    {
        email: "one@example.invalid",
        name: "One",
        status: RECIPIENT_STATUS.SUBMITTED,
        sourceType: 10,
        attempts: 1,
        submittedAt: "2026-11-19T09:00:01.000Z",
        finishedAt: "2026-11-19T09:00:01.000Z",
        openCount: 2,
        clickCount: 1,
        lastError: "",
        lastSmtpCode: 250,
    },
    {
        email: "two@example.invalid",
        name: FORMULA_NAME,
        status: RECIPIENT_STATUS.FAILED,
        sourceType: 40,
        attempts: 3,
        submittedAt: null,
        finishedAt: "2026-11-19T09:00:10.000Z",
        openCount: 0,
        clickCount: 0,
        lastError: "550 5.1.1 No such user",
        lastSmtpCode: 550,
    },
    {
        email: "three@example.invalid",
        name: "Three",
        status: RECIPIENT_STATUS.BOUNCED,
        sourceType: 20,
        attempts: 1,
        submittedAt: "2026-11-19T09:00:03.000Z",
        finishedAt: "2026-11-19T09:05:00.000Z",
        openCount: 0,
        clickCount: 0,
        lastError: "Hard bounce reported by the provider",
        lastSmtpCode: null,
    },
]

const ATTEMPTS: AttemptExportRow[] = [
    {
        email: "two@example.invalid",
        attemptNo: 1,
        startedAt: "2026-11-19T09:00:05.000Z",
        durationMs: 180,
        outcome: 20,
        smtpCode: 550,
        smtpResponse: "550 5.1.1 No such user",
        errorClass: 10,
        errorMessage: "",
        workerId: "worker-a",
    },
]

function base(overrides: Partial<WorkbookInput> = {}): WorkbookInput {
    return {
        report: REPORT,
        recipients: RECIPIENTS,
        attempts: ATTEMPTS,
        exportedBy: "Tester",
        exportedAt: new Date("2026-11-19T10:00:00.000Z"),
        ...overrides,
    }
}

/* ------------------------------------------------------------------ */
/* Reading an .xlsx back                                               */
/* ------------------------------------------------------------------ */

interface Book {
    /** The raw XML parts, by name. */
    parts: Record<string, string>
    /** The shared string table, in index order, unescaped. */
    strings: string[]
    /** Sheet names, in the order they appear in the workbook. */
    sheetNames: string[]
}

function open(buffer: Buffer): Book {
    const files = unzipSync(new Uint8Array(buffer))
    const parts: Record<string, string> = {}

    for (const [name, bytes] of Object.entries(files)) {
        if (name.endsWith(".xml") || name.endsWith(".rels")) {
            parts[name] = strFromU8(bytes)
        }
    }

    const shared = parts["xl/sharedStrings.xml"] ?? ""
    const strings = Array.from(
        shared.matchAll(/<si>\s*<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)
    ).map((m) => unescapeXml(m[1]))

    const sheetNames = Array.from(
        (parts["xl/workbook.xml"] ?? "").matchAll(/<sheet [^>]*name="([^"]*)"/g)
    ).map((m) => unescapeXml(m[1]))

    return { parts, strings, sheetNames }
}

function unescapeXml(value: string): string {
    return value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&amp;/g, "&")
}

interface ReadCell {
    /** "A1". */
    ref: string
    /** "s" for shared text, "" for a number. */
    type: string
    /** The resolved text of the cell. */
    value: string
}

/** Every non-empty cell of a sheet, by its 1-based position. */
function cells(book: Book, sheetNo: number): ReadCell[] {
    const xml = book.parts[`xl/worksheets/sheet${sheetNo}.xml`]
    assert.ok(xml, `sheet ${sheetNo} exists`)

    return Array.from(xml.matchAll(/<c ([^>]*?)>([\s\S]*?)<\/c>/g)).map(
        (match) => {
            const attrs = match[1]
            const inner = match[2]
            const ref = /r="([^"]*)"/.exec(attrs)?.[1] ?? ""
            const type = /t="([^"]*)"/.exec(attrs)?.[1] ?? ""
            const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ""

            return {
                ref,
                type,
                value:
                    type === "s"
                        ? (book.strings[Number(raw)] ?? "")
                        : unescapeXml(raw),
            }
        }
    )
}

/** Everything readable on a sheet, joined, as a person would see it. */
function sheetText(book: Book, sheetNo: number): string {
    return cells(book, sheetNo)
        .map((c) => c.value)
        .join("\n")
}

/** The cell holding `needle`, anywhere in the book. */
function findCell(
    book: Book,
    needle: string
): (ReadCell & { sheet: number }) | null {
    for (let sheetNo = 1; sheetNo <= book.sheetNames.length; sheetNo++) {
        for (const cell of cells(book, sheetNo)) {
            if (cell.value.includes(needle)) return { ...cell, sheet: sheetNo }
        }
    }

    return null
}

/* ------------------------------------------------------------------ */
/* The file itself                                                     */
/* ------------------------------------------------------------------ */

test("the campaign workbook opens and has the six named sheets, in order", async () => {
    const book = open(await buildCampaignWorkbook(base()))

    assert.deepEqual(book.sheetNames, [
        "Summary",
        "Recipients",
        "Failures",
        "Bounces",
        "Engagement",
        "Delivery attempts",
    ])
})

test("no cell anywhere is a formula", async () => {
    const book = open(await buildCampaignWorkbook(base()))

    for (let sheetNo = 1; sheetNo <= 6; sheetNo++) {
        const xml = book.parts[`xl/worksheets/sheet${sheetNo}.xml`]
        assert.ok(!xml.includes("<f>"), `sheet ${sheetNo} has no formula cell`)
    }
})

test("values that came from outside are written as text", async () => {
    const book = open(await buildCampaignWorkbook(base()))

    /**
     * Only the outside values have to be text.
     *
     * The counts and rates we computed ourselves are written as numbers
     * on purpose, so they sort and total in Excel. These four came from a
     * contact import, a mail server and a template, and any of them can
     * start with "=".
     */
    for (const needle of [
        FORMULA_NAME,
        "one@example.invalid",
        "550 5.1.1 No such user",
        "https://example.invalid/pricing",
    ]) {
        const cell = findCell(book, needle)
        assert.ok(cell, `${needle} is in the file`)
        assert.equal(
            cell.type,
            "s",
            `${needle} is a shared text cell, which Excel never evaluates`
        )
    }
})

test("the formula-looking name comes back as the same text", async () => {
    const book = open(await buildCampaignWorkbook(base()))
    const cell = findCell(book, "=cmd|")

    assert.ok(cell)
    // Not merely present: unchanged. A sanitiser that stripped the "="
    // would also pass a "no formula" check, and would be wrong.
    assert.equal(cell.value, FORMULA_NAME)
})

test("our own counts stay numbers, so Excel can total them", async () => {
    const book = open(await buildCampaignWorkbook(base()))

    const summary = cells(book, 1)
    const row = (label: string) => {
        const index = summary.findIndex((c) => c.value === label)
        assert.ok(index >= 0, `the summary has a "${label}" row`)
        return summary[index + 1]
    }

    const total = row("Total")
    assert.equal(total.type, "", "the recipient total is a number cell")
    assert.equal(total.value, "100")

    const accepted = row("Accepted by the server")
    assert.equal(accepted.type, "")
    assert.equal(accepted.value, "94")
})

/* ------------------------------------------------------------------ */
/* What the sheets say                                                 */
/* ------------------------------------------------------------------ */

test("Failures and Bounces are split by status code", async () => {
    const book = open(await buildCampaignWorkbook(base()))

    const failures = sheetText(book, 3)
    const bounces = sheetText(book, 4)

    assert.ok(failures.includes("two@example.invalid"))
    assert.ok(!failures.includes("three@example.invalid"))

    assert.ok(bounces.includes("three@example.invalid"))
    assert.ok(!bounces.includes("two@example.invalid"))
})

test("an unconfirmed provider gets the note, not a zero", async () => {
    const book = open(await buildCampaignWorkbook(base()))
    const summary = sheetText(book, 1)

    assert.ok(
        summary.includes("does not confirm deliveries"),
        "the summary says why the delivered figure is absent"
    )
    assert.ok(
        summary.includes("not reported"),
        "the delivered rate reads as not reported"
    )
    assert.ok(
        !summary.includes("0% of accepted"),
        "and never shows delivery as nought per cent"
    )
})

test("a confirming provider gets a real delivered rate and no note", async () => {
    const confirmed: CampaignReport = {
        ...REPORT,
        deliveryConfirmed: true,
        totals: { ...REPORT.totals, delivered: 90 },
        rates: { ...REPORT.rates, deliveredOfAccepted: 95.7 },
    }

    const book = open(await buildCampaignWorkbook(base({ report: confirmed })))
    const summary = sheetText(book, 1)

    assert.ok(!summary.includes("does not confirm deliveries"))
    assert.ok(summary.includes("95.7% of accepted"))
})

test("every rate names the base it was computed over", async () => {
    const book = open(await buildCampaignWorkbook(base()))
    const summary = sheetText(book, 1)

    // The whole point of the rates block: no bare percentage.
    assert.ok(summary.includes("94% of recipients"))
    assert.ok(summary.includes("43.6% of accepted"))
    assert.ok(summary.includes("29.3% of opens"))

    const bare = cells(book, 1).filter(
        (c) => /^\d+(\.\d+)?%$/.test(c.value.trim())
    )
    assert.deepEqual(bare, [], "no cell is a percentage with no stated base")
})

test("the open-rate caveat is in the file, not only on the screen", async () => {
    const book = open(await buildCampaignWorkbook(base()))
    const summary = sheetText(book, 1)

    // A spreadsheet gets forwarded and read months later with no context.
    assert.ok(summary.includes("Open figures are approximate"))
    assert.ok(summary.includes("Click figures are reliable"))
})

test("a cut-short export says so", async () => {
    const book = open(
        await buildCampaignWorkbook(
            base({ truncated: { recipients: 50_000, attempts: null } })
        )
    )

    const summary = sheetText(book, 1)
    assert.ok(summary.includes("cut at 50000 rows"))
    assert.ok(!summary.includes("Delivery attempts sheet was cut"))
})

test("a campaign that sent nothing still produces six sheets", async () => {
    const nothing: CampaignReport = {
        ...REPORT,
        totals: {
            recipients: 0,
            accepted: 0,
            delivered: 0,
            failed: 0,
            bounced: 0,
            suppressed: 0,
            cancelled: 0,
            unknown: 0,
            stillToSend: 0,
        },
        links: [],
        failures: [],
        latency: { samples: 0, p50: 0, p95: 0, p99: 0 },
        timing: {
            startedAt: null,
            finishedAt: null,
            durationMs: null,
            throughput: null,
        },
    }

    const book = open(
        await buildCampaignWorkbook(
            base({ report: nothing, recipients: [], attempts: [] })
        )
    )

    assert.equal(book.sheetNames.length, 6)
    // The headers are still there, so nobody wonders whether the tab is
    // missing or merely empty.
    assert.ok(sheetText(book, 4).includes("What the provider said"))
})

/* ------------------------------------------------------------------ */
/* The comparison file                                                 */
/* ------------------------------------------------------------------ */

test("the comparison workbook explains its own numbers", async () => {
    const book = open(
        await buildComparisonWorkbook({
            rows: [
                {
                    name: "November newsletter",
                    status: 70,
                    sentAt: "2026-11-19T09:00:00.000Z",
                    recipients: 100,
                    accepted: 94,
                    failed: 4,
                    bounced: 2,
                    uniqueOpens: 41,
                    uniqueClicks: 12,
                    unsubscribes: 1,
                    openRate: 43.6,
                    clickRate: 12.8,
                    bounceRate: 2.1,
                },
                {
                    // Cancelled before it started: no date, no rates.
                    name: "October newsletter",
                    status: 90,
                    sentAt: null,
                    recipients: 60,
                    accepted: 0,
                    failed: 0,
                    bounced: 0,
                    uniqueOpens: 0,
                    uniqueClicks: 0,
                    unsubscribes: 0,
                    openRate: null,
                    clickRate: null,
                    bounceRate: null,
                },
            ],
            exportedBy: "Tester",
            exportedAt: new Date("2026-11-19T10:00:00.000Z"),
        })
    )

    assert.deepEqual(book.sheetNames, ["Campaigns", "About these numbers"])

    const rows = sheetText(book, 1)
    assert.ok(rows.includes("November newsletter"))
    assert.ok(rows.includes("Cancelled"), "the status code is shown as a word")

    const notes = sheetText(book, 2)
    assert.ok(notes.includes("share of the emails the mail server accepted"))
    assert.ok(notes.includes("Opens are approximate"))
})

test("a campaign with no rates shows blank, never nought per cent", async () => {
    const book = open(
        await buildComparisonWorkbook({
            rows: [
                {
                    name: "October newsletter",
                    status: 90,
                    sentAt: null,
                    recipients: 60,
                    accepted: 0,
                    failed: 0,
                    bounced: 0,
                    uniqueOpens: 0,
                    uniqueClicks: 0,
                    unsubscribes: 0,
                    openRate: null,
                    clickRate: null,
                    bounceRate: null,
                },
            ],
            exportedBy: "Tester",
            exportedAt: new Date("2026-11-19T10:00:00.000Z"),
        })
    )

    // A rate of null is an unmeasured rate. Writing 0% would say the
    // campaign performed badly, when in fact it never sent.
    assert.ok(!sheetText(book, 1).includes("0%"))
})

/* ------------------------------------------------------------------ */
/* The download                                                        */
/* ------------------------------------------------------------------ */

test("the download header keeps a non-ASCII name and stays valid", () => {
    const header = attachmentHeader("November – report.xlsx")

    assert.ok(header.startsWith("attachment; "))

    // The plain filename is ASCII only, so the header cannot break.
    const plain = /filename="([^"]+)"/.exec(header)?.[1] ?? ""
    assert.ok(plain.length > 0)
    assert.ok(!/[^\x20-\x7E]/.test(plain), "the plain name is ASCII")

    // The real name is preserved, dash and all.
    assert.ok(header.includes(encodeURIComponent("November – report.xlsx")))
})

test("a quote in the file name cannot break out of the header", () => {
    const header = attachmentHeader('a"; evil="1.xlsx')
    const plain = /filename="([^"]*)"/.exec(header)?.[1] ?? ""

    assert.ok(!plain.includes('"'))
    assert.ok(!plain.includes("\\"))
})

test("the mime type is the spreadsheet one", () => {
    assert.ok(XLSX_MIME.endsWith("spreadsheetml.sheet"))
})
