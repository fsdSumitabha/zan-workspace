/**
 * The Excel sheet for lead source uploads.
 *
 * This is the one file to edit when the sheet changes. There is no UI for it.
 * Save the file, then restart the server.
 *
 * The upload page, the template download and the upload check all read this
 * file. Nothing else has to change when you add a column or a header name.
 *
 * ---------------------------------------------------------------------------
 * How a header cell is matched
 * ---------------------------------------------------------------------------
 *
 * Both sides are cleaned the same way first: lower case, and every run of
 * spaces, dots, dashes, slashes and underscores becomes one underscore.
 * So "Domain Name", "domain-name" and "DOMAIN_NAME" all match "domain_name".
 *
 * A column matches when the cleaned header equals its `key` or any entry in
 * its `headers`.
 *
 * The header row is the first row, in the first 10 rows of the sheet, that
 * holds every required column. Title rows above it are ignored.
 *
 * ---------------------------------------------------------------------------
 * Column fields
 * ---------------------------------------------------------------------------
 *
 *   key         Where the value is saved. Never rename the key of a column
 *               that already has data. Old rows keep the old key.
 *   label       The name the app shows.
 *   headers     Header texts that mean this column. The first one is used in
 *               the template file.
 *   required    The file must have this column, and every row must have a
 *               value in it. A row with an empty cell is skipped.
 *   kind        How the cell is checked. See ColumnKind below.
 *   inList      Shown next to the name on each row of the list page. The
 *               number is the order: 1 first, then 2, and so on.
 *   searchable  Matched by the search box on the list page.
 *
 * ---------------------------------------------------------------------------
 * Keys the app itself reads. Keep these columns.
 * ---------------------------------------------------------------------------
 *
 *   name     The name shown everywhere. Copied to the lead on convert.
 *   phone    The number to call. Rows without a valid number are skipped.
 *   email    Copied to the lead on convert.
 *   company  Copied to the lead note on convert.
 *   country  Used to read phone numbers written without a "+" code.
 *
 * Every other column is saved as it is, and shown on the details page.
 */

/**
 * text     Any text. Extra spaces are removed.
 * phone    Must be one valid phone number. Saved in +country format.
 * email    Checked for the shape name@domain. A bad value is kept in the
 *          sheet data but not used as the email.
 * date     Read as a date and saved as YYYY-MM-DD. A value that is not a
 *          date is kept as text, with a warning.
 * country  A country name or a two-letter code, such as "United States" or
 *          "US". Used to read the phone number of the same row.
 */
export type ColumnKind = "text" | "phone" | "email" | "date" | "country"

export interface SheetColumn {
    key: string
    label: string
    headers: readonly string[]
    kind: ColumnKind
    required?: boolean
    inList?: number
    searchable?: boolean
}

export const LEAD_SOURCE_COLUMNS: readonly SheetColumn[] = [
    {
        key: "domain_name",
        label: "Domain",
        // "omain_name" is how the header was first written down. Remove it
        // if the real sheet always says "domain_name".
        headers: ["domain_name", "domain", "omain_name"],
        kind: "text",
        inList: 2,
        searchable: true,
    },
    {
        key: "create_date",
        label: "Domain created",
        headers: ["create_date", "created_date", "creation_date"],
        kind: "date",
    },
    {
        key: "expiry_date",
        label: "Domain expires",
        headers: ["expiry_date", "expiration_date", "expire_date"],
        kind: "date",
    },
    {
        key: "domain_company_name",
        label: "Domain company",
        headers: ["domain_company_name"],
        kind: "text",
        searchable: true,
    },
    {
        key: "name",
        label: "Name",
        headers: ["name", "full_name", "contact_name"],
        kind: "text",
        required: true,
        searchable: true,
    },
    {
        key: "company",
        label: "Company",
        headers: ["company", "company_name", "organization", "organisation"],
        kind: "text",
        inList: 1,
        searchable: true,
    },
    {
        key: "address",
        label: "Address",
        headers: ["address", "street", "street_address"],
        kind: "text",
    },
    {
        key: "city",
        label: "City",
        headers: ["city", "town"],
        kind: "text",
        searchable: true,
    },
    {
        key: "state",
        label: "State",
        headers: ["state", "province"],
        kind: "text",
    },
    {
        key: "zip",
        label: "ZIP",
        headers: ["zip", "zip_code", "zipcode", "postal_code", "postcode", "pin_code"],
        kind: "text",
    },
    {
        key: "country",
        label: "Country",
        headers: ["country"],
        kind: "country",
    },
    {
        key: "email",
        label: "Email",
        headers: ["email", "email_address", "e_mail"],
        kind: "email",
        searchable: true,
    },
    {
        key: "phone",
        label: "Phone",
        headers: ["phone", "phone_number", "telephone", "mobile", "contact_number"],
        kind: "phone",
        required: true,
        searchable: true,
    },
]

export const LEAD_SOURCE_SHEET_RULES = {
    /**
     * The biggest file accepted, in megabytes.
     */
    maxFileMb: 5,

    /**
     * The most data rows in one file. Empty rows do not count.
     *
     * Each upload keeps a copy of every row for its report, in one database
     * document. MongoDB caps one document at 16 MB. 5,000 rows use about
     * 2 MB. Do not go above 20,000.
     */
    maxRows: 5000,

    /**
     * true:  a header that matches no column above is kept. Its values are
     *        saved and shown on the details page as extra data.
     * false: a file with such a header is refused.
     */
    keepUnknownColumns: true,

    /**
     * The longest value kept from one cell. Longer text is cut, with a
     * warning on that row.
     */
    maxCellLength: 500,
} as const

/**
 * Columns that a downloaded upload report adds. They are ignored when that
 * report is uploaded again, so a fixed report can go straight back in.
 */
export const REPORT_ONLY_HEADERS = ["row_no", "upload_result", "upload_notes"] as const
