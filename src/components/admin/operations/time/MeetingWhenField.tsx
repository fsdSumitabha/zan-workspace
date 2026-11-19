"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { AlertTriangle, Globe2 } from "lucide-react"

import {
    ZONE_CHOICES,
    describeZone,
    formatClock,
    formatMoment,
    getZonedParts,
    sameClock,
    utcToWallTime,
    wallTimeToUtc,
    zoneAbbr,
    zonePlace,
} from "@/lib/time/zone"
import { useViewerZone } from "./useViewerZone"

type Side = "me" | "client"

interface Props {
    /** The moment picked. Null while the input is empty or holds a date that does not exist. */
    value: Date | null
    onChange: (next: Date | null) => void
    /** The client's zone. */
    clientZone: string
    /** Lets the person say where the client is. The create form passes it, reschedule does not. */
    onClientZoneChange?: (zone: string) => void
    disabled?: boolean
    label?: string
    /** Classes for the two boxes, so each form keeps its own look. */
    inputClassName?: string
    labelClassName?: string
}

// Working hours for the warning: 8:00 AM to 8:00 PM on the person's own clock.
const DAY_START_HOUR = 8
const DAY_END_HOUR = 20

const DEFAULT_INPUT =
    "w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"

/**
 * The date and time of a meeting, with its time zone in view.
 *
 * - The box beside the input names the zone of the typed time. It starts on
 *   "your time". When the client is in another zone, it can switch to the
 *   client's time. Switching shows the same moment on the other clock. It
 *   never moves the meeting.
 * - Under the input, the picked moment is shown on both clocks, with a
 *   warning when it falls at night for either side.
 *
 * `onChange` gets the exact moment, so the form sends `toISOString()` and the
 * server never has to guess a zone.
 */
