"use client"

import Link from "next/link"
import { FileUp, Plus, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Lead } from "@/types/lead"
import { LEAD_STATUS_META } from "@/constants/leadStatus"
import LeadCard from "@/components/admin/operations/LeadCard"
import LeadCardSkeleton from "@/components/admin/operations/skeletons/LeadCardSkeleton"
import ListFilters from "@/components/admin/operations/ListFilters"
import CreateActionButton from "@/components/admin/operations/CreateActionButton"
import Pagination from "@/components/admin/operations/Pagination"
import AccessDenied from "@/components/admin/operations/AccessDenied"
import { usePagination } from "@/hooks/usePagination"
import { useSearch } from "@/hooks/useSearch"
import { handleAuthError } from "@/lib/auth/handleAuthError"
import { useAuth } from "@/contexts/AuthContext"
import { canImportLeads } from "@/constants/adTrackingRoles"

interface ApiResponse {
    success: boolean
    data: Lead[]
    message?: string
    pagination: {
        page: number
        limit: number
        total: number
        pages: number
    }
}

const PAGE_SIZE = 10

export default function LeadsClient() {
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [total, setTotal] = useState(0)
    const [totalPages, setTotalPages] = useState(1)
    const [accessError, setAccessError] = useState<string | null>(null)
    const router = useRouter()
    const { page, setPage } = usePagination()
    const search = useSearch()

    const searchParams = useSearchParams()
    const status = searchParams.get("status") || ""
    const from = searchParams.get("from") || ""
    const to = searchParams.get("to") || ""
    // The leads of one sheet import. The import notification links here.
    const importId = searchParams.get("import") || ""
    const { user } = useAuth()

    const fetchLeads = useCallback(async () => {
        try {
            setLoading(true)
            setAccessError(null)

            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            })
            if (search) params.set("search", search)
            if (status) params.set("status", status)
            if (from) params.set("from", from)
            if (to) params.set("to", to)
            if (importId) params.set("import", importId)

            const res = await fetch(
                `/api/admin/operations/leads?${params.toString()}`
            )

            const json: ApiResponse = await res.json()

            if (
                handleAuthError(res, json, router, (msg) => {
                    setAccessError(msg)
                    setLeads([])
                    setTotal(0)
                })
            ) {
                return
            }

            if (json.success) {
                setLeads(json.data)
                setTotalPages(json.pagination?.pages ?? 1)
                setTotal(json.pagination?.total ?? 0)
            }
        } catch (error) {
            console.error("Failed to fetch leads", error)
        } finally {
            setLoading(false)
        }
    }, [page, search, status, from, to, importId, router])

    useEffect(() => {
        fetchLeads()
    }, [fetchLeads])

    if (!loading && accessError) {
        return <AccessDenied message={accessError} />
    }

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                    <CreateActionButton href="leads/create" label="Create New Lead" />
                </div>
                {canImportLeads(user?.role) && (
                    <Link
                        href="/admin/operations/ad-tracking/import"
                        title="Import a sheet of leads, such as a Meta leads export"
                        className="flex shrink-0 items-center gap-2 rounded border border-gray-200 bg-white px-4 py-3 font-medium text-gray-800 shadow-sm transition hover:border-blue-500/50 hover:bg-blue-50/60 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-100 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10"
                    >
                        <FileUp size={16} className="text-blue-600 dark:text-blue-400" />
                        <span className="hidden sm:inline">Import leads</span>
                    </Link>
                )}
            </div>

            {importId && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                    <span>Showing the leads of one import.</span>
                    <Link
                        href="/admin/operations/leads"
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-500/20"
                    >
                        <X className="h-3.5 w-3.5" />
                        Show all leads
                    </Link>
                </div>
            )}

            <ListFilters statusMeta={LEAD_STATUS_META} />

            {!loading && !accessError && (
                <div className="text-sm text-gray-500">
                    {total} {total === 1 ? "lead" : "leads"} found
                </div>
            )}

            {loading && (
                <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <LeadCardSkeleton key={i} />
                    ))}
                </div>
            )}

            {!loading && leads.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                    No leads found
                </div>
            )}

            {!loading &&
                leads.map((lead) => (
                    <LeadCard
                        key={lead._id}
                        id={lead._id}
                        name={lead.name}
                        email={lead.email}
                        phone={lead.phone}
                        source={lead.source}
                        createdAt={lead.createdAt}
                        status={lead.status}
                        createdBy={lead.createdBy}
                    />
                ))}

            {!loading && (
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    disabled={loading}
                    onChange={setPage}
                />
            )}

            <Link
                href={"leads/create"}
                className="
                    fixed bottom-6 right-6
                    h-14 w-14 rounded-full
                    bg-blue-600 hover:bg-blue-500
                    text-white
                    flex items-center justify-center
                    shadow-lg hover:shadow-xl
                    transition
                "
            >
                <Plus size={22} />
            </Link>
        </div>
    )
}