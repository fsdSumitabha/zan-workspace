import writeXlsxFile, {
    type Cell,
    type Row,
    type SheetData,
} from "write-excel-file/node"

import {
    ATTEMPT_OUTCOME_META,
    CAMPAIGN_STATUS_META,
    ERROR_CLASS_META,
    RECIPIENT_SOURCE_META,
    RECIPIENT_STATUS,
    RECIPIENT_STATUS_META,
    type AttemptOutcome,
    type CampaignStatus,
    type ErrorClass,
    type RecipientSource,
    type RecipientStatus,
} from "@/constants/emailStatus"
import type { CampaignReport } from "./aggregate"

/**
 * The campaign report as a .xlsx.
 *
 * Follows src/lib/lead-sources/sheet/workbook.ts: every value is written
 * as a text cell, so a cell starting with "=" or "+" is shown as text and
 * never run as a formula. That matters here because the content includes
 * email addresses and SMTP responses that came from outside.
 *
 * Six sheets, because somebody exporting a report is usually answering one
 * of six questions and should not have to filter a single flat dump.
 */

const HEADER_STYLE = {
    fontWeight: "bold",
    backgroundColor: "#E5E7EB",
    borderColor: "#9CA3AF",
    borderStyle: "thin",
} as const

function text(
    value: string,
    style: Partial<Exclude<Cell, null | undefined | string>> = {}
): Cell {
    return { value, type: String, ...style } as Cell
}

function number(
    value: number,
    style: Partial<Exclude<Cell, null | undefined | string>> = {}
): Cell {
    return { value, type: Number, ...style } as Cell
}

function header(...labels: string[]): Row {
    return labels.map((l) => text(l, HEADER_STYLE))
}

/** A date as the viewer's clock would show it, or blank. */
function when(value: string | null | undefined): string {
    if (!value) return ""
    return value.slice(0, 19).replace("T", " ")
}

/** A rate, with its base spelled out so it cannot be misread. */
function rate(value: number | null, base: string): string {
    return value === null ? "not reported" : `${value}% of ${base}`
}

export interface RecipientExportRow {
    email: string
    name: string
    status: number
    sourceType: number
    attempts: number
    submittedAt: string | null
    finishedAt: string | null
    openCount: number
    clickCount: number
    lastError: string
    lastSmtpCode: number | null
}

export interface AttemptExportRow {
    email: string
    attemptNo: number
    startedAt: string
    durationMs: number | null
    outcome: number
    smtpCode: number | null
    smtpResponse: string
    errorClass: number | null
    errorMessage: string
    workerId: string
}

export interface WorkbookInput {
    report: CampaignReport
    recipients: RecipientExportRow[]
    attempts: AttemptExportRow[]
    exportedBy: string
    exportedAt: Date
    /**
     * The cap that was hit, per list, or null when the list is complete.
     *
     * A file that was cut short says so on its summary sheet. Handing
     * somebody 50,000 of 60,000 rows without a word is how a partial
     * export ends up quoted as a total.
     */
    truncated?: { recipients: number | null; attempts: number | null }
}

