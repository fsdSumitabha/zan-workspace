"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    FileSpreadsheet,
    Mail,
    Trash2,
    TriangleAlert,
    UserRoundPlus,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { canConvertLeadSources, canManageLeadSources } from "@/constants/leadSourceRoles"
import { LEAD_SOURCE_STATUS } from "@/constants/leadSourceStatus"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import { formatDay, todayString } from "@/lib/lead-sources/day"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import WhatsAppLink from "@/components/admin/operations/button/WhatsAppLink"
import { RegionBadge } from "@/components/admin/operations/region/RegionBadge"
import type { LeadSourceDetail, LeadSourceRow } from "@/types/leadSource"
import { LEAD_SOURCES_API, LEAD_SOURCES_PAGE, send } from "@/components/admin/operations/lead-sources/api"
import { AssignDialog, DayDialog, DeleteDialog } from "@/components/admin/operations/lead-sources/ActionDialogs"
import ActivityTimeline from "@/components/admin/operations/lead-sources/ActivityTimeline"
import CallbackMenu from "@/components/admin/operations/lead-sources/CallbackMenu"
import CallButton from "@/components/admin/operations/lead-sources/CallButton"
import Dialog, { BUTTON_PRIMARY, BUTTON_QUIET } from "@/components/admin/operations/lead-sources/Dialog"
import NoteBox from "@/components/admin/operations/lead-sources/NoteBox"
import SheetData from "@/components/admin/operations/lead-sources/SheetData"
import StatusMenu from "@/components/admin/operations/lead-sources/StatusMenu"
import { useNow } from "@/components/admin/operations/lead-sources/useNow"

const CARD = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5"
const CARD_TITLE = "mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100"

type Panel = "assign" | "day" | "delete" | "convert" | null

