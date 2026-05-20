import { NextRequest, NextResponse } from "next/server"

import dbConnect from "@/lib/db/dbConnect"
import Lead from "@/models/Lead"
import Client from "@/models/Client"
import Project from "@/models/Project"
import Meeting from "@/models/Meeting"
import User from "@/models/User"

import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import { escapeRegex } from "@/lib/search/escapeRegex"

/**
 * Unified global search.
 *
 * Used by the operations dashboard search bar. Per-entity list pages
 * keep using their own `?search=` filter. This endpoint runs the same
 * field regex against all five entities in parallel and returns
 * normalized rows the frontend can render with one component.
 */

const MIN_QUERY_LEN = 2
const MAX_QUERY_LEN = 100
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20

type EntityType = "LEAD" | "CLIENT" | "PROJECT" | "MEETING" | "USER"

interface SearchHit {
    id: string
    type: EntityType
    title: string
    subtitle?: string
    href: string
}

interface EmptyResult {
    leads: SearchHit[]
    clients: SearchHit[]
    projects: SearchHit[]
    meetings: SearchHit[]
    users: SearchHit[]
    total: 0
}

function emptyResult(): EmptyResult {
    return {
        leads: [],
        clients: [],
        projects: [],
        meetings: [],
        users: [],
        total: 0,
    }
}

export async function GET(req: NextRequest) {
    try {
        await requireAuth(req)

        const { searchParams } = new URL(req.url)
        const raw = (searchParams.get("search") || "").trim()

        const limitParam = Number(searchParams.get("limit")) || DEFAULT_LIMIT
        const limit = Math.min(Math.max(limitParam, 1), MAX_LIMIT)

        // Short or empty query → skip the DB roundtrip.
        if (raw.length < MIN_QUERY_LEN) {
            return NextResponse.json({
                success: true,
                data: emptyResult(),
            })
        }

        await dbConnect()

        const term = raw.slice(0, MAX_QUERY_LEN)
        const re = { $regex: escapeRegex(term), $options: "i" }

        // Phone search: also try the digits-only form so "+91 98…"
        // matches stored values like "9198…".
        const digitsOnly = term.replace(/\D/g, "")
        const phoneRe =
            digitsOnly.length >= 4
                ? { $regex: escapeRegex(digitsOnly), $options: "i" }
                : null

        const leadOr: Record<string, unknown>[] = [
            { name: re },
            { email: re },
            { phone: re },
        ]
        if (phoneRe) leadOr.push({ phone: phoneRe })

        const clientOr: Record<string, unknown>[] = [
            { name: re },
            { company: re },
            { email: re },
            { phone: re },
        ]
        if (phoneRe) clientOr.push({ phone: phoneRe })

        const [leads, clients, projects, meetings, users] = await Promise.all([
            Lead.find({ $or: leadOr })
                .sort({ createdAt: -1 })
                .limit(limit)
                .select("_id name email phone status")
                .lean(),
            Client.find({ $or: clientOr })
                .sort({ createdAt: -1 })
                .limit(limit)
                .select("_id name company email phone status")
                .lean(),
            Project.find({
                $or: [
                    { title: re },
                    { companyName: re },
                    { description: re },
                ],
            })
                .sort({ createdAt: -1 })
                .limit(limit)
                .select("_id title companyName status")
                .lean(),
            Meeting.find({
                $or: [{ title: re }, { agenda: re }, { description: re }],
            })
                .sort({ scheduledAt: -1 })
                .limit(limit)
                .select("_id title agenda scheduledAt status")
                .lean(),
            User.find({ $or: [{ name: re }, { email: re }] })
                .sort({ createdAt: -1 })
                .limit(limit)
                .select("_id name email role isActive")
                .lean(),
        ])

        const data = {
            leads: leads.map(
                (l): SearchHit => ({
                    id: String(l._id),
                    type: "LEAD",
                    title: l.name,
                    subtitle: l.email || l.phone,
                    href: `/admin/operations/leads/${String(l._id)}`,
                })
            ),
            clients: clients.map(
                (c): SearchHit => ({
                    id: String(c._id),
                    type: "CLIENT",
                    title: c.name,
                    subtitle: c.company,
                    href: `/admin/operations/clients/${String(c._id)}`,
                })
            ),
            projects: projects.map((p): SearchHit => {
                const doc = p as {
                    _id: unknown
                    title: string
                    companyName?: string
                }
                return {
                    id: String(doc._id),
                    type: "PROJECT",
                    title: doc.title,
                    subtitle: doc.companyName,
                    href: `/admin/operations/projects/${String(doc._id)}`,
                }
            }),
            meetings: meetings.map((m): SearchHit => {
                const doc = m as {
                    _id: unknown
                    title: string
                    agenda?: string
                    scheduledAt?: Date
                }
                const when = doc.scheduledAt
                    ? new Date(doc.scheduledAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                      })
                    : undefined
                return {
                    id: String(doc._id),
                    type: "MEETING",
                    title: doc.title,
                    subtitle: when ?? doc.agenda,
                    // No dedicated meeting detail page yet — link to the list.
                    href: `/admin/operations/meetings`,
                }
            }),
            users: users.map((u): SearchHit => {
                const doc = u as {
                    _id: unknown
                    name: string
                    email: string
                }
                return {
                    id: String(doc._id),
                    type: "USER",
                    title: doc.name,
                    subtitle: doc.email,
                    // No user detail page — link to the list.
                    href: `/admin/operations/users`,
                }
            }),
            total: 0,
        }

        data.total =
            data.leads.length +
            data.clients.length +
            data.projects.length +
            data.meetings.length +
            data.users.length

        return NextResponse.json({ success: true, data })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        console.error("SEARCH_ERROR:", error)
        return NextResponse.json(
            { success: false, message: "Search failed" },
            { status: 500 }
        )
    }
}
