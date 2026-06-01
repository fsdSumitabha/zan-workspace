"use client"

import { useState } from "react"
import Link from "next/link"
import { Image } from "@imagekit/next"
import { User, ArrowRight, Plus, Trash2, ExternalLink, Activity } from "lucide-react"

import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import {
    formatActivityValue,
    humanizeFieldName,
    normalizeEntityType,
} from "./formatActivityValue"
import type { ActivityLogRow, InteractionDetail } from "./types"
import { ENTITY_TYPE, ENTITY_TYPE_META, type EntityType } from "@/constants/entityTypes"
import {
    INTERACTION_TYPE,
    INTERACTION_TYPE_META,
} from "@/constants/interactionTypes"
import { LEAD_STATUS_META } from "@/constants/leadStatus"
import { CLIENT_STATUS_META } from "@/constants/clientStatus"
import { PROJECT_STATUS_META } from "@/constants/projectStatus"

/**
 * Detail-page route per entity. Returning null means "no detail page" —
 * the badge stays a plain span. Interactions/Meetings/Calls/etc. don't
 * have a standalone page; clicking them would 404.
 */
function getEntityHref(
    entityType: EntityType | null,
    entityId: string | null
): string | null {
    if (!entityId) return null
    switch (entityType) {
        case ENTITY_TYPE.LEAD:
            return `/admin/operations/leads/${entityId}`
        case ENTITY_TYPE.CLIENT:
            return `/admin/operations/clients/${entityId}`
        case ENTITY_TYPE.PROJECT:
            return `/admin/operations/projects/${entityId}`
        case ENTITY_TYPE.USER:
            return `/admin/operations/users/${entityId}`
        default:
            return null
    }
}

// Keyed by the numeric EntityType code so it matches what the server now
// sends (`log.entityType` is a number, not a string).
const ENTITY_BADGE: Record<number, string> = {
    [ENTITY_TYPE.USER]: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/30",
    [ENTITY_TYPE.LEAD]: "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/30",
    [ENTITY_TYPE.CLIENT]: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
    [ENTITY_TYPE.PROJECT]: "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/30",
    [ENTITY_TYPE.INTERACTION]: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30",
    [ENTITY_TYPE.CALL]: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30",
    [ENTITY_TYPE.MEETING]: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/30",
    [ENTITY_TYPE.DOCUMENT]: "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/30",
    [ENTITY_TYPE.QUOTATION]: "bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/30",
}

const NEUTRAL_BADGE =
    "bg-neutral-500/10 text-neutral-600 dark:text-neutral-300 border-neutral-500/30"

/**
 * Lifecycle marker actions written by the backend. See
 * `src/lib/activity-log/logEntityChanges.ts`.
 */
const ACTION_CREATE = "CREATE"
const ACTION_DELETE = "DELETE"

