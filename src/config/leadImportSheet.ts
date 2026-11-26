/**
 * The sheet for the bulk lead import.
 *
 * Built like src/config/leadSourceSheet.ts. Edit it by hand, then restart
 * the server. The import page, the template download and the import check
 * all read this file.
 *
 * ---------------------------------------------------------------------------
 * The idea
 * ---------------------------------------------------------------------------
 *
 * A Meta lead export has two kinds of column:
 *
 *   1. Columns every export has: id, created_time, ad_id, ad_name, adset_id,
 *      adset_name, campaign_id, campaign_name, form_id, form_name,
 *      is_organic, platform, and the contact fields (full_name,
 *      phone_number, email, company_name ...). They are listed below.
 *
 *   2. One column per custom question of the form, with the question as
 *      the header: "what_type_of_website_do_you_need?". These change from
 *      form to form, so they are NOT listed here. Every header that matches
 *      nothing below is read as a form question. Its answer goes into the
 *      lead's first note.
 *
 * So a new form with new questions needs no change here.
 *
 * ---------------------------------------------------------------------------
 * How a header is matched
 * ---------------------------------------------------------------------------
 *
 * The same as lead sources: lower case, and every run of spaces, dots,
 * dashes, slashes and underscores becomes one underscore. Other signs such
 * as "?" are dropped. "Phone Number" matches "phone_number".
 *
 * Two headers may mean the same column, such as phone_number and
 * work_phone_number. Then the first one with a value in each row is used.
 *
 * ---------------------------------------------------------------------------
 * Column fields
 * ---------------------------------------------------------------------------
 *
 *   key       Where the value goes. The import code reads these keys.
 *   label     The name the app shows.
 *   headers   Header texts that mean this column. The first one is used in
 *             the template file.
 *   kind      How the cell is read. See ColumnKind.
 *   required  The file must have the column. A row with no value fails.
 *   inNote    The value is written into the lead's first note, under
 *             "Details". The Lead model has no field for it.
 */

/**
 * text      Any text. Extra spaces are removed.
 * phone     One phone number. Meta writes "p:+919876543210"; the "p:" is removed.
 * email     Checked for the shape name@domain.
 * id        A platform id. Meta writes "c:120212345678901234"; the prefix
 *           is removed. Must be digits for Meta. A number Excel rounded,
 *           such as 1.20212E+17, is refused with a warning.
 * datetime  A date and time. "2026-11-20T10:23:45+05:30" is exact. A time
 *           with no zone is read in the import region's zone.
 * boolean   true / false, yes / no, 1 / 0.
 * country   A country name or code. Used to read a phone without "+".
 */
export type ImportColumnKind = "text" | "phone" | "email" | "id" | "datetime" | "boolean" | "country"

export interface ImportColumn {
    key: ImportColumnKey
    label: string
    headers: readonly string[]
    kind: ImportColumnKind
    required?: boolean
    inNote?: boolean
}

export type ImportColumnKey =
    | "leadId"
    | "createdTime"
    | "adId"
    | "adName"
    | "adSetId"
    | "adSetName"
    | "campaignId"
    | "campaignName"
    | "formId"
    | "formName"
    | "isOrganic"
    | "channel"
    | "name"
    | "firstName"
    | "lastName"
    | "phone"
    | "email"
    | "company"
    | "website"
    | "jobTitle"
    | "street"
    | "city"
    | "state"
    | "zip"
    | "country"
    | "inboxUrl"

