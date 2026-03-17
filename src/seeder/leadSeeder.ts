import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import { LEAD_STATUS } from "@/constants/leadStatus"

const leads = [
    {
        name: "Suresh Raina",
        email: "suresh@raina.com",
        phone: "9876543210",
        source: "Website",
        status: LEAD_STATUS.MEETING
    },
    {
        name: "Munaf Patel",
        email: "munaf@patelinfra.com",
        phone: "9876543211",
        source: "Referral",
        status: LEAD_STATUS.NEGOTIATION
    },
    {
        name: "Ajinkya Rahane",
        phone: "9876543212",
        source: "LinkedIn",
        status: LEAD_STATUS.DISCUSSION
    },
    {
        name: "Aashwini Kumar",
        phone: "9876543213",
        source: "Cold Call",
        status: LEAD_STATUS.CONTACTED
    },
    {
        name: "Jasprit Bumrah",
        phone: "9876543214",
        source: "Website",
        status: LEAD_STATUS.NEGOTIATION
    },
    {
        name: "Hardik Pandya",
        phone: "9876543215",
        source: "Instagram",
        status: LEAD_STATUS.CONTACTED
    },
    {
        name: "Ishan Kishan",
        phone: "9876543216",
        source: "Google Ads",
        status: LEAD_STATUS.MEETING
    },
    {
        name: "Ravindra Jadeja",
        phone: "9876543217",
        source: "Google Ads",
        status: LEAD_STATUS.NEW
    },
    {
        name: "Cheteshwar Pujara",
        phone: "9876543218",
        source: "Referral",
        status: LEAD_STATUS.CONTACTED
    }
]

export default async function seedLeads() {
    try {
        await dbConnect()
        console.log("DB Connected (Leads)")

        // reset (safe because you're controlling order)
        await Lead.deleteMany()
        console.log("Old Leads Deleted")

        const inserted = await Lead.insertMany(leads)

        console.log("Seeded Leads:")
        inserted.forEach((lead) => {
            console.log(`${lead.name} -> ${lead._id}`)
        })

        return inserted
    } catch (err) {
        console.error("Lead Seeder Error:", err)
        throw err // important for parent runner
    }
}