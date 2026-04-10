import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/db/dbConnect"

import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"

import { ENTITY_TYPE } from "@/constants/entityTypes"

export async function GET(req: NextRequest) {
    try {
        await dbConnect()

        // fetch all in parallel
        const [leads, clients, projects] = await Promise.all([
            Lead.find({ lastInteractionAt: { $ne: null } })
                .select("name status lastInteractionAt lastInteractionId")
                .populate("lastInteractionId")
                .lean(),

            Client.find({ lastInteractionAt: { $ne: null } })
                .select("name company status lastInteractionAt lastInteractionId")
                .populate("lastInteractionId")
                .lean(),

            Project.find({ lastInteractionAt: { $ne: null } })
                .select("title status lastInteractionAt lastInteractionId clientId")
                .populate("lastInteractionId")
                .lean()
        ])

        // normalize structure
        const normalized = [
            ...leads.map((item) => ({
                ...item,
                entityType: ENTITY_TYPE.LEAD,
                lastInteraction: item.lastInteractionId || null
            })),

            ...clients.map((item) => ({ 
                ...item,
                entityType: ENTITY_TYPE.CLIENT,
                lastInteraction: item.lastInteractionId || null
            })),

            ...projects.map((item) => ({
                ...item,
                entityType: ENTITY_TYPE.PROJECT,
                lastInteraction: item.lastInteractionId || null
            }))
        ]

        // sort by latest interaction
        normalized.sort((a, b) => {
            const aTime = a.lastInteractionAt
                ? new Date(a.lastInteractionAt).getTime()
                : 0

            const bTime = b.lastInteractionAt
                ? new Date(b.lastInteractionAt).getTime()
                : 0

            return bTime - aTime
        })

        return NextResponse.json(
            {
                success: true,
                data: normalized
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("Operations API Error:", error)

        return NextResponse.json(
            {
                success: false,
                message: "Failed to fetch operations data"
            },
            { status: 500 }
        )
    }
}