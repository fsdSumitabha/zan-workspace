import { NextResponse } from "next/server";
import dbConnect from "@/lib/db/dbConnect";
import Project from "@/models/Project";
import Interaction from "@/models/Interaction";
import { ENTITY_TYPE } from "@/constants/entityTypes";

export async function GET() {
    try {
        await dbConnect();

        const projects = await Project.find({});
        if (!projects.length) {
            return NextResponse.json(
                { success: false, message: "No projects found" },
                { status: 404 }
            );
        }

        let updatedCount = 0;
        for (const project of projects) {
            const latestInteraction = await Interaction.findOne({
                entityType: ENTITY_TYPE.PROJECT,
                entityId: project._id,
            }).sort({ createdAt: -1 });

            if (latestInteraction) {
                project.lastInteractionAt = latestInteraction.createdAt;
                project.lastInteractionId = latestInteraction._id;
                await project.save();
                updatedCount++;
            }
        }

        return NextResponse.json(
            {
                success: true,
                message: "Backfill complete",
                totalProjects: projects.length,
                updatedProjects: updatedCount,
            },
            { status: 200 }
        );
    } catch (error: any) {
        console.error("Backfill error:", error);
        return NextResponse.json(
            {
                success: false,
                message: "Internal server error during backfill",
                error: error.message,
            },
            { status: 500 }
        );
    }
}