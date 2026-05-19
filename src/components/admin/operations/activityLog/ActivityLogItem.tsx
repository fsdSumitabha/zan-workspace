"use client"

import { useState } from "react"
import { Image } from "@imagekit/next"
import { User, ArrowRight } from "lucide-react"

import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"
import {
    formatActivityValue,
    humanizeFieldName,
} from "./formatActivityValue"
import type { ActivityLogRow } from "./types"

const ENTITY_BADGE: Record<string, string> = {
    USER: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/30",
    LEAD: "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/30",
    CLIENT: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
    PROJECT: "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/30",
    INTERACTION: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30",
    CALL: "bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30",
    MEETING: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/30",
    DOCUMENT: "bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/30",
    QUOTATION: "bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/30",
}

export default function ActivityLogItem({ log }: { log: ActivityLogRow }) {
    const [avatarBroken, setAvatarBroken] = useState(false)
    const avatar = log.user?.avatar?.trim() || ""
    const showAvatar = Boolean(avatar) && !avatarBroken

    const isCreate = log.oldData === null && log.newData !== null
    const isDelete = log.oldData !== null && log.newData === null

    const oldStr = formatActivityValue(log.oldData, log.action, log.entityType)
    const newStr = formatActivityValue(log.newData, log.action, log.entityType)

    const fieldLabel = humanizeFieldName(log.action)
    const entityClass = log.entityType
        ? ENTITY_BADGE[log.entityType] ??
          "bg-neutral-500/10 text-neutral-600 dark:text-neutral-300 border-neutral-500/30"
        : "bg-neutral-500/10 text-neutral-600 dark:text-neutral-300 border-neutral-500/30"

    const verb = isCreate ? "Set" : isDelete ? "Cleared" : "Updated"

    return (
        <article className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 sm:p-4">
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

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        <span>
                            {verb}{" "}
                            <span className="font-medium">{fieldLabel}</span>
                        </span>
                        {log.entityType && (
                            <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${entityClass}`}
                            >
                                {log.entityType}
                            </span>
                        )}
                        {log.entityName ? (
                            <span className="text-neutral-600 dark:text-neutral-400 truncate max-w-full">
                                — {log.entityName}
                            </span>
                        ) : log.entityId ? (
                            <span className="text-neutral-500 dark:text-neutral-500 font-mono text-xs">
                                #{log.entityId.slice(-6)}
                            </span>
                        ) : null}
                    </div>

                    {/* Diff */}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        {!isCreate && (
                            <span
                                className="inline-flex items-center px-2 py-1 rounded-md bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20 max-w-full truncate"
                                title={oldStr}
                            >
                                {oldStr}
                            </span>
                        )}
                        {!isCreate && !isDelete && (
                            <ArrowRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        )}
                        {!isDelete && (
                            <span
                                className="inline-flex items-center px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 max-w-full truncate"
                                title={newStr}
                            >
                                {newStr}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </article>
    )
}
