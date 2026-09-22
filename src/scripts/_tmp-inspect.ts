import { config } from "dotenv"
config({ path: ".env.local" })
config({ path: ".env" })

async function main() {
    const mongoose = (await import("mongoose")).default
    await mongoose.connect(process.env.MONGODB_URI!)
    const db = mongoose.connection.db!

    const users = await db.collection("users")
        .find({}, { projection: { name: 1, email: 1, role: 1, regions: 1, isActive: 1 } })
        .sort({ role: 1 }).toArray()

    console.log("USERS:", users.length)
    for (const u of users) {
        console.log(
            String(u.role).padStart(3), "|",
            String(u.email).padEnd(32), "|",
            JSON.stringify(u.regions ?? null).padEnd(20), "| active:",
            String(u.isActive).padEnd(5), "|", u.name
        )
    }

    const cols = ["leads","clients","projects","interactions","meetings","calls","quotations","documents","activitylogs"]
    console.log("\nREGION COUNTS (raw driver, unscoped)")
    for (const c of cols) {
        const agg = await db.collection(c).aggregate([
            { $group: { _id: "$region", n: { $sum: 1 } } }, { $sort: { n: -1 } }
        ]).toArray()
        console.log(c.padEnd(14), JSON.stringify(agg))
    }
    await mongoose.disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
