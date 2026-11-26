import type { CheckedLeadRow } from "./checkRows"

/**
 * The first note on an imported lead.
 *
 * The form questions are what a salesperson needs before the first call,
 * so they come first. They differ from form to form ("What type of website
 * do you need?" for web development, "What are you looking to achieve
 * through performance marketing?" for digital marketing). The note does not
 * care which form it is. It writes every question column the row answered.
 *
 * Then the contact details the Lead model has no field for (company,
 * website, city ...), then where the row came from.
 *
 * The ad, ad set and campaign are not written here. The lead points at
 * them, and the lead page shows them.
 */
export function buildImportNote(
    row: CheckedLeadRow,
    ctx: { fileName: string; userName: string; zone: string }
): { title: string; description: string } {
    const lines: string[] = []

    for (const { question, answer } of row.answers) {
        lines.push(question, `→ ${answer}`, "")
    }

    for (const { label, value } of row.details) {
        lines.push(`${label}: ${value}`)
    }
    if (row.submittedAt) {
        lines.push(`Form sent: ${formatMoment(row.submittedAt, ctx.zone)}`)
    }
    if (row.details.length > 0 || row.submittedAt) lines.push("")

    lines.push(`Imported by ${ctx.userName} from ${ctx.fileName}, row ${row.n}.`)

    return {
        title: row.answers.length > 0 ? "Lead form answers" : "Imported lead",
        description: lines.join("\n").trim(),
    }
}

/** "20 Nov 2026, 10:23 AM GMT+5:30" in the import region's zone. */
export function formatMoment(date: Date, zone: string): string {
    try {
        return new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: zone,
            timeZoneName: "short",
        }).format(date)
    } catch {
        return date.toISOString()
    }
}
