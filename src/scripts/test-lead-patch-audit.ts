import { config } from "dotenv"

config({ path: ".env.local" })

const LEAD_ID = "69fc939d3c488b6ca22f3d72"

async function main() {
    const dbConnect = (await import("@/lib/db/dbConnect")).default
    const { enterAuditContext } = await import("@/lib/activity-log/auditContext")
    const { auditedFindByIdAndUpdate } = await import("@/lib/activity-log/auditedWrite")
    const { getAuditContext } = await import("@/lib/activity-log/auditContext")
    const Lead = (await import("@/models/Lead")).default
    const ActivityLog = (await import("@/models/ActivityLog")).default
    const mongoose = (await import("mongoose")).default

    await dbConnect()
    console.log("DB:", mongoose.connection.db?.databaseName)
    console.log("ActivityLog collection:", ActivityLog.collection.name)

    const lead = await Lead.findById(LEAD_ID)
    if (!lead) {
        console.log("Lead not found:", LEAD_ID)
        process.exit(1)
    }

    enterAuditContext("6a05aee115a7f3b80fc4df87")
    console.log("audit context:", getAuditContext())

    const beforeCount = await ActivityLog.countDocuments()
    const newName = `${lead.name} t${Date.now() % 10000}`

    await auditedFindByIdAndUpdate(Lead, "LEAD", LEAD_ID, {
        name: newName,
        email: lead.email,
        phone: lead.phone,
        source: lead.source,
    })

    const afterCount = await ActivityLog.countDocuments()
    console.log("count", beforeCount, "->", afterCount)
    const latest = await ActivityLog.find({ entityId: LEAD_ID })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean()
    console.log(JSON.stringify(latest, null, 2))
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
