import "./testing/tsxPhoneFix"
import "./testing/testEnv"
import test, { before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { Types } from "mongoose"

import { connectTestDb, disconnectTestDb, clearCollections, withoutRegionScope } from "@/lib/email/testing/db"
import { runWithRegionContext } from "@/lib/region-scope"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import { AD_PLATFORM, LEAD_IMPORT_STATUS } from "@/constants/adTracking"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import ActivityLog from "@/models/ActivityLog"
import Ad from "@/models/Ad"
import AdCampaign from "@/models/AdCampaign"
import AdSet from "@/models/AdSet"
import Interaction from "@/models/Interaction"
import Lead from "@/models/Lead"
import LeadForm from "@/models/LeadForm"
import LeadImport from "@/models/LeadImport"
import { runLeadImport, type LeadImportDoneResult, type LeadImportCheckResult } from "./importLeads"
import { leadStatsFor, listRecords, resolveLeadAdSource } from "./records"

/**
 * The whole import against a real MongoDB: the `_test` database only, see
 * src/lib/email/testing/db.ts. Run with `npm test`.
 *
 * The web development file is written the way Meta exports it: UTF-16,
 * tabs between cells, ids and phones with Meta's "c:", "ag:", "p:" prefixes.
 */

const USER: AuthUser = {
    id: new Types.ObjectId().toString(),
    name: "Saransh Test",
    role: 50,
    isActive: true,
    regions: ["IN"],
}

const MODELS = [Lead, Interaction, ActivityLog, Ad, AdSet, AdCampaign, LeadForm, LeadImport]

const WEB_HEADER = [
    "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name",
    "form_id", "form_name", "is_organic", "platform",
    "what_type_of_website_do_you_need?", "when_do_you_want_to_launch_your_website?",
    "full_name", "phone_number", "email", "company_name",
]

const WEB_ROWS = [
    // Paid, Ad A.
    ["l:1000000000000001", "2026-11-20T10:23:45+05:30", "ag:120200000000000011", "Ad A", "as:120200000000000021", "Set 1", "c:120200000000000031", "Web Nov", "f:900000000000001", "Website form", "false", "fb", "e-commerce_website", "within_1_month", "Asha Rao", "p:+919876543210", "asha@example.com", "Rao Traders"],
    // Paid, Ad B, from Instagram, with a bad email: imported with a warning.
    ["l:1000000000000002", "2026-11-20T11:00:00+05:30", "ag:120200000000000012", "Ad B", "as:120200000000000021", "Set 1", "c:120200000000000031", "Web Nov", "f:900000000000001", "Website form", "false", "ig", "business_website", "in_2-3_months", "Vikram Shah", "p:+919812345678", "vikram@example", "Shah & Co"],
    // Organic: no ad, only the form.
    ["l:1000000000000003", "2026-11-21T09:00:00+05:30", "", "", "", "", "", "", "f:900000000000001", "Website form", "true", "fb", "portfolio", "not_sure", "Neha Gupta", "p:+919900112233", "neha@example.com", ""],
    // Bad phone: fails. Its newer name for Ad A must not win over row 6.
    ["l:1000000000000004", "2026-11-21T09:30:00+05:30", "ag:120200000000000011", "Ad A renamed", "as:120200000000000021", "Set 1", "c:120200000000000031", "Web Nov", "f:900000000000001", "Website form", "false", "fb", "landing_page", "asap", "Bad Phone", "p:12", "bad@example.com", ""],
    // Same phone as row 2: duplicate in the file.
    ["l:1000000000000005", "2026-11-21T10:00:00+05:30", "ag:120200000000000011", "Ad A", "as:120200000000000021", "Set 1", "c:120200000000000031", "Web Nov", "f:900000000000001", "Website form", "false", "fb", "landing_page", "asap", "Asha Again", "p:+919876543210", "", ""],
]

const DM_CSV = [
    "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,form_name,is_organic,platform,what_are_you_looking_to_achieve_through_performance_marketing?,when_are_you_looking_to_start?,full_name,work_phone_number,work_email,company_name,website",
    "l:2000000000000001,2026-11-22T10:00:00+05:30,ag:120200000000000041,DM Ad,as:120200000000000051,DM Set,c:120200000000000061,DM Nov,f:900000000000002,DM form,false,fb,more_leads,immediately,Ravi Kumar,p:+919811122233,ravi@acme.in,Acme,acme.in",
    // Already in the CRM from the Facebook webhook, with no ad. Gets linked.
    "l:2000000000000002,2026-11-22T11:00:00+05:30,ag:120200000000000041,DM Ad,as:120200000000000051,DM Set,c:120200000000000061,DM Nov,f:900000000000002,DM form,false,fb,brand_awareness,next_month,Webhook Person,p:+919822233344,,,",
].join("\r\n")

function utf16Tsv(rows: string[][]): File {
    const text = rows.map((r) => r.join("\t")).join("\r\n")
    const bytes = new Uint8Array(2 + text.length * 2)
    bytes[0] = 0xff
    bytes[1] = 0xfe
    for (let i = 0; i < text.length; i++) {
        bytes[2 + i * 2] = text.charCodeAt(i) & 0xff
        bytes[3 + i * 2] = text.charCodeAt(i) >> 8
    }
    return new File([bytes], "web-dev-leads.csv", { type: "text/csv" })
}

function inRegion<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRegionContext({ regions: ["IN"], writeRegion: "IN" }, fn)
}

