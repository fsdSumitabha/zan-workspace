"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Search, Check } from "lucide-react"

interface UserOption {
    _id: string
    name: string
    email?: string
    role?: number
    avatar?: string
}

interface UsersPickerResponse {
    success: boolean
    data?: UserOption[]
}

interface Props {
    entityId: string
    entityType?: number
    onClose: () => void
    onSuccess?: () => void
}

export default function MeetingForm({
    entityType,
    entityId,
    onClose,
    onSuccess,
}: Props) {
    const [title, setTitle] = useState("")
    const [agenda, setAgenda] = useState("")
    const [description, setDescription] = useState("")
    const [date, setDate] = useState("")
    const [status, setStatus] = useState(2010) // MEETING_STATUS.SCHEDULED
    const [meetingType, setMeetingType] = useState(0) // ONLINE
    const [meetingLink, setMeetingLink] = useState("")
    const [loading, setLoading] = useState(false)

    // Attendees: load all active users once on mount and let the user
    // toggle checkboxes inline (with a small client-side search).
    const [allUsers, setAllUsers] = useState<UserOption[]>([])
    const [usersLoading, setUsersLoading] = useState(true)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [query, setQuery] = useState("")

    useEffect(() => {
        let cancelled = false
        fetch("/api/admin/operations/users/picker", {
            credentials: "include",
            cache: "no-store",
        })
            .then((r) => r.json() as Promise<UsersPickerResponse>)
            .then((json) => {
                if (cancelled) return
                if (json.success && Array.isArray(json.data)) {
                    setAllUsers(json.data)
                }
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setUsersLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const filteredUsers = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return allUsers
        return allUsers.filter(
            (u) =>
                u.name.toLowerCase().includes(q) ||
                (u.email?.toLowerCase().includes(q) ?? false)
        )
    }, [allUsers, query])

    const toggleAttendee = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        const promise = fetch("/api/admin/operations/meetings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entityType,
                entityId,
                title,
                agenda,
                description,
                meetingType,
                meetingLink,
                status,
                scheduledAt: date,
                attendees: [...selectedIds],
            }),
        }).then(async (res) => {
            const data = await res.json()
            if (!res.ok || !data.success) {
                throw new Error(data.message || "Failed to schedule meeting")
            }
            return data
        })

        toast.promise(promise, {
            loading: "Scheduling meeting...",
            success: () => {
                onSuccess?.()
                onClose()
                return "Meeting scheduled successfully"
            },
            error: (err) => err.message || "Something went wrong",
        })

        try {
            await promise
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-lg text-neutral-800 dark:text-neutral-200 font-semibold">
                Schedule Meeting
            </h2>

            {/* Title */}
            <div className="space-y-2">
                <label className="text-sm text-neutral-800 dark:text-neutral-200">
                    Title
                </label>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    placeholder="e.g. Discovery Call"
                />
            </div>

            {/* Agenda */}
            <div className="space-y-2">
                <label className="text-sm text-neutral-800 dark:text-neutral-200">
                    Agenda
                </label>
                <input
                    value={agenda}
                    onChange={(e) => setAgenda(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    placeholder="Purpose of the meeting"
                />
            </div>

            {/* Date */}
            <div className="space-y-2">
                <label className="text-sm text-neutral-800 dark:text-neutral-200">
                    Meeting Date & Time
                </label>
                <input
                    type="datetime-local"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                />
            </div>

            {/* Meeting Type */}
            <div className="space-y-2">
                <label className="text-sm text-neutral-800 dark:text-neutral-200">
                    Meeting Type
                </label>
                <select
                    value={meetingType}
                    onChange={(e) => setMeetingType(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                >
                    <option value={0}>Online</option>
                    <option value={1}>Offline</option>
                </select>
            </div>

            {/* Meeting Link (only for online) */}
            {meetingType === 0 && (
                <div className="space-y-2">
                    <label className="text-sm text-neutral-800 dark:text-neutral-200">
                        Meeting Link
                    </label>
                    <input
                        value={meetingLink}
                        onChange={(e) => setMeetingLink(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                        placeholder="https://..."
                    />
                </div>
            )}

            {/* Attendees — inline checkbox list, always visible */}
            <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                    <label className="text-sm text-neutral-800 dark:text-neutral-200">
                        Attendees
                    </label>
                    <span className="text-xs text-neutral-500">
                        {selectedIds.size} selected
                    </span>
                </div>

                {/* Search filter — only show when there are enough users to scroll */}
                {allUsers.length > 6 && (
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Filter by name or email…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 focus:outline-none"
                        />
                    </div>
                )}

                {/* Scrollable checkbox list */}
                <div className="max-h-56 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/40 divide-y divide-neutral-100 dark:divide-neutral-800">
                    {usersLoading && (
                        <div className="px-3 py-3 text-sm text-neutral-500">
                            Loading users…
                        </div>
                    )}
                    {!usersLoading && filteredUsers.length === 0 && (
                        <div className="px-3 py-3 text-sm text-neutral-500">
                            {query ? "No matches" : "No users available"}
                        </div>
                    )}
                    {!usersLoading &&
                        filteredUsers.map((u) => {
                            const checked = selectedIds.has(u._id)
                            return (
                                <label
                                    key={u._id}
                                    className={`group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition ${
                                        checked
                                            ? "bg-blue-50 dark:bg-blue-500/10"
                                            : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                                    }`}
                                >
                                    <UserAvatar
                                        name={u.name}
                                        avatar={u.avatar}
                                    />

                                    <div className="flex-1 min-w-0">
                                        <div
                                            className={`text-[15px] truncate ${
                                                checked
                                                    ? "text-blue-700 dark:text-blue-300 font-semibold"
                                                    : "text-neutral-800 dark:text-neutral-200 font-medium"
                                            }`}
                                        >
                                            {u.name}
                                        </div>
                                        {u.email && (
                                            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                                                {u.email}
                                            </div>
                                        )}
                                    </div>

                                    {/* Custom check pill, right-aligned */}
                                    <span className="relative shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                                toggleAttendee(u._id)
                                            }
                                            className="peer sr-only"
                                        />
                                        <span
                                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 peer-focus-visible:ring-offset-1 dark:peer-focus-visible:ring-offset-neutral-900 ${
                                                checked
                                                    ? "bg-blue-500 border-blue-500 text-white shadow-sm shadow-blue-500/30"
                                                    : "bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 group-hover:border-blue-400 dark:group-hover:border-blue-500"
                                            }`}
                                        >
                                            <Check
                                                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                                                    checked
                                                        ? "scale-100"
                                                        : "scale-0"
                                                }`}
                                                strokeWidth={3}
                                            />
                                        </span>
                                    </span>
                                </label>
                            )
                        })}
                </div>
            </div>

            {/* Description */}
            <textarea
                placeholder="Additional notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                rows={3}
            />

            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-1 text-sm text-neutral-800 dark:text-neutral-200"
                >
                    Cancel
                </button>

                <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded bg-purple-600 text-white"
                >
                    {loading ? "Saving..." : "Schedule"}
                </button>
            </div>
        </form>
    )
}

/**
 * Small circular avatar — shows the user's image when available, falls
 * back to their first initial inside a colored circle. ImageKit URLs
 * load fine via plain `<img>` here; no transformations needed at this
 * size.
 */
function UserAvatar({
    name,
    avatar,
}: {
    name: string
    avatar?: string
}) {
    const [broken, setBroken] = useState(false)
    const showImg = !!avatar && !broken
    const initial = name?.trim().charAt(0).toUpperCase() || "?"

    return (
        <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-cyan-500 text-white text-xs font-semibold flex items-center justify-center">
            {showImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={avatar}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setBroken(true)}
                />
            ) : (
                <span>{initial}</span>
            )}
        </div>
    )
}
