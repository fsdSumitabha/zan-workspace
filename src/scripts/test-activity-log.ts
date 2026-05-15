import { config } from "dotenv"

config({ path: ".env.local" })

async function main() {
    const dbConnect = (await import("@/lib/db/dbConnect")).default
    const { enterAuditContext } = await import("@/lib/activity-log/auditContext")
    const Lead = (await import("@/models/Lead")).default
    const ActivityLog = (await import("@/models/ActivityLog")).default

    await dbConnect()

    const hookNames = Object.keys(Lead.schema.s.hooks._pres || {})
    const postHookNames = Object.keys(Lead.schema.s.hooks._posts || {})
    console.log("Lead pre hooks:", hookNames)
    console.log("Lead post hooks:", postHookNames)

    const lead = await Lead.findOne({ deletedAt: null })
    if (!lead) {
        console.log("No lead found to test")
        process.exit(1)
    }

    const beforeCount = await ActivityLog.countDocuments()
    console.log("ActivityLog count before:", beforeCount)

    enterAuditContext("000000000000000000000001")

    const newName = `${lead.name} audit-${Date.now()}`
    console.log("Updating lead", lead._id, "name ->", newName)

    const updated = await Lead.findByIdAndUpdate(
        lead._id,
        { name: newName },
        { returnDocument: "after", runValidators: true }
    )

    console.log("Updated name:", updated?.name)

    const afterCount = await ActivityLog.countDocuments()
    console.log("ActivityLog count after:", afterCount)

    const latest = await ActivityLog.find().sort({ createdAt: -1 }).limit(3).lean()
    console.log("Latest logs:", JSON.stringify(latest, null, 2))
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