function importFile(file: File, check = false) {
    return inRegion(() =>
        runLeadImport({ file, region: "IN", platform: AD_PLATFORM.META, source: "", user: USER, check })
    )
}

before(async () => {
    await connectTestDb()
    for (const model of MODELS) await model.createIndexes()
})

after(async () => {
    await disconnectTestDb()
})

beforeEach(async () => {
    await withoutRegionScope(() => clearCollections(MODELS))
})

test("check saves nothing and says what would happen", async () => {
    const result = (await importFile(utf16Tsv([WEB_HEADER, ...WEB_ROWS]), true)) as LeadImportCheckResult

    assert.equal(result.check, true)
    assert.deepEqual(result.counts, { read: 5, imported: 3, warned: 1, duplicates: 1, failed: 1, linked: 0 })
    assert.deepEqual(result.newSources, { campaigns: 1, adSets: 1, ads: 2, forms: 1 })

    await withoutRegionScope(async () => {
        assert.equal(await Lead.countDocuments({}), 0)
        assert.equal(await AdCampaign.countDocuments({}), 0)
        assert.equal(await LeadImport.countDocuments({}), 0)
    })
})

test("import saves each ad record once, and points each lead at the most specific one", async () => {
    const result = (await importFile(utf16Tsv([WEB_HEADER, ...WEB_ROWS]))) as LeadImportDoneResult

    assert.deepEqual(result.counts, { read: 5, imported: 3, warned: 1, duplicates: 1, failed: 1, linked: 0 })
    assert.deepEqual(result.newSources, { campaigns: 1, adSets: 1, ads: 2, forms: 1 })

    await withoutRegionScope(async () => {
        assert.equal(await AdCampaign.countDocuments({}), 1)
        assert.equal(await AdSet.countDocuments({}), 1)
        assert.equal(await Ad.countDocuments({}), 2)
        assert.equal(await LeadForm.countDocuments({}), 1)

        const campaign = await AdCampaign.findOne({}).lean()
        const adSet = await AdSet.findOne({}).lean()
        const adA = await Ad.findOne({ externalId: "120200000000000011" }).lean()
        const form = await LeadForm.findOne({}).lean()
        assert.equal(campaign?.externalId, "120200000000000031")
        assert.equal(String(adSet?.campaign), String(campaign?._id))
        assert.equal(String(adA?.adSet), String(adSet?._id))
        assert.equal(String(adA?.campaign), String(campaign?._id))
        assert.equal(String(adA?.leadForm), String(form?._id))

        // The newest row (row 6, 10:00) named it "Ad A". The failed row 5
        // (09:30) said "Ad A renamed". The newest wins; both are kept.
        assert.equal(adA?.name, "Ad A")
        assert.deepEqual([...(adA?.aliases ?? [])].sort(), ["Ad A", "Ad A renamed"])
        assert.deepEqual(form?.questions.map((q) => q.label), [
            "What type of website do you need?",
            "When do you want to launch your website?",
        ])

        const asha = await Lead.findOne({ phone: "+919876543210" }).lean()
        assert.equal(asha?.sourceReferenceModel, "Ad")
        assert.equal(String(asha?.sourceReference), String(adA?._id))
        assert.equal(String(asha?.leadForm), String(form?._id))
        assert.equal(asha?.source, "facebook")
        assert.equal(asha?.platform, "META")
        assert.equal(asha?.externalLeadId, "1000000000000001")
        assert.equal(String(asha?.createdBy), USER.id)
        assert.equal(String(asha?.importId), result.importId)
        assert.equal(asha?.submittedAt?.toISOString(), "2026-11-20T04:53:45.000Z")

        const vikram = await Lead.findOne({ phone: "+919812345678" }).lean()
        assert.equal(vikram?.source, "instagram")
        assert.equal(vikram?.email, undefined)

        const neha = await Lead.findOne({ phone: "+919900112233" }).lean()
        assert.equal(neha?.sourceReferenceModel, "LeadForm")
        assert.equal(String(neha?.sourceReference), String(form?._id))

        // The first note, by the importer, with the answers.
        const note = await Interaction.findOne({ entityId: asha?._id }).lean()
        assert.equal(note?.type, INTERACTION_TYPE.NOTE_ADDED)
        assert.equal(note?.region, "IN")
        assert.equal(String(note?.createdBy), USER.id)
        assert.equal(String(asha?.lastInteractionId), String(note?._id))
        assert.match(note?.description ?? "", /What type of website do you need\?\n→ E-commerce website/)
        assert.match(note?.description ?? "", /Company: Rao Traders/)
        assert.match(note?.description ?? "", /Imported by Saransh Test from web-dev-leads\.csv, row 2\./)

        // Activity log: a CREATE row per lead and per note, in the importer's name.
        assert.equal(await ActivityLog.countDocuments({ entityType: ENTITY_TYPE.LEAD, action: "CREATE", userId: USER.id }), 3)
        assert.equal(await ActivityLog.countDocuments({ entityType: ENTITY_TYPE.INTERACTION, action: "CREATE" }), 3)

        const record = await LeadImport.findById(result.importId).lean()
        assert.equal(record?.status, LEAD_IMPORT_STATUS.DONE)
        assert.equal(String(record?.uploadedBy), USER.id)
        assert.deepEqual(
            record?.breakdown.campaigns.map((b) => [b.name, b.imported, b.duplicates, b.failed]),
            [["Web Nov", 2, 1, 1]]
        )
        assert.equal(record?.breakdown.forms[0].imported, 3)
    })
})

