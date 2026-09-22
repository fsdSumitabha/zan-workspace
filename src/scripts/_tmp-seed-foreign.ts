// Inserts marked US/AE records with the raw driver so the OPM isolation test
// can actually fail. Every doc carries marker: "REGIONTEST".
import { config } from "dotenv"
config({ path: ".env.local" })
config({ path: ".env" })

async function main() {
    const mongoose = (await import("mongoose")).default
    await mongoose.connect(process.env.MONGODB_URI!)
    const db = mongoose.connection.db!
    const oid = () => new mongoose.Types.ObjectId()
    const now = new Date()

    const usUser = await db.collection("users").findOne({ email: "tech@zanservices.com" })
    const usUserId = usUser!._id

    const leadSample = await db.collection("leads").findOne({})
    const clientSample = await db.collection("clients").findOne({})
    const projectSample = await db.collection("projects").findOne({})
    const interactionSample = await db.collection("interactions").findOne({})
    const meetingSample = await db.collection("meetings").findOne({})
    console.log("SAMPLE lead keys:", Object.keys(leadSample ?? {}).join(","))
    console.log("SAMPLE client keys:", Object.keys(clientSample ?? {}).join(","))
    console.log("SAMPLE project keys:", Object.keys(projectSample ?? {}).join(","))
    console.log("SAMPLE interaction keys:", Object.keys(interactionSample ?? {}).join(","))
    console.log("SAMPLE meeting keys:", Object.keys(meetingSample ?? {}).join(","))
    console.log("SAMPLE meeting:", JSON.stringify(meetingSample).slice(0, 900))
    console.log("SAMPLE interaction:", JSON.stringify(interactionSample).slice(0, 600))
    console.log("SAMPLE lead:", JSON.stringify(leadSample).slice(0, 700))
    console.log("SAMPLE client:", JSON.stringify(clientSample).slice(0, 700))
    console.log("SAMPLE project:", JSON.stringify(projectSample).slice(0, 700))
    await mongoose.disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