export default function MeetingWhenField({
    value,
    onChange,
    clientZone,
    onClientZoneChange,
    disabled,
    label = "Meeting date & time",
    inputClassName = DEFAULT_INPUT,
    labelClassName = "text-sm text-neutral-800 dark:text-neutral-200",
}: Props) {
    const viewerZone = useViewerZone()
    const inputId = useId()

    // One zone for both sides when the clocks agree at this moment.
    const single = sameClock(value ?? new Date(), viewerZone, clientZone)

    const [side, setSide] = useState<Side>("me")
    const activeSide: Side = single ? "me" : side
    const typingZone = activeSide === "client" ? clientZone : viewerZone

    const [wall, setWall] = useState(() => (value ? utcToWallTime(value, typingZone) : ""))
    const [editingZone, setEditingZone] = useState(false)

    // Keep the box in step when the zone it is read in changes (after
    // hydration, or when the client's zone changes while typing in it).
    useEffect(() => {
        if (value) setWall(utcToWallTime(value, typingZone))
        // Only the zone. A change of `value` comes from this field itself.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typingZone])

    const handleWall = (next: string) => {
        setWall(next)
        onChange(next ? wallTimeToUtc(next, typingZone) : null)
    }

    const handleSide = (next: Side) => {
        if (next === activeSide) return
        // The same moment, shown on the other clock.
        if (value) setWall(utcToWallTime(value, next === "client" ? clientZone : viewerZone))
        setSide(next)
    }

    const handleClientZone = (zone: string) => {
        onClientZoneChange?.(zone)
        setEditingZone(false)
        // Typing in the client's time: the typed clock now means that clock
        // in the new zone. Typing in your own time: the moment stays.
        if (activeSide === "client" && wall) {
            onChange(wallTimeToUtc(wall, zone))
        }
    }

    const zoneOptions = useMemo(() => {
        const zones = ZONE_CHOICES.map((c) => c.zone)
        for (const z of [clientZone, viewerZone]) {
            if (!zones.includes(z)) zones.push(z)
        }
        return zones
    }, [clientZone, viewerZone])

    const now = new Date()
    const min = utcToWallTime(now, typingZone)

    const warnings: string[] = []
    if (value) {
        if (value.getTime() < now.getTime()) {
            warnings.push("This time has already passed.")
        }
        const clientHour = getZonedParts(value, clientZone).hour
        const myHour = getZonedParts(value, viewerZone).hour
        const offHours = (h: number) => h < DAY_START_HOUR || h >= DAY_END_HOUR
        if (single) {
            if (offHours(myHour)) {
                warnings.push(`That is ${formatClock(value, viewerZone)} for you and the client, outside working hours.`)
            }
        } else {
            if (offHours(clientHour)) {
                warnings.push(`That is ${formatClock(value, clientZone)} for the client, outside their working hours.`)
            }
            if (offHours(myHour)) {
                warnings.push(`That is ${formatClock(value, viewerZone)} for you.`)
            }
        }
    }

    return (
        <div className="space-y-2">
            <label htmlFor={inputId} className={labelClassName}>
                {label}
            </label>

            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    id={inputId}
                    type="datetime-local"
                    value={wall}
                    min={min}
                    disabled={disabled}
                    onChange={(e) => handleWall(e.target.value)}
                    className={`${inputClassName} sm:flex-1 dark:[color-scheme:dark]`}
                />

                {single ? (
                    <span
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 whitespace-nowrap"
                        title={describeZone(viewerZone)}
                    >
                        <Globe2 className="w-3.5 h-3.5 text-neutral-400" aria-hidden />
                        {zoneAbbr(viewerZone)} · {zonePlace(viewerZone)}
                    </span>
                ) : (
                    <select
                        aria-label="Time zone of the time you type"
                        value={activeSide}
                        disabled={disabled}
                        onChange={(e) => handleSide(e.target.value as Side)}
                        className={`${inputClassName} sm:w-auto`}
                    >
                        <option value="me">{zoneAbbr(viewerZone)} · your time</option>
                        <option value="client">
                            {zoneAbbr(clientZone)} · client&apos;s time ({zonePlace(clientZone)})
                        </option>
                    </select>
                )}
            </div>

            {onClientZoneChange && (
                <div className="flex items-center gap-1.5 flex-wrap text-xs text-neutral-600 dark:text-neutral-400">
                    <Globe2 className="w-3.5 h-3.5 text-neutral-400" aria-hidden />
                    <span>Client&apos;s time zone:</span>
                    {editingZone ? (
                        <select
                            autoFocus
                            aria-label="Client's time zone"
                            value={clientZone}
                            disabled={disabled}
                            onChange={(e) => handleClientZone(e.target.value)}
                            onBlur={() => setEditingZone(false)}
                            className="px-2 py-1 rounded-md border bg-white dark:bg-neutral-800 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs"
                        >
                            {zoneOptions.map((z) => (
                                <option key={z} value={z}>
                                    {describeZone(z)}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <>
                            <span className="font-medium text-neutral-800 dark:text-neutral-200">
                                {describeZone(clientZone)}
                            </span>
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => setEditingZone(true)}
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Change
                            </button>
                        </>
                    )}
                </div>
            )}

            {value && (
                <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2 text-sm space-y-1">
                    <div className="flex flex-wrap gap-x-2">
                        <span className="w-28 shrink-0 text-neutral-500">{single ? "Time" : "Your time"}</span>
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                            {formatMoment(value, viewerZone)}
                        </span>
                        {single && <span className="text-neutral-500">· same for the client</span>}
                    </div>
                    {!single && (
                        <div className="flex flex-wrap gap-x-2">
                            <span className="w-28 shrink-0 text-neutral-500">Client&apos;s time</span>
                            <span className="font-medium text-neutral-900 dark:text-neutral-100">
                                {formatMoment(value, clientZone)}
                            </span>
                            <span className="text-neutral-500">· {zonePlace(clientZone)}</span>
                        </div>
                    )}
                    {warnings.map((w) => (
                        <div key={w} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                            <span>{w}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
