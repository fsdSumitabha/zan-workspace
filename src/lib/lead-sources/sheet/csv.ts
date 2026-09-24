/**
 * Reads CSV text into rows of cells, every cell as text.
 *
 * Written here instead of using a library so that nothing is converted.
 * A converter reads "0044 20 7946 0958" as a number and drops the zeros, and
 * reads "03/04/2021" as whichever date order it likes.
 *
 * Follows RFC 4180: cells in double quotes can hold commas, line breaks and
 * doubled quotes. The separator is guessed from the first line, because
 * Excel in many locales saves with ";" instead of ",".
 */
export function parseCsv(text: string): string[][] {
    const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    const separator = guessSeparator(body)

    const rows: string[][] = []
    let row: string[] = []
    let cell = ""
    let quoted = false
    let i = 0

    while (i < body.length) {
        const ch = body[i]

        if (quoted) {
            if (ch === '"') {
                if (body[i + 1] === '"') {
                    cell += '"'
                    i += 2
                    continue
                }
                quoted = false
                i++
                continue
            }
            cell += ch
            i++
            continue
        }

        if (ch === '"' && cell === "") {
            quoted = true
            i++
            continue
        }

        if (ch === separator) {
            row.push(cell)
            cell = ""
            i++
            continue
        }

        if (ch === "\r" || ch === "\n") {
            row.push(cell)
            rows.push(row)
            row = []
            cell = ""
            i += ch === "\r" && body[i + 1] === "\n" ? 2 : 1
            continue
        }

        cell += ch
        i++
    }

    if (cell !== "" || row.length > 0) {
        row.push(cell)
        rows.push(row)
    }

    // Excel adds empty rows at the end. They carry no data and would only
    // show up as blank lines in the report.
    while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === "")) {
        rows.pop()
    }

    return rows
}

function guessSeparator(text: string): string {
    const end = text.search(/\r|\n/)
    const firstLine = end === -1 ? text : text.slice(0, end)

    const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
    let quoted = false
    for (const ch of firstLine) {
        if (ch === '"') quoted = !quoted
        else if (!quoted && ch in counts) counts[ch]++
    }

    const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return best[1] > 0 ? best[0] : ","
}

/**
 * Decodes an uploaded CSV file.
 *
 * Excel saves "CSV UTF-8" as UTF-8, but plain "CSV" on Windows as
 * Windows-1252. Decoding that as UTF-8 turns "José" into "Jos�". So strict
 * UTF-8 is tried first, and Windows-1252 is the fallback.
 */
export function decodeCsv(buffer: Uint8Array): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
    } catch {
        return new TextDecoder("windows-1252").decode(buffer)
    }
}