export async function buildCampaignWorkbook(
    input: WorkbookInput
): Promise<Buffer> {
    const { report } = input

    /* ---- 1. Summary ---- */

    const summary: SheetData = [
        [text("Campaign report", { fontWeight: "bold" }), null],
        [text("Campaign"), text(report.name)],
        [text("Subject"), text(report.subject)],
        [
            text("Status"),
            text(
                CAMPAIGN_STATUS_META[report.status as CampaignStatus]?.label ??
                String(report.status)
            ),
        ],
        [text("Started"), text(when(report.timing.startedAt))],
        [text("Finished"), text(when(report.timing.finishedAt))],
        [
            text("Took"),
            text(
                report.timing.durationMs
                    ? `${(report.timing.durationMs / 1000).toFixed(1)} seconds`
                    : ""
            ),
        ],
        [
            text("Throughput"),
            text(
                report.timing.throughput
                    ? `${report.timing.throughput} per second`
                    : ""
            ),
        ],
        [null, null],

        [text("Recipients", { fontWeight: "bold" }), null],
        [text("Total"), number(report.totals.recipients)],
        [text("Accepted by the server"), number(report.totals.accepted)],
        [text("Confirmed delivered"), number(report.totals.delivered)],
        [text("Failed"), number(report.totals.failed)],
        [text("Bounced"), number(report.totals.bounced)],
        [text("Suppressed"), number(report.totals.suppressed)],
        [text("Cancelled"), number(report.totals.cancelled)],
        [text("Outcome unknown"), number(report.totals.unknown)],
        [text("Still to send"), number(report.totals.stillToSend)],
        [null, null],

        [text("Engagement", { fontWeight: "bold" }), null],
        [text("Unique opens"), number(report.engagement.uniqueOpens)],
        [text("Total opens"), number(report.engagement.totalOpens)],
        [text("Unique clicks"), number(report.engagement.uniqueClicks)],
        [text("Total clicks"), number(report.engagement.totalClicks)],
        [text("Unsubscribes"), number(report.engagement.unsubscribes)],
        [text("Marked as spam"), number(report.engagement.complaints)],
        [null, null],

        [text("Rates", { fontWeight: "bold" }), null],
        [
            text("Accepted"),
            text(rate(report.rates.acceptedOfRecipients, "recipients")),
        ],
        [
            text("Failed"),
            text(rate(report.rates.failedOfRecipients, "recipients")),
        ],
        [
            text("Bounced"),
            text(rate(report.rates.bouncedOfAccepted, "accepted")),
        ],
        [
            text("Delivered"),
            text(rate(report.rates.deliveredOfAccepted, "accepted")),
        ],
        [text("Opened"), text(rate(report.rates.openedOfAccepted, "accepted"))],
        [
            text("Clicked"),
            text(rate(report.rates.clickedOfAccepted, "accepted")),
        ],
        [
            text("Clicked after opening"),
            text(rate(report.rates.clickedOfOpened, "opens")),
        ],
        [
            text("Unsubscribed"),
            text(rate(report.rates.unsubscribedOfAccepted, "accepted")),
        ],
        [null, null],

        [text("SMTP latency", { fontWeight: "bold" }), null],
        [text("Samples"), number(report.latency.samples)],
        [text("p50"), text(`${report.latency.p50} ms`)],
        [text("p95"), text(`${report.latency.p95} ms`)],
        [text("p99"), text(`${report.latency.p99} ms`)],
        [null, null],

        [text("Exported by"), text(input.exportedBy)],
        [text("Exported at"), text(when(input.exportedAt.toISOString()))],
    ]

    /**
     * The honesty note, in the file itself.
     *
     * A spreadsheet gets emailed on and read six months later with no
     * context. Without this, "Confirmed delivered: 0" reads as a disaster
     * rather than as the provider not reporting.
     */
    if (!report.deliveryConfirmed) {
        summary.push([null, null])
        summary.push([
            text("Note", { fontWeight: "bold" }),
            text(
                "This provider does not confirm deliveries, so Confirmed " +
                "delivered is not measured. Accepted by the server means the " +
                "mail server took the message, which is not the same as it " +
                "arriving."
            ),
        ])
    }

    if (input.truncated?.recipients) {
        summary.push([null, null])
        summary.push([
            text("Note", { fontWeight: "bold" }),
            text(
                `The Recipients sheet was cut at ${input.truncated.recipients} ` +
                "rows, so its row count is not the total. The figures above " +
                "cover every recipient."
            ),
        ])
    }

    if (input.truncated?.attempts) {
        summary.push([null, null])
        summary.push([
            text("Note", { fontWeight: "bold" }),
            text(
                `The Delivery attempts sheet was cut at ${input.truncated.attempts} ` +
                "rows, oldest first."
            ),
        ])
    }

    summary.push([null, null])
    summary.push([
        text("Note", { fontWeight: "bold" }),
        text(
            "Open figures are approximate. Privacy proxies fetch the tracking " +
            "image without anybody reading, and image blocking hides real " +
            "opens. Click figures are reliable."
        ),
    ])

    /* ---- 2. Recipients ---- */

    const recipientHeader = header(
        "Email",
        "Name",
        "Status",
        "From",
        "Tries",
        "Accepted at",
        "Finished at",
        "Opens",
        "Clicks",
        "SMTP code",
        "Last error"
    )

    const recipientRows: SheetData = input.recipients.map((r) => [
        text(r.email),
        text(r.name),
        text(
            RECIPIENT_STATUS_META[r.status as RecipientStatus]?.label ??
            String(r.status)
        ),
        text(
            RECIPIENT_SOURCE_META[r.sourceType as RecipientSource]?.label ?? ""
        ),
        number(r.attempts),
        text(when(r.submittedAt)),
        text(when(r.finishedAt)),
        number(r.openCount),
        number(r.clickCount),
        text(r.lastSmtpCode ? String(r.lastSmtpCode) : ""),
        text(r.lastError),
    ])

    /* ---- 3. Failures ---- */

    const failureRows: SheetData = input.recipients
        .filter((r) => r.status === RECIPIENT_STATUS.FAILED)
        .map((r) => [
            text(r.email),
            text(r.name),
            number(r.attempts),
            text(r.lastSmtpCode ? String(r.lastSmtpCode) : ""),
            text(r.lastError),
            text(when(r.finishedAt)),
        ])

    /* ---- 4. Bounces ---- */

    const bounceRows: SheetData = input.recipients
        .filter((r) => r.status === RECIPIENT_STATUS.BOUNCED)
        .map((r) => [
            text(r.email),
            text(r.name),
            text(r.lastError),
            text(when(r.finishedAt)),
        ])

    /* ---- 5. Engagement ---- */

    const engagementRows: SheetData = input.recipients
        .filter((r) => r.openCount > 0 || r.clickCount > 0)
        .sort((a, b) => b.clickCount - a.clickCount || b.openCount - a.openCount)
        .map((r) => [
            text(r.email),
            text(r.name),
            number(r.openCount),
            number(r.clickCount),
        ])

    const linkRows: SheetData = report.links.map((l) => [
        text(l.url),
        number(l.clicks),
        number(l.uniqueClicks),
    ])

    /* ---- 6. Delivery attempts ---- */

    const attemptRows: SheetData = input.attempts.map((a) => [
        text(a.email),
        number(a.attemptNo),
        text(when(a.startedAt)),
        text(a.durationMs !== null ? `${a.durationMs} ms` : ""),
        text(
            ATTEMPT_OUTCOME_META[a.outcome as AttemptOutcome]?.label ??
            String(a.outcome)
        ),
        text(a.smtpCode ? String(a.smtpCode) : ""),
        text(a.smtpResponse || a.errorMessage),
        text(
            a.errorClass !== null
                ? ERROR_CLASS_META[a.errorClass as ErrorClass]?.label ?? ""
                : ""
        ),
        text(a.workerId),
    ])

    return writeXlsxFile(
        [
            {
                sheet: "Summary",
                data: summary,
                columns: [{ width: 26 }, { width: 70 }],
            },
            {
                sheet: "Recipients",
                data: [recipientHeader, ...recipientRows],
                columns: [
                    { width: 34 },
                    { width: 22 },
                    { width: 14 },
                    { width: 12 },
                    { width: 7 },
                    { width: 20 },
                    { width: 20 },
                    { width: 8 },
                    { width: 8 },
                    { width: 11 },
                    { width: 60 },
                ],
                stickyRowsCount: 1,
            },
            {
                sheet: "Failures",
                data: [
                    header(
                        "Email",
                        "Name",
                        "Tries",
                        "SMTP code",
                        "Why it failed",
                        "When"
                    ),
                    ...failureRows,
                ],
                columns: [
                    { width: 34 },
                    { width: 22 },
                    { width: 7 },
                    { width: 11 },
                    { width: 60 },
                    { width: 20 },
                ],
                stickyRowsCount: 1,
            },
            {
                sheet: "Bounces",
                data: [
                    header("Email", "Name", "What the provider said", "When"),
                    ...bounceRows,
                ],
                columns: [
                    { width: 34 },
                    { width: 22 },
                    { width: 60 },
                    { width: 20 },
                ],
                stickyRowsCount: 1,
            },
            {
                sheet: "Engagement",
                data: [
                    header("Email", "Name", "Opens", "Clicks"),
                    ...engagementRows,
                    [null, null, null, null],
                    header("Link", "Clicks", "People"),
                    ...linkRows,
                ],
                columns: [
                    { width: 46 },
                    { width: 22 },
                    { width: 10 },
                    { width: 10 },
                ],
                stickyRowsCount: 1,
            },
            {
                sheet: "Delivery attempts",
                data: [
                    header(
                        "Email",
                        "Try",
                        "Started",
                        "Took",
                        "Outcome",
                        "SMTP code",
                        "What the server said",
                        "Class",
                        "Worker"
                    ),
                    ...attemptRows,
                ],
                columns: [
                    { width: 34 },
                    { width: 6 },
                    { width: 20 },
                    { width: 10 },
                    { width: 12 },
                    { width: 11 },
                    { width: 60 },
                    { width: 16 },
                    { width: 24 },
                ],
                stickyRowsCount: 1,
            },
        ]
        // A sheet with no rows other than its header is still written, so
        // the file always has the same six tabs and nobody wonders whether
        // "Bounces" is missing or empty.
    ).toBuffer()
}

