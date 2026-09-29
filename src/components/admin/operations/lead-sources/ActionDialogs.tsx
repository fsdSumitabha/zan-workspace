"use client"

import { useState } from "react"
import clsx from "clsx"
import { toast } from "sonner"
import {
    LEAD_SOURCE_PICKABLE_STATUSES,
    LEAD_SOURCE_STATUS,
    LEAD_SOURCE_STATUS_META,
    type LeadSourceStatus,
} from "@/constants/leadSourceStatus"
import { formatDay, todayString } from "@/lib/lead-sources/day"
import { LEAD_SOURCES_API, send } from "./api"
import AssigneeSelect from "./AssigneeSelect"
import DayChoice from "./DayChoice"
import Dialog, { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_QUIET, FIELD } from "./Dialog"

/**
 * The dialogs behind the bulk bar. The details page uses the same ones with
 * a single id. All of them post to /lead-sources/bulk.
 */

interface BulkResult {
    updated: number
    unchanged: number
    skipped: number
}

interface CommonProps {
    open: boolean
    onClose: () => void
    ids: string[]
    /** Called after the change is saved, to reload the list. */
    onDone: () => void
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? "" : "s"}`
}

function reportResult(result: BulkResult, verb: string): void {
    const parts = [`${plural(result.updated, "lead source")} ${verb}`]
    if (result.unchanged) parts.push(`${result.unchanged} already set`)
    if (result.skipped) parts.push(`${result.skipped} skipped`)
    toast.success(parts.join(". ") + ".")
}

async function runBulk(body: Record<string, unknown>): Promise<BulkResult> {
    return send<BulkResult>(`${LEAD_SOURCES_API}/bulk`, "POST", { ...body, today: todayString() })
}

export function AssignDialog({ open, onClose, ids, onDone, regions }: CommonProps & { regions: string[] }) {
    const [userId, setUserId] = useState("")
    const [saving, setSaving] = useState(false)

    const save = async () => {
        setSaving(true)
        try {
            const result = await runBulk({ action: "assign", ids, assignedTo: userId || null })
            reportResult(result, userId ? "assigned" : "unassigned")
            onDone()
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to assign")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={`Assign ${plural(ids.length, "lead source")}`}
            description={
                regions.length > 1
                    ? `These are in ${regions.join(" and ")}. Only people who cover all of them are listed.`
                    : "Only people with a lead source role in this region are listed."
            }
            footer={
                <>
                    <button type="button" onClick={onClose} className={BUTTON_QUIET}>Cancel</button>
                    <button type="button" onClick={save} disabled={saving} className={BUTTON_PRIMARY}>
                        {saving ? "Saving..." : userId ? "Assign" : "Remove assignee"}
                    </button>
                </>
            }
        >
            <label htmlFor="bulk-assignee" className="block text-sm text-neutral-600 dark:text-neutral-300">
                Assign to
            </label>
            <AssigneeSelect id="bulk-assignee" regions={regions} value={userId} onChange={setUserId} noneLabel="Nobody (unassign)" />
        </Dialog>
    )
}

export function DayDialog({ open, onClose, ids, onDone }: CommonProps) {
    const [day, setDay] = useState<string | null>(todayString())
    const [saving, setSaving] = useState(false)

    const save = async () => {
        setSaving(true)
        try {
            const result = await runBulk({ action: "day", ids, day })
            reportResult(result, day ? `moved to ${formatDay(day)}` : "left without a day")
            onDone()
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to set the day")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={`Set the day for ${plural(ids.length, "lead source")}`}
            description="Any callback time on them is cleared, because the day changes."
            footer={
                <>
                    <button type="button" onClick={onClose} className={BUTTON_QUIET}>Cancel</button>
                    <button type="button" onClick={save} disabled={saving} className={BUTTON_PRIMARY}>
                        {saving ? "Saving..." : "Set day"}
                    </button>
                </>
            }
        >
            <DayChoice value={day} onChange={setDay} />
        </Dialog>
    )
}

export function StatusDialog({ open, onClose, ids, onDone }: CommonProps) {
    const [status, setStatus] = useState<LeadSourceStatus>(LEAD_SOURCE_STATUS.NOT_REACHED)
    const [note, setNote] = useState("")
    const [saving, setSaving] = useState(false)

    // Call Back needs its own time on each source, so it is set one at a time.
    const choices = LEAD_SOURCE_PICKABLE_STATUSES.filter((s) => s !== LEAD_SOURCE_STATUS.CALL_BACK)

    const save = async () => {
        setSaving(true)
        try {
            const result = await runBulk({ action: "status", ids, status, note: note.trim() || undefined })
            reportResult(result, `marked ${LEAD_SOURCE_STATUS_META[status].label}`)
            onDone()
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to set the status")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={`Set the status of ${plural(ids.length, "lead source")}`}
            description="To set Call Back, open each one, so each gets its own time."
            footer={
                <>
                    <button type="button" onClick={onClose} className={BUTTON_QUIET}>Cancel</button>
                    <button type="button" onClick={save} disabled={saving} className={BUTTON_PRIMARY}>
                        {saving ? "Saving..." : "Save"}
                    </button>
                </>
            }
        >
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Status">
                {choices.map((s) => (
                    <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={status === s}
                        onClick={() => setStatus(s)}
                        className={clsx(
                            "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
                            status === s
                                ? "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100"
                                : "border-slate-200 text-neutral-700 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        )}
                    >
                        <span className={clsx("h-2.5 w-2.5 rounded-full", LEAD_SOURCE_STATUS_META[s].dot)} />
                        {LEAD_SOURCE_STATUS_META[s].label}
                    </button>
                ))}
            </div>
            <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Note for all of them (optional)"
                className={clsx(FIELD, "resize-none")}
            />
        </Dialog>
    )
}

export function DeleteDialog({ open, onClose, ids, onDone }: CommonProps) {
    const [saving, setSaving] = useState(false)

    const save = async () => {
        setSaving(true)
        try {
            const result = await runBulk({ action: "delete", ids })
            reportResult(result, "deleted")
            onDone()
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete")
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={`Delete ${plural(ids.length, "lead source")}?`}
            description="They disappear from every list. Their numbers can be uploaded again later. The upload reports still show them."
            footer={
                <>
                    <button type="button" onClick={onClose} className={BUTTON_QUIET}>Cancel</button>
                    <button type="button" onClick={save} disabled={saving} className={BUTTON_DANGER}>
                        {saving ? "Deleting..." : "Delete"}
                    </button>
                </>
            }
        >
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Converted leads are not touched. Only the lead source rows are deleted.
            </p>
        </Dialog>
    )
}