export default function ActivityLogItem({ log }: { log: ActivityLogRow }) {
    const [avatarBroken, setAvatarBroken] = useState(false)
    const avatar = log.user?.avatar?.trim() || ""
    const showAvatar = Boolean(avatar) && !avatarBroken

    // Prefer explicit markers; fall back to nullness for legacy rows written
    // before the marker convention existed.
    const isCreate =
        log.action === ACTION_CREATE ||
        (log.oldData === null && log.newData !== null && log.action !== ACTION_DELETE)
    const isDelete =
        log.action === ACTION_DELETE ||
        (log.oldData !== null && log.newData === null && log.action !== ACTION_CREATE)
    const isFieldChange = !isCreate && !isDelete

    // The API may send entityType as either the numeric code OR the
    // legacy uppercase string ("LEAD", "CLIENT"). Normalize once and
    // use the numeric form for every lookup below.
    const normalizedType = normalizeEntityType(log.entityType)
    const entityClass =
        normalizedType !== null
            ? ENTITY_BADGE[normalizedType] ?? NEUTRAL_BADGE
            : NEUTRAL_BADGE
    const entityLabel =
        normalizedType !== null
            ? ENTITY_TYPE_META[normalizedType]?.label ?? null
            : null
    const detailHref = getEntityHref(normalizedType, log.entityId)

    // Interaction CREATE rows are side-effects of meaningful actions
    // (status change, note added, meeting scheduled, etc.). The API
    // enriches these rows with the underlying Interaction's `type`,
    // parent entity, and remarks so we can render them properly.
    const isInteractionMarker =
        isCreate && normalizedType === ENTITY_TYPE.INTERACTION
    const interaction = log.interaction ?? null

    return (
        <article className="rounded-lg dark:rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 sm:p-4">
            <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-9 h-9 shrink-0 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 overflow-hidden flex items-center justify-center">
                    {showAvatar ? (
                        <Image
                            src={avatar}
                            alt=""
                            width={36}
                            height={36}
                            transformation={[{ width: 72, height: 72 }]}
                            className="w-full h-full object-cover"
                            onError={() => setAvatarBroken(true)}
                        />
                    ) : (
                        <User size={16} />
                    )}
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {log.user?.name || log.user?.email || "System"}
                        </span>
                        <TimeAgo date={log.createdAt} />
                    </div>

                    {/* Action line */}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        {isInteractionMarker ? (
                            <InteractionLine interaction={interaction} />
                        ) : isCreate ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                <Plus className="w-3 h-3" />
                                Created
                            </span>
                        ) : isDelete ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30">
                                <Trash2 className="w-3 h-3" />
                                Deleted
                            </span>
                        ) : (
                            <span>
                                Updated{" "}
                                <span className="font-medium">
                                    {humanizeFieldName(log.action)}
                                </span>
                            </span>
                        )}

                        {entityLabel && !isInteractionMarker && (
                            detailHref ? (
                                <Link
                                    href={detailHref}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border hover:opacity-80 transition ${entityClass}`}
                                    title={`Open ${entityLabel.toLowerCase()} detail`}
                                >
                                    {entityLabel}
                                    {/* <ExternalLink className="w-2.5 h-2.5" /> */}
                                </Link>
                            ) : (
                                <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${entityClass}`}
                                >
                                    {entityLabel}
                                </span>
                            )
                        )}
                        {!isInteractionMarker && (
                            log.entityName ? (
                                detailHref ? (
                                    <Link
                                        href={detailHref}
                                        className="text-neutral-600 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate max-w-full transition"
                                    >
                                        — {log.entityName}
                                    </Link>
                                ) : (
                                    <span className="text-neutral-600 dark:text-neutral-400 truncate max-w-full">
                                        — {log.entityName}
                                    </span>
                                )
                            ) : log.entityId ? (
                                detailHref ? (
                                    <Link
                                        href={detailHref}
                                        className="text-neutral-500 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 hover:underline font-mono text-xs transition"
                                    >
                                        #{log.entityId.slice(-6)}
                                    </Link>
                                ) : (
                                    <span className="text-neutral-500 dark:text-neutral-500 font-mono text-xs">
                                        #{log.entityId.slice(-6)}
                                    </span>
                                )
                            ) : null
                        )}
                    </div>

                    {/* Interaction sub-block: status transition (for
                        STATUS_CHANGED only) and the user's remarks. */}
                    {isInteractionMarker && interaction && (
                        <InteractionDetailBlock interaction={interaction} />
                    )}

                    {/* Diff (field-change only) — pass the normalized
                        numeric entityType so status numbers map to labels. */}
                    {isFieldChange && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                            <DiffPill
                                tone="old"
                                value={log.oldData}
                                action={log.action}
                                entityType={normalizedType}
                            />
                            <ArrowRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            <DiffPill
                                tone="new"
                                value={log.newData}
                                action={log.action}
                                entityType={normalizedType}
                            />
                        </div>
                    )}
                </div>
            </div>
        </article>
    )
}

/**
 * Renders the single-line summary for an Interaction CREATE row:
 *
 *   [Note added] on [Lead Babugaru ↗]
 *   [Status changed] on [Lead Babugaru ↗]: [Contacted] → [Meeting]
 *   Remarks: "tes"
 *
 * Falls back to a neutral label when the API didn't enrich the row
 * (legacy data, deleted parent, etc.).
 */
