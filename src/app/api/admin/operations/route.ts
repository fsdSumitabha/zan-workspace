import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"

function normalizeLeads(leads: any[]) {
    return leads.map(l => ({
        id: l._id,
        name: l.name,
        company: l.source,
        status: { type: "LEAD", value: l.status },
        service: undefined,
        updatedAt: l.updatedAt
    }))
}

function normalizeClients(clients: any[]) {
    return clients.map(c => ({
        id: c._id,
        name: c.name,
        company: c.company,
        status: { type: "CLIENT", value: c.status },
        service: undefined,
        updatedAt: c.updatedAt
    }))
}

function normalizeProjects(projects: any[]) {
    return projects.map(p => ({
        id: p._id,
        name: p.title,
        company: p.companyName,
        status: { type: "PROJECT", value: p.status },
        service: p.serviceType,
        updatedAt: p.updatedAt
    }))
}

function mergeAndSort(data: any[], limit: number) {
    return data
        .sort(
            (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime()
        )
        .slice(0, limit)
}


export async function GET(req: NextRequest) {
    try {
        await dbConnect()

        const { searchParams } = new URL(req.url)
        const limit = Number(searchParams.get("limit")) || 15

        const [leads, clients, projects] = await Promise.all([
            Lead.find()
                .select("name source status updatedAt")
                .sort({ updatedAt: -1 })
                .limit(limit)
                .lean(),

            Client.find()
                .select("name company status updatedAt")
                .sort({ updatedAt: -1 })
                .limit(limit)
                .lean(),

            Project.find()
                .select("title companyName serviceType status updatedAt")
                .sort({ updatedAt: -1 })
                .limit(limit)
                .lean()
        ])


        const leadViews = normalizeLeads(leads)
        const clientViews = normalizeClients(clients)
        const projectViews = normalizeProjects(projects)


        const recent = mergeAndSort(
            [...leadViews, ...clientViews, ...projectViews],
            limit
        )


        const [totalLeads, activeClients, runningProjects] =
            await Promise.all([
                Lead.countDocuments(),
                Client.countDocuments({ status: 1 }),
                Project.countDocuments({
                    status: { $in: [140, 150] }
                })
            ])

        return NextResponse.json(
            {
                success: true,
                data: {
                    stats: {
                        totalLeads,
                        activeClients,
                        runningProjects
                    },
                    recent
                }
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("Operations API Error:", error)

        return NextResponse.json(
            {
                success: false,
                message: "Failed to load operations dashboard"
            },
            { status: 500 }
        )
    }
}