/**
 * The comparison table as a .xlsx.
 *
 * Same rate definitions as the single-campaign report, so a number does
 * not change meaning when it moves between files.
 */
export async function buildComparisonWorkbook(input: {
    rows: Array<{
        name: string
        status: number
        sentAt: string | null
        recipients: number
        accepted: number
        failed: number
        bounced: number
        uniqueOpens: number
        uniqueClicks: number
        unsubscribes: number
        openRate: number | null
        clickRate: number | null
        bounceRate: number | null
    }>
    exportedBy: string
    exportedAt: Date
}): Promise<Buffer> {
    const rows: SheetData = input.rows.map((r) => [
        text(r.name),
        text(
            CAMPAIGN_STATUS_META[r.status as CampaignStatus]?.label ??
            String(r.status)
        ),
        text(when(r.sentAt)),
        number(r.recipients),
        number(r.accepted),
        number(r.failed),
        number(r.bounced),
        number(r.uniqueOpens),
        number(r.uniqueClicks),
        number(r.unsubscribes),
        text(r.openRate === null ? "" : `${r.openRate}%`),
        text(r.clickRate === null ? "" : `${r.clickRate}%`),
        text(r.bounceRate === null ? "" : `${r.bounceRate}%`),
    ])

    return writeXlsxFile(
        [
            {
                sheet: "Campaigns",
                data: [
                    header(
                        "Campaign",
                        "Status",
                        "Sent",
                        "Recipients",
                        "Accepted",
                        "Failed",
                        "Bounced",
                        "Opens",
                        "Clicks",
                        "Unsubscribes",
                        "Open rate",
                        "Click rate",
                        "Bounce rate"
                    ),
                    ...rows,
                ],
                columns: [
                    { width: 30 },
                    { width: 16 },
                    { width: 20 },
                    ...Array.from({ length: 7 }, () => ({ width: 12 })),
                    { width: 11 },
                    { width: 11 },
                    { width: 12 },
                ],
                stickyRowsCount: 1,
            },
            {
                sheet: "About these numbers",
                data: [
                    [text("How to read this", { fontWeight: "bold" })],
                    [
                        text(
                            "Open and click rates are a share of the emails the " +
                            "mail server accepted, not of everybody targeted."
                        ),
                    ],
                    [
                        text(
                            "Accepted means the server took the message. It is " +
                            "not the same as it arriving, and only a provider " +
                            "that sends webhooks can confirm delivery."
                        ),
                    ],
                    [
                        text(
                            "Opens are approximate. Privacy proxies fetch the " +
                            "tracking image with nobody reading, and image " +
                            "blocking hides real opens. Clicks are reliable."
                        ),
                    ],
                    [null],
                    [text("Exported by"), text(input.exportedBy)],
                    [
                        text("Exported at"),
                        text(when(input.exportedAt.toISOString())),
                    ],
                ],
                columns: [{ width: 24 }, { width: 80 }],
            },
        ]
    ).toBuffer()
}

/**
 * A Content-Disposition header for a download.
 *
 * Copied from the lead source workbook: the plain name is ASCII only, and
 * the full name goes in filename*, so "Report – Nov.xlsx" neither breaks
 * the header nor loses its dash.
 */
export function attachmentHeader(fileName: string): string {
    const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_")
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

export const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