function InteractionLine({
    interaction,
}: {
    interaction: InteractionDetail | null
}) {
    if (!interaction) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400 italic">
                <Activity className="w-3 h-3" />
                Logged an activity
            </span>
        )
    }

    const meta =
        INTERACTION_TYPE_META[
            interaction.type as keyof typeof INTERACTION_TYPE_META
        ]
    const interactionLabel = meta?.label ?? "Activity"
    const chipColor =
        meta?.color ??
        "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"

    const parentHref = getInteractionParentHref(
        interaction.parentEntityType,
        interaction.parentEntityId
    )
    const parentLabel =
        interaction.parentEntityType !== null
            ? ENTITY_TYPE_META[interaction.parentEntityType]?.label
            : null

    return (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-300">
            <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${chipColor}`}
            >
                {interactionLabel}
            </span>
            {parentLabel && (
                <>
                    <span className="text-neutral-500">on</span>
                    {parentHref ? (
                        <Link
                            href={parentHref}
                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            {parentLabel}
                            {interaction.parentEntityName ? (
                                <span className="text-neutral-600 dark:text-neutral-400 font-normal">
                                    — {interaction.parentEntityName}
                                </span>
                            ) : null}
                            {/* <ExternalLink className="w-3 h-3" /> */}
                        </Link>
                    ) : (
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                            {parentLabel}
                            {interaction.parentEntityName
                                ? ` — ${interaction.parentEntityName}`
                                : ""}
                        </span>
                    )}
                </>
            )}
        </span>
    )
}

function getInteractionParentHref(
    parentType: EntityType | null,
    parentId: string | null
): string | null {
    if (!parentId) return null
    switch (parentType) {
        case ENTITY_TYPE.LEAD:
            return `/admin/operations/leads/${parentId}`
        case ENTITY_TYPE.CLIENT:
            return `/admin/operations/clients/${parentId}`
        case ENTITY_TYPE.PROJECT:
            return `/admin/operations/projects/${parentId}`
        default:
            return null
    }
}

function statusMetaFor(parentType: EntityType | null, code: number) {
    if (parentType === ENTITY_TYPE.LEAD)
        return LEAD_STATUS_META[code as keyof typeof LEAD_STATUS_META]
    if (parentType === ENTITY_TYPE.CLIENT)
        return CLIENT_STATUS_META[code as keyof typeof CLIENT_STATUS_META]
    if (parentType === ENTITY_TYPE.PROJECT)
        return PROJECT_STATUS_META[code as keyof typeof PROJECT_STATUS_META]
    return null
}

/**
 * STATUS_CHANGED interactions carry the from/to as JSON in their
 * `title`. Decode safely; return null if the shape isn't what we
 * expect so the parent row's own status diff still tells the story.
 */
function parseStatusTitle(
    title: string | null
): { from: number; to: number } | null {
    if (!title) return null
    try {
        const v = JSON.parse(title) as { from?: unknown; to?: unknown }
        if (typeof v.from === "number" && typeof v.to === "number") {
            return { from: v.from, to: v.to }
        }
    } catch {
        // not JSON, that's fine
    }
    return null
}

function InteractionDetailBlock({
    interaction,
}: {
    interaction: InteractionDetail
}) {
    const transition =
        interaction.type === INTERACTION_TYPE.STATUS_CHANGED
            ? parseStatusTitle(interaction.title)
            : null

    const fromMeta = transition
        ? statusMetaFor(interaction.parentEntityType, transition.from)
        : null
    const toMeta = transition
        ? statusMetaFor(interaction.parentEntityType, transition.to)
        : null

    const hasTransition = !!transition
    const hasRemarks = !!interaction.description

    if (!hasTransition && !hasRemarks) return null

    return (
        <div className="mt-2 space-y-1.5">
            {hasTransition && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                            fromMeta?.color ??
                            "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                        }`}
                    >
                        {fromMeta?.label ?? `Status #${transition!.from}`}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                            toMeta?.color ??
                            "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                        }`}
                    >
                        {toMeta?.label ?? `Status #${transition!.to}`}
                    </span>
                </div>
            )}
            {hasRemarks && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    <span className="text-neutral-500">Remarks: </span>
                    {interaction.description}
                </p>
            )}
        </div>
    )
}

function DiffPill({
    tone,
    value,
    action,
    entityType,
}: {
    tone: "old" | "new"
    value: unknown
    action: string | null
    entityType: EntityType | null
}) {
    const text = formatActivityValue(value, action, entityType)
    const cls =
        tone === "old"
            ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"

    return (
        <span
            className={`inline-flex items-center px-2 py-1 rounded-md border max-w-full truncate ${cls}`}
            title={text}
        >
            {text}
        </span>
    )
}
