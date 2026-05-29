import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import dbConnect from "@/lib/db/dbConnect"
import ActivityLog, { IActivityLog } from "@/models/ActivityLog"
import User from "@/models/User"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { EntityType, ENTITY_TYPE } from "@/constants/entityTypes"

const ADMIN_ROLES = [10, 20]
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

type LogRow = {
    _id: string
    entityType: EntityType | null
    entityId: string | null
    entityName: string | null
    action: string | null
    oldData: unknown
    newData: unknown
    user: {
        _id: string
        name?: string
        email?: string
        avatar?: string
        role?: number
    } | null
    createdAt: string
}

const NAME_RESOLVABLE_TYPES = new Set<EntityType>([
    ENTITY_TYPE.USER,
    ENTITY_TYPE.LEAD,
    ENTITY_TYPE.CLIENT,
    ENTITY_TYPE.PROJECT,
])

function parseDate(value: string | null): Date | null {
    if (!value) return null
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
}

function clampLimit(raw: string | null): number {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
    return Math.min(Math.floor(n), MAX_LIMIT)
}

function clampPage(raw: string | null): number {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1) return 1
    return Math.floor(n)
}

async function resolveEntityNames(
    logs: Array<Pick<IActivityLog, "entityType" | "entityId">>
): Promise<Map<string, string>> {
    const byType = new Map<EntityType, Set<string>>()
    for (const log of logs) {
        if (!log.entityType || !log.entityId) continue
        if (!NAME_RESOLVABLE_TYPES.has(log.entityType as EntityType)) continue

        const set =
            byType.get(log.entityType as EntityType) ?? new Set<string>()
        set.add(String(log.entityId))
        byType.set(log.entityType as EntityType, set)
    }

    const result = new Map<string, string>()

    const tasks: Array<Promise<void>> = []
    for (const [type, idSet] of byType.entries()) {
        const ids = [...idSet].map((id) => new mongoose.Types.ObjectId(id))
        tasks.push(
            (async () => {
                switch (type) {
                    case 4: {
                        const docs = await User.find({ _id: { $in: ids } })
                            .select("_id name")
                            .lean()
                        for (const d of docs) {
                            result.set(
                                `USER:${String(d._id)}`,
                                d.name ?? ""
                            )
                        }
                        return
                    }
                    case 0: {
                        const docs = await Lead.find({ _id: { $in: ids } })
                            .select("_id name")
                            .lean()
                        for (const d of docs) {
                            result.set(
                                `LEAD:${String(d._id)}`,
                                d.name ?? ""
                            )
                        }
                        return
                    }
                    case 1: {
                        const docs = await Client.find({ _id: { $in: ids } })
                            .select("_id name company")
                            .lean()
                        for (const d of docs) {
                            const label = d.company
                                ? `${d.name} (${d.company})`
                                : d.name ?? ""
                            result.set(`CLIENT:${String(d._id)}`, label)
                        }
                        return
                    }
                    case 2: {
                        const docs = await Project.find({ _id: { $in: ids } })
                            .select("_id title")
                            .lean()
                        for (const d of docs) {
                            result.set(
                                `PROJECT:${String(d._id)}`,
                                d.title ?? ""
                            )
                        }
                        return
                    }
                }
            })()
        )
    }

    await Promise.all(tasks)
    return result
}

export async function GET(req: NextRequest) {
    try {
        const authUser = await requireAuth(req)
        await dbConnect()

        const isAdmin = ADMIN_ROLES.includes(authUser.role)
        const { searchParams } = new URL(req.url)

        const page = clampPage(searchParams.get("page"))
        const limit = clampLimit(searchParams.get("limit"))

        const entityTypeRaw = searchParams.get("entityType")
        const entityIdRaw = searchParams.get("entityId")
        const userIdRaw = searchParams.get("userId")
        const from = parseDate(searchParams.get("from"))
        const to = parseDate(searchParams.get("to"))
        const q = searchParams.get("q")?.trim()

        const filter: Record<string, unknown> = {}

        // Scope: non-admin users can only see their own activity.
        if (!isAdmin) {
            filter.userId = new mongoose.Types.ObjectId(authUser.id)
        } else if (userIdRaw) {
            if (!mongoose.Types.ObjectId.isValid(userIdRaw)) {
                return NextResponse.json(
                    { success: false, message: "Invalid userId" },
                    { status: 400 }
                )
            }
            filter.userId = new mongoose.Types.ObjectId(userIdRaw)
        }

        if (entityTypeRaw) {
            const entityType = Number(entityTypeRaw) as EntityType
            if (!Object.values(ENTITY_TYPE).includes(entityType)) {
                return NextResponse.json(
                    { success: false, message: "Invalid entityType" },
                    { status: 400 }
                )
            }
            filter.entityType = entityType
        }

        if (entityIdRaw) {
            if (!mongoose.Types.ObjectId.isValid(entityIdRaw)) {
                return NextResponse.json(
                    { success: false, message: "Invalid entityId" },
                    { status: 400 }
                )
            }
            filter.entityId = new mongoose.Types.ObjectId(entityIdRaw)
        }

        if (from || to) {
            const createdAt: Record<string, Date> = {}
            if (from) createdAt.$gte = from
            if (to) createdAt.$lte = to
            filter.createdAt = createdAt
        }

        // Free-text user-name search (admin only). Skip if a specific user
        // is already targeted via userId, since the filter is more specific.
        if (isAdmin && q && !filter.userId) {
            const matchingUsers = await User.find({
                name: { $regex: q, $options: "i" },
            })
                .select("_id")
                .lean()

            if (matchingUsers.length === 0) {
                return NextResponse.json({
                    success: true,
                    data: [],
                    pagination: { page, limit, total: 0, pages: 0 },
                    scope: isAdmin ? "all" : "self",
                })
            }

            filter.userId = {
                $in: matchingUsers.map((u) => u._id),
            }
        }

        const skip = (page - 1) * limit

        const [rawLogs, total] = await Promise.all([
            ActivityLog.find(filter)
                .populate("userId", "name email avatar role")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ActivityLog.countDocuments(filter),
        ])

        const entityNameMap = await resolveEntityNames(rawLogs)

        const data: LogRow[] = rawLogs.map((log) => {
            const populatedUser = log.userId as
                | (typeof log.userId & {
                      _id: mongoose.Types.ObjectId
                      name?: string
                      email?: string
                      avatar?: string
                      role?: number
                  })
                | null
                | undefined

            const entityKey =
                log.entityType && log.entityId
                    ? `${log.entityType}:${String(log.entityId)}`
                    : ""

            return {
                _id: String(log._id),
                entityType: (log.entityType as EntityType) ?? null,
                entityId: log.entityId ? String(log.entityId) : null,
                entityName: entityKey
                    ? entityNameMap.get(entityKey) ?? null
                    : null,
                action: log.action ?? null,
                oldData: log.oldData ?? null,
                newData: log.newData ?? null,
                user:
                    populatedUser &&
                    typeof populatedUser === "object" &&
                    "_id" in populatedUser
                        ? {
                              _id: String(populatedUser._id),
                              name: populatedUser.name,
                              email: populatedUser.email,
                              avatar: populatedUser.avatar,
                              role: populatedUser.role,
                          }
                        : null,
                createdAt: (
                    log as unknown as { createdAt: Date }
                ).createdAt.toISOString(),
            }
        })

        return NextResponse.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
            scope: isAdmin ? "all" : "self",
        })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        console.error("ACTIVITY_LOGS_GET_ERROR:", error)
        return NextResponse.json(
            { success: false, message: "Failed to fetch activity logs" },
            { status: 500 }
        )
    }
}