test("the same file again: every row is a duplicate, and no ad record is repeated", async () => {
    await importFile(utf16Tsv([WEB_HEADER, ...WEB_ROWS]))
    const again = (await importFile(utf16Tsv([WEB_HEADER, ...WEB_ROWS]))) as LeadImportDoneResult

    assert.deepEqual(again.counts, { read: 5, imported: 0, warned: 0, duplicates: 4, failed: 1, linked: 0 })
    assert.deepEqual(again.newSources, { campaigns: 0, adSets: 0, ads: 0, forms: 0 })

    await withoutRegionScope(async () => {
        assert.equal(await Lead.countDocuments({}), 3)
        assert.equal(await AdCampaign.countDocuments({}), 1)
        assert.equal(await Ad.countDocuments({}), 2)
    })
})

test("a lead the webhook saved without an ad is linked by the export", async () => {
    await withoutRegionScope(() =>
        Lead.create({ name: "Webhook Person", phone: "+919822233344", source: "facebook", region: "IN" })
    )

    const preview = (await importFile(new File([DM_CSV], "dm-leads.csv", { type: "text/csv" }), true)) as LeadImportCheckResult
    assert.equal(preview.counts.linked, 1)

    const result = (await importFile(new File([DM_CSV], "dm-leads.csv", { type: "text/csv" }))) as LeadImportDoneResult
    assert.deepEqual(result.counts, { read: 2, imported: 1, warned: 0, duplicates: 1, failed: 0, linked: 1 })

    await withoutRegionScope(async () => {
        const ad = await Ad.findOne({ externalId: "120200000000000041" }).lean()
        const linked = await Lead.findOne({ phone: "+919822233344" }).lean()
        assert.equal(linked?.sourceReferenceModel, "Ad")
        assert.equal(String(linked?.sourceReference), String(ad?._id))
        assert.equal(linked?.externalLeadId, "2000000000000002")

        const ravi = await Lead.findOne({ phone: "+919811122233" }).lean()
        assert.equal(ravi?.email, "ravi@acme.in")
        const note = await Interaction.findOne({ entityId: ravi?._id }).lean()
        assert.match(note?.description ?? "", /What are you looking to achieve through performance marketing\?\n→ More leads/)
        assert.match(note?.description ?? "", /Website: acme\.in/)
    })
})

test("lead counts roll up from ads to ad sets and campaigns, and the chain reads back", async () => {
    await importFile(utf16Tsv([WEB_HEADER, ...WEB_ROWS]))

    await inRegion(async () => {
        const campaign = await AdCampaign.findOne({}).lean()
        const form = await LeadForm.findOne({}).lean()

        const byCampaign = await leadStatsFor("campaign", [campaign!._id])
        assert.equal(byCampaign.get(String(campaign!._id))?.total, 2)

        // The form counts paid and organic leads alike.
        const byForm = await leadStatsFor("form", [form!._id])
        assert.equal(byForm.get(String(form!._id))?.total, 3)

        const list = await listRecords("ad", { page: 1, limit: 10, sort: "leads" })
        // Both ads have one lead, so their order is not fixed. Sort by name.
        const rows = [...list.rows].sort((a, b) => a.name.localeCompare(b.name))
        assert.deepEqual(rows.map((r) => [r.name, r.stats.total]), [["Ad A", 1], ["Ad B", 1]])
        assert.deepEqual(rows[0].parents.map((p) => p.name), ["Web Nov", "Set 1"])
        assert.equal(rows[0].form?.name, "Website form")

        const asha = await Lead.findOne({ phone: "+919876543210" }).lean()
        const source = await resolveLeadAdSource(asha!)
        assert.equal(source?.campaign?.name, "Web Nov")
        assert.equal(source?.adSet?.name, "Set 1")
        assert.equal(source?.ad?.name, "Ad A")
        assert.equal(source?.form?.name, "Website form")
        assert.equal(source?.organic, false)
    })

    // Another region sees no leads, so no counts.
    await runWithRegionContext({ regions: ["US"], writeRegion: "US" }, async () => {
        const campaign = await AdCampaign.findOne({}).lean()
        const stats = await leadStatsFor("campaign", [campaign!._id])
        assert.equal(stats.get(String(campaign!._id))?.total ?? 0, 0)
    })
})