export const LEAD_IMPORT_COLUMNS: readonly ImportColumn[] = [
    // ---- Meta export columns ----
    {
        key: "leadId",
        label: "Lead id",
        // "d" is how the header was first pasted. Remove it if the real
        // export always says "id".
        headers: ["id", "lead_id", "leadgen_id", "d"],
        kind: "id",
    },
    { key: "createdTime", label: "Submitted at", headers: ["created_time", "created_at", "submitted_at"], kind: "datetime" },
    { key: "adId", label: "Ad id", headers: ["ad_id"], kind: "id" },
    { key: "adName", label: "Ad", headers: ["ad_name"], kind: "text" },
    { key: "adSetId", label: "Ad set id", headers: ["adset_id", "ad_set_id"], kind: "id" },
    { key: "adSetName", label: "Ad set", headers: ["adset_name", "ad_set_name"], kind: "text" },
    { key: "campaignId", label: "Campaign id", headers: ["campaign_id"], kind: "id" },
    { key: "campaignName", label: "Campaign", headers: ["campaign_name"], kind: "text" },
    { key: "formId", label: "Form id", headers: ["form_id"], kind: "id" },
    { key: "formName", label: "Form", headers: ["form_name"], kind: "text" },
    { key: "isOrganic", label: "Organic", headers: ["is_organic"], kind: "boolean" },
    {
        key: "channel",
        label: "Placement",
        // Meta writes "fb" or "ig" here. It becomes the lead's source:
        // facebook or instagram. See CHANNEL_SOURCE below.
        headers: ["platform", "publisher_platform"],
        kind: "text",
    },

    // ---- The person ----
    { key: "name", label: "Name", headers: ["full_name", "name", "contact_name"], kind: "text", required: true },
    { key: "firstName", label: "First name", headers: ["first_name"], kind: "text" },
    { key: "lastName", label: "Last name", headers: ["last_name"], kind: "text" },
    {
        key: "phone",
        label: "Phone",
        headers: ["phone_number", "work_phone_number", "phone", "mobile", "mobile_number", "whatsapp_number"],
        kind: "phone",
        required: true,
    },
    { key: "email", label: "Email", headers: ["email", "work_email", "email_address"], kind: "email" },

    // ---- Written into the first note ----
    { key: "company", label: "Company", headers: ["company_name", "company"], kind: "text", inNote: true },
    { key: "website", label: "Website", headers: ["website", "company_website"], kind: "text", inNote: true },
    { key: "jobTitle", label: "Job title", headers: ["job_title"], kind: "text", inNote: true },
    { key: "street", label: "Address", headers: ["street_address", "address"], kind: "text", inNote: true },
    { key: "city", label: "City", headers: ["city"], kind: "text", inNote: true },
    { key: "state", label: "State", headers: ["state", "province"], kind: "text", inNote: true },
    { key: "zip", label: "ZIP", headers: ["zip_code", "post_code", "postal_code", "pin_code"], kind: "text", inNote: true },
    { key: "country", label: "Country", headers: ["country"], kind: "country", inNote: true },
    { key: "inboxUrl", label: "Meta inbox link", headers: ["inbox_url"], kind: "text", inNote: true },
]

/**
 * Meta's "platform" column, to the lead's `source` text. The notification
 * text has a label for each one in src/lib/notifications/render.ts.
 * A value not listed here is kept as it is, in lower case.
 */
export const CHANNEL_SOURCE: Record<string, string> = {
    fb: "facebook",
    facebook: "facebook",
    ig: "instagram",
    instagram: "instagram",
    msg: "messenger",
    messenger: "messenger",
    wa: "whatsapp",
    whatsapp: "whatsapp",
    an: "audience-network",
}

/** The lead's source for a Meta row whose platform cell is empty. */
export const META_DEFAULT_SOURCE = "facebook"

export const LEAD_IMPORT_RULES = {
    /** The biggest file accepted, in megabytes. */
    maxFileMb: 5,

    /**
     * The most data rows in one file. Each row is one lead and one note, and
     * they are all saved in a few bulk writes, so 2,000 rows take a few
     * seconds. The report copy of 2,000 rows is about 1 MB.
     */
    maxRows: 2000,

    /** The longest value kept from one cell. Longer text is cut, with a warning. */
    maxCellLength: 1000,
} as const

/**
 * Columns that a downloaded import report adds. They are ignored when that
 * report is imported again, so a fixed report can go straight back in.
 * The lead source report's columns are ignored too.
 */
export const IMPORT_REPORT_ONLY_HEADERS = [
    "row_no",
    "import_result",
    "import_notes",
    "upload_result",
    "upload_notes",
] as const
