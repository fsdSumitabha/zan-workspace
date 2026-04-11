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
                .select("name email phone status source lastInteractionAt lastInteractionId")
                .populate({
                    path: "lastInteractionId",
                    select: "type title createdAt"
                })
                .lean(),
        
            Client.find({ lastInteractionAt: { $ne: null } })
                .select("name company phone email status lastInteractionAt lastInteractionId")
                .populate({
                    path: "lastInteractionId",
                    select: "type title createdAt"
                })
                .lean(),
        
            Project.find({ lastInteractionAt: { $ne: null } })
                .select("title companyName serviceType description status lastInteractionAt lastInteractionId clientId")
                .populate({
                    path: "lastInteractionId",
                    select: "type title createdAt"
                })
                .lean()
        ])

        // normalize structure
        const normalized = [
            ...leads.map(item => {
                const { lastInteractionId, ...rest } = item
        
                return {
                    _id: rest._id,
                    entityType: ENTITY_TYPE.LEAD,
                    displayName: rest.name,
                    phone: rest.phone,
                    email: rest.email,
                    source: rest.source,
                    status: rest.status,
                    lastInteractionAt: rest.lastInteractionAt,
                    lastInteraction: lastInteractionId || null
                }
            }),
        
            ...clients.map(item => {
                const { lastInteractionId, ...rest } = item
        
                return {
                    _id: rest._id,
                    entityType: ENTITY_TYPE.CLIENT,
                    displayName: `${rest.name}${rest.company ? ` (${rest.company})` : ""}`,
                    phone: rest.phone,
                    email: rest.email,
                    status: rest.status,
                    lastInteractionAt: rest.lastInteractionAt,
                    lastInteraction: lastInteractionId || null
                }
            }),
        
            ...projects.map(item => {
                const { lastInteractionId, ...rest } = item
        
                return {
                    _id: rest._id,
                    entityType: ENTITY_TYPE.PROJECT,
                    displayName: rest.title,
                    companyName: rest.companyName,
                    serviceType: rest.serviceType,
                    description: rest.description,
                    status: rest.status,
                    lastInteractionAt: rest.lastInteractionAt,
                    lastInteraction: lastInteractionId || null
                }
            })
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