export default function LeadSourceDetailPage() {
    const params = useParams()
    const sourceId = params.sourceId as string
    const router = useRouter()
    const { role } = useAuth()
    const isManager = canManageLeadSources(role)
    const canConvert = canConvertLeadSources(role)
    const now = useNow(15_000)

    const [source, setSource] = useState<LeadSourceDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [accessError, setAccessError] = useState<string | null>(null)
    const [panel, setPanel] = useState<Panel>(null)
    const [converting, setConverting] = useState(false)

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${LEAD_SOURCES_API}/${sourceId}`, { cache: "no-store" })
            const json = await res.json().catch(() => null)
            if (handleAuthError(res, json, router, setAccessError)) return
            setSource(json?.success ? json.data : null)
        } catch {
            toast.error("Failed to load the lead source")
        } finally {
            setLoading(false)
        }
    }, [sourceId, router])

    useEffect(() => {
        load()
    }, [load])

    // A change from a menu answers with the list row. Put what it changed on
    // screen at once, then reload for the new timeline entry.
    const onUpdated = (row: LeadSourceRow) => {
        setSource((prev) => (prev ? { ...prev, ...row } : prev))
        load()
    }

    const convert = async () => {
        setConverting(true)
        try {
            const { leadId } = await send<{ leadId: string }>(`${LEAD_SOURCES_API}/${sourceId}/convert`, "POST", {})
            toast.success("Lead created")
            router.push(`/admin/operations/leads/${leadId}`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to convert")
            setConverting(false)
            setPanel(null)
        }
    }

    if (!loading && accessError) return <AccessDenied message={accessError} />

    if (loading) {
        return (
            <div className="w-0 min-w-full space-y-3">
                <div className={`${CARD} h-44 animate-pulse`} />
                <div className={`${CARD} h-28 animate-pulse`} />
                <div className={`${CARD} h-56 animate-pulse`} />
            </div>
        )
    }

    if (!source) {
        return (
            <div className="w-0 min-w-full space-y-3">
                <BackLink />
                <div className={`${CARD} py-12 text-center`}>
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Lead source not found</p>
                    <p className="mt-1 text-sm text-neutral-500">It may have been deleted, or it is assigned to someone else.</p>
                </div>
            </div>
        )
    }

    const converted = source.status === LEAD_SOURCE_STATUS.CONVERTED
    const today = todayString()

    return (
        <div className="w-0 min-w-full space-y-3 pb-10">
            <BackLink />

            {/* Header */}
            <div className={CARD}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="break-words text-xl font-semibold text-neutral-900 dark:text-neutral-100">{source.name}</h1>
                        {source.listInfo.length > 0 && (
                            <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{source.listInfo.join(" · ")}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusMenu sourceId={source._id} name={source.name} status={source.status} onUpdated={onUpdated} size="md" />
                        {!converted && <CallButton name={source.name} phone={source.phone} size="md" />}
                    </div>
                </div>

                {!converted && (
                    <div className="mt-3">
                        <CallbackMenu
                            sourceId={source._id}
                            name={source.name}
                            callbackAt={source.callbackAt}
                            now={now}
                            onUpdated={onUpdated}
                            variant="button"
                        />
                    </div>
                )}

                <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm dark:border-neutral-800 sm:grid-cols-2">
                    <div>
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Phone</p>
                        <WhatsAppLink phone={source.phone} />
                    </div>
                    <div>
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Email</p>
                        {source.email ? (
                            <a href={`mailto:${source.email}`} className="inline-flex items-center gap-1.5 break-all text-blue-600 hover:underline dark:text-blue-400">
                                <Mail className="h-4 w-4 shrink-0" />
                                {source.email}
                            </a>
                        ) : (
                            <span className="text-neutral-400">None</span>
                        )}
                    </div>
                    <div>
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Assigned to</p>
                        <p className="text-neutral-900 dark:text-neutral-100">{source.assignee?.name || "Nobody yet"}</p>
                    </div>
                    <div>
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">Day</p>
                        <p className="text-neutral-900 dark:text-neutral-100">
                            {source.allottedDay ? formatDay(source.allottedDay, today) : "No day"}
                            {source.allottedDay && source.allottedDay < today && !converted && (
                                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                                    left over
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                        <RegionBadge code={source.region} />
                        {source.upload && (
                            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                                {isManager ? (
                                    <Link href={`${LEAD_SOURCES_PAGE}/uploads/${source.upload._id}`} className="truncate hover:underline">
                                        {source.upload.fileName}
                                        {source.rowNumber ? `, row ${source.rowNumber}` : ""}
                                    </Link>
                                ) : (
                                    <span className="truncate">
                                        {source.upload.fileName}
                                        {source.rowNumber ? `, row ${source.rowNumber}` : ""}
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                </div>

                {(isManager || (canConvert && !converted)) && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-neutral-800">
                        {isManager && (
                            <>
                                <button type="button" onClick={() => setPanel("assign")} className={BUTTON_QUIET}>
                                    <UserRoundPlus className="h-4 w-4" />
                                    Assign
                                </button>
                                <button type="button" onClick={() => setPanel("day")} className={BUTTON_QUIET}>
                                    <CalendarDays className="h-4 w-4" />
                                    Set day
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPanel("delete")}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                </button>
                            </>
                        )}
                        {canConvert && !converted && (
                            <button type="button" onClick={() => setPanel("convert")} className={`${BUTTON_PRIMARY} ml-auto`}>
                                Convert to lead
                                <ArrowRight className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Converted */}
            {source.convertedLead && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-500/30 dark:bg-blue-500/10">
                    <p className="text-sm text-blue-900 dark:text-blue-100">
                        This source is now a lead. Keep working on it there.
                    </p>
                    <Link
                        href={`/admin/operations/leads/${source.convertedLead._id}`}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300"
                    >
                        Open {source.convertedLead.name}
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            )}

            {/* Note */}
            {!converted && (
                <div className={CARD}>
                    <h2 className={CARD_TITLE}>Add a note</h2>
                    <NoteBox sourceId={source._id} onAdded={onUpdated} />
                </div>
            )}

            {/* Upload warnings */}
            {source.importNotes.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
                        <TriangleAlert className="h-4 w-4" />
                        Notes from the upload check
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-900 dark:text-amber-100">
                        {source.importNotes.map((n) => (
                            <li key={n}>{n}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Sheet data */}
            <div className={CARD}>
                <h2 className={CARD_TITLE}>From the sheet</h2>
                <SheetData data={source.data} />
            </div>

            {/* Timeline */}
            <div className={CARD}>
                <h2 className={CARD_TITLE}>Activity</h2>
                <ActivityTimeline items={source.activity} />
            </div>

            {panel === "assign" && (
                <AssignDialog open onClose={() => setPanel(null)} ids={[source._id]} regions={[source.region]} onDone={load} />
            )}
            {panel === "day" && <DayDialog open onClose={() => setPanel(null)} ids={[source._id]} onDone={load} />}
            {panel === "delete" && (
                <DeleteDialog
                    open
                    onClose={() => setPanel(null)}
                    ids={[source._id]}
                    onDone={() => router.push(LEAD_SOURCES_PAGE)}
                />
            )}
            {panel === "convert" && (
                <Dialog
                    open
                    onClose={() => !converting && setPanel(null)}
                    title={`Convert ${source.name} to a lead?`}
                    description="A new lead is created in the Leads list, in this region."
                    footer={
                        <>
                            <button type="button" onClick={() => setPanel(null)} disabled={converting} className={BUTTON_QUIET}>
                                Cancel
                            </button>
                            <button type="button" onClick={convert} disabled={converting} className={BUTTON_PRIMARY}>
                                {converting ? "Creating..." : "Create lead"}
                            </button>
                        </>
                    }
                >
                    <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
                        <li>The lead gets the name, phone, email and region.</li>
                        <li>It is assigned to {source.assignee?.name || "you"}.</li>
                        <li>Everything else from the sheet, and every note from the calls, goes into its first note.</li>
                        <li>This source is then marked Converted and closed.</li>
                    </ul>
                </Dialog>
            )}
        </div>
    )
}

function BackLink() {
    return (
        <Link
            href={LEAD_SOURCES_PAGE}
            className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
            <ArrowLeft className="h-4 w-4" />
            Lead sources
        </Link>
    )
}
