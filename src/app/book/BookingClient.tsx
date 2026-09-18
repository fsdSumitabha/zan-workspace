"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import {
    ArrowLeft,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    CircleCheck,
    Clock,
    Globe,
    Loader2,
    RefreshCw,
    Video,
} from "lucide-react"
import { toast } from "sonner"
import PhoneField from "@/components/phone/PhoneField"
import { useEditablePhone } from "@/components/phone/useEditablePhone"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Slot {
    start: string
    available: boolean
}

interface Day {
    date: string
    slots: Slot[]
}

interface Availability {
    timeZone: string
    slotMinutes: number
    officeDays: number[]
    officeStartMinutes: number
    officeEndMinutes: number
    days: Day[]
}

interface BookingResult {
    start: string
    end: string
    timeZone: string
    meetingLink: string | null
    email: string
}

type Step = "pick" | "details" | "done"

interface FormState {
    name: string
    email: string
    company: string
    notes: string
    company_website: string
}

// The phone is not in FormState: useEditablePhone() holds it.
type FieldErrors = Partial<Record<keyof FormState | "phone", string>>

const EMPTY_FORM: FormState = {
    name: "",
    email: "",
    company: "",
    notes: "",
    company_website: "",
}

const NOTES_MAX = 1000
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-IN", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(new Date(iso))
}

function formatLongDate(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-IN", {
        timeZone,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(new Date(iso))
}

/** Formats a "YYYY-MM-DD" key without letting the browser's zone shift it. */
function formatDateKey(key: string, options: Intl.DateTimeFormatOptions): string {
    const [y, m, d] = key.split("-").map(Number)
    return new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "UTC" }).format(
        new Date(Date.UTC(y, m - 1, d, 12))
    )
}

function formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    const suffix = h >= 12 ? "PM" : "AM"
    const hour12 = h % 12 === 0 ? 12 : h % 12
    return m ? `${hour12}:${String(m).padStart(2, "0")} ${suffix}` : `${hour12} ${suffix}`
}

function zoneLabel(timeZone: string): string {
    const part = new Intl.DateTimeFormat("en-IN", {
        timeZone,
        timeZoneName: "short",
    })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")
    return part?.value ?? timeZone
}

function getVisitorTimeZone(): string | null {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null
    } catch {
        return null
    }
}

/** The visitor's local rendering of a slot, or null when it matches office time. */
function localTimeHint(iso: string, officeZone: string, visitorZone: string | null): string | null {
    if (!visitorZone) return null
    const office = `${formatLongDate(iso, officeZone)} ${formatTime(iso, officeZone)}`
    const local = `${formatLongDate(iso, visitorZone)} ${formatTime(iso, visitorZone)}`
    if (office === local) return null
    return `${formatTime(iso, visitorZone)}, ${new Intl.DateTimeFormat("en-IN", {
        timeZone: visitorZone,
        weekday: "short",
        day: "numeric",
        month: "short",
    }).format(new Date(iso))} your time`
}

function monthKeyOf(dateKey: string): string {
    return dateKey.slice(0, 7)
}

function shiftMonth(monthKey: string, delta: number): string {
    const [y, m] = monthKey.split("-").map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

function validateForm(form: FormState): FieldErrors {
    const errors: FieldErrors = {}
    if (!form.name.trim()) errors.name = "Please enter your name."
    if (!EMAIL_REGEX.test(form.email.trim())) errors.email = "Please enter a valid email address."
    if (form.notes.length > NOTES_MAX) errors.notes = `Please keep this under ${NOTES_MAX} characters.`
    return errors
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BookingClient() {
    const [availability, setAvailability] = useState<Availability | null>(null)
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
    const [loadError, setLoadError] = useState("")

    const [step, setStep] = useState<Step>("pick")
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
    const [viewMonth, setViewMonth] = useState<string | null>(null)

    const phone = useEditablePhone()
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
    const [submitError, setSubmitError] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState<BookingResult | null>(null)

    const [visitorZone, setVisitorZone] = useState<string | null>(null)
    const timesRef = useRef<HTMLDivElement>(null)
    const topRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setVisitorZone(getVisitorTimeZone())
    }, [])

    const loadSlots = useCallback(async (opts?: { silent?: boolean }) => {
        if (!opts?.silent) setLoadState("loading")
        try {
            const res = await fetch("/api/public/booking/slots", { cache: "no-store" })
            const json = await res.json().catch(() => null)
            if (!res.ok || !json?.success) {
                throw new Error(json?.message || "We couldn't load available times.")
            }
            const data = json.data as Availability
            setAvailability(data)
            setLoadState("ready")

            const firstOpen = data.days.find((d) => d.slots.some((s) => s.available))
            setSelectedDate((current) => {
                const stillOpen =
                    current && data.days.some((d) => d.date === current)
                const next = stillOpen ? current : firstOpen?.date ?? data.days[0]?.date ?? null
                if (next) setViewMonth((vm) => (stillOpen && vm ? vm : monthKeyOf(next)))
                return next
            })
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : "We couldn't load available times.")
            setLoadState("error")
        }
    }, [])

    useEffect(() => {
        loadSlots()
    }, [loadSlots])

    const dayMap = useMemo(
        () => new Map((availability?.days ?? []).map((d) => [d.date, d])),
        [availability]
    )

    const phoneError = phone.error || fieldErrors.phone

    const timeZone = availability?.timeZone ?? "Asia/Kolkata"
    const slotMinutes = availability?.slotMinutes ?? 30

    const openSlots = useMemo(
        () => (selectedDate ? dayMap.get(selectedDate)?.slots.filter((s) => s.available) ?? [] : []),
        [dayMap, selectedDate]
    )

    const monthBounds = useMemo(() => {
        const days = availability?.days ?? []
        if (!days.length) return null
        return { min: monthKeyOf(days[0].date), max: monthKeyOf(days[days.length - 1].date) }
    }, [availability])

    const officeHoursLabel = availability
        ? `Mon – Fri, ${formatMinutes(availability.officeStartMinutes)} – ${formatMinutes(
              availability.officeEndMinutes
          )}`
        : "Mon – Fri, 10 AM – 8 PM"

    function handleSelectDate(date: string) {
        setSelectedDate(date)
        setSelectedSlot(null)
        // On small screens the time list sits below the calendar — bring it into view.
        if (window.matchMedia("(max-width: 767px)").matches) {
            requestAnimationFrame(() =>
                timesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            )
        }
    }

    function goToStep(next: Step) {
        setStep(next)
        requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
    }

    function updateField(key: keyof FormState, value: string) {
        setForm((f) => ({ ...f, [key]: value }))
        if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: undefined }))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!selectedSlot || submitting) return

        const errors = validateForm(form)
        setFieldErrors(errors)
        setSubmitError("")
        // Focus the phone box only when no field above it has an error.
        const phoneToSend = phone.check({ focus: !errors.name && !errors.email })
        if (Object.keys(errors).length || !phoneToSend) return

        setSubmitting(true)
        try {
            const res = await fetch("/api/public/booking", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, phone: phoneToSend, start: selectedSlot }),
            })
            const json = await res.json().catch(() => null)

            if (res.status === 201 && json?.success) {
                setResult(json.data ?? null)
                goToStep("done")
                return
            }

            if (res.status === 409) {
                toast.error(json?.message || "That time was just taken. Please pick another slot.")
                setSelectedSlot(null)
                goToStep("pick")
                loadSlots({ silent: true })
                return
            }

            if (res.status === 400 && json?.field && (json.field in EMPTY_FORM || json.field === "phone")) {
                setFieldErrors({ [json.field]: json.message })
                return
            }

            setSubmitError(json?.message || "Something went wrong. Please try again.")
        } catch {
            setSubmitError("Network error. Please check your connection and try again.")
        } finally {
            setSubmitting(false)
        }
    }

    function resetBooking() {
        setForm(EMPTY_FORM)
        phone.reset()
        setFieldErrors({})
        setSubmitError("")
        setResult(null)
        setSelectedSlot(null)
        goToStep("pick")
        loadSlots({ silent: true })
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className="min-h-screen bg-neutral-100 px-4 py-6 sm:py-10 dark:bg-neutral-950">
            <div ref={topRef} className="mx-auto w-full max-w-5xl scroll-mt-6">
                <header className="mb-6 flex items-center justify-center">
                    <Image
                        src="/zan-services-color-logo.png"
                        alt="Zan Services"
                        height={30}
                        width={90}
                        priority
                        className="block h-auto dark:hidden"
                    />
                    <Image
                        src="/zan-logo-white.png"
                        alt="Zan Services"
                        height={30}
                        width={90}
                        priority
                        className="hidden h-auto dark:block"
                    />
                </header>

                <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="grid md:grid-cols-[minmax(240px,300px)_1fr]">
                        {/* ---------------- Summary panel ---------------- */}
                        <aside className="border-b border-neutral-200 p-6 md:border-b-0 md:border-r dark:border-neutral-800">
                            {step !== "pick" && step !== "done" && (
                                <button
                                    type="button"
                                    onClick={() => goToStep("pick")}
                                    className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-[#4A6FA5] transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-[#8FB0E0] dark:hover:bg-neutral-800"
                                    aria-label="Back to time selection"
                                >
                                    <ArrowLeft className="h-4 w-4" aria-hidden />
                                </button>
                            )}

                            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Zan Services</p>
                            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                                Book a meeting
                            </h1>

                            <ul className="mt-5 space-y-3 text-sm text-neutral-600 dark:text-neutral-300">
                                <li className="flex items-center gap-2.5">
                                    <Clock className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                                    {slotMinutes} min
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <Video className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                                    Google Meet — link sent on confirmation
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <Globe className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                                    Times in {zoneLabel(timeZone)} ({timeZone})
                                </li>
                                {selectedSlot && step !== "pick" && (
                                    <li className="flex items-start gap-2.5 font-medium text-neutral-900 dark:text-neutral-50">
                                        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#4A6FA5] dark:text-[#8FB0E0]" aria-hidden />
                                        <span>
                                            {formatTime(selectedSlot, timeZone)} –{" "}
                                            {formatTime(
                                                new Date(new Date(selectedSlot).getTime() + slotMinutes * 60_000).toISOString(),
                                                timeZone
                                            )}
                                            <br />
                                            {formatLongDate(selectedSlot, timeZone)}
                                            {localTimeHint(selectedSlot, timeZone, visitorZone) && (
                                                <span className="mt-1 block text-xs font-normal text-neutral-500 dark:text-neutral-400">
                                                    {localTimeHint(selectedSlot, timeZone, visitorZone)}
                                                </span>
                                            )}
                                        </span>
                                    </li>
                                )}
                            </ul>

                            <p className="mt-6 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                                Choose a time that suits you and our team will walk you through how we can help. Available{" "}
                                {officeHoursLabel}.
                            </p>
                        </aside>

                        {/* ---------------- Main panel ---------------- */}
                        <section className="min-w-0 p-6">
                            {step === "pick" && (
                                <>
                                    {loadState === "loading" && <PickerSkeleton />}

                                    {loadState === "error" && (
                                        <div className="flex min-h-80 flex-col items-center justify-center text-center">
                                            <CircleAlert className="h-10 w-10 text-neutral-400" aria-hidden />
                                            <p className="mt-3 max-w-sm text-sm text-neutral-600 dark:text-neutral-300">{loadError}</p>
                                            <button
                                                type="button"
                                                onClick={() => loadSlots()}
                                                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#4A6FA5] px-4 text-sm font-medium text-white transition-colors hover:bg-[#3d5d8c]"
                                            >
                                                <RefreshCw className="h-4 w-4" aria-hidden />
                                                Try again
                                            </button>
                                        </div>
                                    )}

                                    {loadState === "ready" && availability && viewMonth && (
                                        <div className="grid gap-8 lg:grid-cols-[1fr_220px]">
                                            <div>
                                                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                                                    Select a date &amp; time
                                                </h2>

                                                <MonthCalendar
                                                    monthKey={viewMonth}
                                                    dayMap={dayMap}
                                                    selectedDate={selectedDate}
                                                    todayKey={availability.days[0]?.date ?? ""}
                                                    canPrev={!!monthBounds && viewMonth > monthBounds.min}
                                                    canNext={!!monthBounds && viewMonth < monthBounds.max}
                                                    onPrev={() => setViewMonth(shiftMonth(viewMonth, -1))}
                                                    onNext={() => setViewMonth(shiftMonth(viewMonth, 1))}
                                                    onSelect={handleSelectDate}
                                                />
                                            </div>

                                            <div ref={timesRef} className="scroll-mt-6">
                                                {selectedDate && (
                                                    <p className="mb-3 text-sm font-medium text-neutral-900 dark:text-neutral-50">
                                                        {formatDateKey(selectedDate, {
                                                            weekday: "long",
                                                            day: "numeric",
                                                            month: "long",
                                                        })}
                                                    </p>
                                                )}

                                                {openSlots.length === 0 ? (
                                                    <p className="rounded-lg border border-dashed border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                                                        No open times on this day. We meet {officeHoursLabel}.
                                                    </p>
                                                ) : (
                                                    <ul className="grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-1">
                                                        {openSlots.map((slot) => {
                                                            const isSelected = slot.start === selectedSlot
                                                            return (
                                                                <li key={slot.start} className={isSelected ? "col-span-2 sm:col-span-3 lg:col-span-1" : ""}>
                                                                    {isSelected ? (
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            <span className="flex h-11 items-center justify-center rounded-lg bg-neutral-600 text-sm font-semibold text-white dark:bg-neutral-700">
                                                                                {formatTime(slot.start, timeZone)}
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => goToStep("details")}
                                                                                className="h-11 rounded-lg bg-[#4A6FA5] text-sm font-semibold text-white transition-colors hover:bg-[#3d5d8c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A6FA5]"
                                                                            >
                                                                                Next
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setSelectedSlot(slot.start)}
                                                                            className="h-11 w-full rounded-lg border border-[#4A6FA5]/40 text-sm font-semibold text-[#4A6FA5] transition-colors hover:border-[#4A6FA5] hover:bg-[#4A6FA5]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A6FA5] dark:border-[#8FB0E0]/40 dark:text-[#8FB0E0] dark:hover:border-[#8FB0E0] dark:hover:bg-[#8FB0E0]/10"
                                                                        >
                                                                            {formatTime(slot.start, timeZone)}
                                                                        </button>
                                                                    )}
                                                                </li>
                                                            )
                                                        })}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {step === "details" && selectedSlot && (
                                <form onSubmit={handleSubmit} noValidate className="max-w-lg">
                                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Enter your details</h2>

                                    <div className="mt-5 space-y-4">
                                        <Field label="Name" required error={fieldErrors.name} htmlFor="book-name">
                                            <input
                                                id="book-name"
                                                type="text"
                                                autoComplete="name"
                                                maxLength={120}
                                                value={form.name}
                                                onChange={(e) => updateField("name", e.target.value)}
                                                className={inputClass(!!fieldErrors.name)}
                                            />
                                        </Field>

                                        <Field
                                            label="Email"
                                            required
                                            error={fieldErrors.email}
                                            htmlFor="book-email"
                                            hint="The calendar invite and Meet link are sent here."
                                        >
                                            <input
                                                id="book-email"
                                                type="email"
                                                autoComplete="email"
                                                inputMode="email"
                                                maxLength={200}
                                                value={form.email}
                                                onChange={(e) => updateField("email", e.target.value)}
                                                className={inputClass(!!fieldErrors.email)}
                                            />
                                        </Field>

                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <Field label="Phone" required error={phoneError} htmlFor="book-phone">
                                                <PhoneField
                                                    id="book-phone"
                                                    {...phone.fieldProps}
                                                    onChange={(value) => {
                                                        phone.fieldProps.onChange(value)
                                                        if (fieldErrors.phone) setFieldErrors((e) => ({ ...e, phone: undefined }))
                                                    }}
                                                    hasError={!!phoneError}
                                                    className={phoneBoxClass(!!phoneError)}
                                                />
                                            </Field>

                                            <Field label="Company" error={fieldErrors.company} htmlFor="book-company">
                                                <input
                                                    id="book-company"
                                                    type="text"
                                                    autoComplete="organization"
                                                    maxLength={120}
                                                    value={form.company}
                                                    onChange={(e) => updateField("company", e.target.value)}
                                                    className={inputClass(!!fieldErrors.company)}
                                                />
                                            </Field>
                                        </div>

                                        <Field
                                            label="What would you like to discuss?"
                                            error={fieldErrors.notes}
                                            htmlFor="book-notes"
                                            hint={`${form.notes.length}/${NOTES_MAX}`}
                                        >
                                            <textarea
                                                id="book-notes"
                                                rows={4}
                                                maxLength={NOTES_MAX}
                                                value={form.notes}
                                                onChange={(e) => updateField("notes", e.target.value)}
                                                className={`${inputClass(!!fieldErrors.notes)} h-auto resize-y py-2.5`}
                                            />
                                        </Field>

                                        {/* Honeypot — hidden from people, tempting to bots. */}
                                        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                                            <label htmlFor="book-website">Website</label>
                                            <input
                                                id="book-website"
                                                type="text"
                                                tabIndex={-1}
                                                autoComplete="off"
                                                value={form.company_website}
                                                onChange={(e) => updateField("company_website", e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {submitError && (
                                        <p role="alert" className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                            {submitError}
                                        </p>
                                    )}

                                    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                                        <button
                                            type="button"
                                            onClick={() => goToStep("pick")}
                                            className="h-11 rounded-lg px-4 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                                        >
                                            Change time
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#4A6FA5] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#3d5d8c] disabled:cursor-not-allowed disabled:opacity-70 sm:ml-auto"
                                        >
                                            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                            {submitting ? "Booking…" : "Confirm booking"}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {step === "done" && result && (
                                <div className="flex min-h-80 flex-col items-center justify-center py-6 text-center">
                                    <CircleCheck className="h-14 w-14 text-emerald-500" aria-hidden />
                                    <h2 className="mt-4 text-xl font-semibold text-neutral-900 dark:text-neutral-50">You&apos;re booked</h2>
                                    <p className="mt-2 max-w-sm text-sm text-neutral-600 dark:text-neutral-300">
                                        A calendar invitation has been sent to{" "}
                                        <span className="font-medium text-neutral-900 dark:text-neutral-50">{result.email}</span>.
                                    </p>

                                    <div className="mt-6 w-full max-w-sm rounded-xl border border-neutral-200 p-4 text-left text-sm dark:border-neutral-800">
                                        <p className="flex items-start gap-2.5 font-medium text-neutral-900 dark:text-neutral-50">
                                            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#4A6FA5] dark:text-[#8FB0E0]" aria-hidden />
                                            <span>
                                                {formatTime(result.start, result.timeZone)} – {formatTime(result.end, result.timeZone)}
                                                <br />
                                                {formatLongDate(result.start, result.timeZone)}
                                                <span className="mt-1 block text-xs font-normal text-neutral-500 dark:text-neutral-400">
                                                    {localTimeHint(result.start, result.timeZone, visitorZone) ??
                                                        `${zoneLabel(result.timeZone)} (${result.timeZone})`}
                                                </span>
                                            </span>
                                        </p>
                                    </div>

                                    <div className="mt-6 flex w-full max-w-sm flex-col gap-3 sm:flex-row">
                                        {result.meetingLink && (
                                            <a
                                                href={result.meetingLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#4A6FA5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#3d5d8c]"
                                            >
                                                <Video className="h-4 w-4" aria-hidden />
                                                Google Meet link
                                            </a>
                                        )}
                                        <button
                                            type="button"
                                            onClick={resetBooking}
                                            className="h-11 flex-1 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                        >
                                            Book another time
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                </div>

                <p className="mt-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
                    © {new Date().getFullYear()} Zan Services
                </p>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MonthCalendar(props: {
    monthKey: string
    dayMap: Map<string, Day>
    selectedDate: string | null
    todayKey: string
    canPrev: boolean
    canNext: boolean
    onPrev: () => void
    onNext: () => void
    onSelect: (date: string) => void
}) {
    const { monthKey, dayMap, selectedDate, todayKey, canPrev, canNext, onPrev, onNext, onSelect } = props
    const [year, month] = monthKey.split("-").map(Number)
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    // Monday-first grid offset.
    const leadingBlanks = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7

    const cells: (string | null)[] = [
        ...Array.from({ length: leadingBlanks }, () => null),
        ...Array.from(
            { length: daysInMonth },
            (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`
        ),
    ]

    return (
        <div className="mt-5">
            <div className="mb-3 flex items-center justify-between">
                <button
                    type="button"
                    onClick={onPrev}
                    disabled={!canPrev}
                    aria-label="Previous month"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#4A6FA5] transition-colors hover:bg-[#4A6FA5]/10 disabled:pointer-events-none disabled:text-neutral-300 dark:text-[#8FB0E0] dark:disabled:text-neutral-700"
                >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100" aria-live="polite">
                    {formatDateKey(`${monthKey}-01`, { month: "long", year: "numeric" })}
                </p>
                <button
                    type="button"
                    onClick={onNext}
                    disabled={!canNext}
                    aria-label="Next month"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#4A6FA5] transition-colors hover:bg-[#4A6FA5]/10 disabled:pointer-events-none disabled:text-neutral-300 dark:text-[#8FB0E0] dark:disabled:text-neutral-700"
                >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAY_LABELS.map((label) => (
                    <span key={label} className="py-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                        {label}
                    </span>
                ))}

                {cells.map((dateKey, i) => {
                    if (!dateKey) return <span key={`blank-${i}`} />

                    const day = dayMap.get(dateKey)
                    const openCount = day?.slots.filter((s) => s.available).length ?? 0
                    const enabled = openCount > 0
                    const isSelected = dateKey === selectedDate
                    const isToday = dateKey === todayKey
                    const dayNumber = Number(dateKey.slice(8))

                    return (
                        <div key={dateKey} className="flex justify-center">
                            <button
                                type="button"
                                disabled={!enabled}
                                onClick={() => onSelect(dateKey)}
                                aria-pressed={isSelected}
                                aria-label={`${formatDateKey(dateKey, { weekday: "long", day: "numeric", month: "long" })}${
                                    enabled ? `, ${openCount} times available` : ", unavailable"
                                }`}
                                className={[
                                    "relative flex aspect-square w-full max-w-11 items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A6FA5]",
                                    isSelected
                                        ? "bg-[#4A6FA5] font-semibold text-white"
                                        : enabled
                                          ? "bg-[#4A6FA5]/10 font-semibold text-[#4A6FA5] hover:bg-[#4A6FA5]/20 dark:bg-[#8FB0E0]/15 dark:text-[#8FB0E0] dark:hover:bg-[#8FB0E0]/25"
                                          : "cursor-default text-neutral-300 dark:text-neutral-600",
                                ].join(" ")}
                            >
                                {dayNumber}
                                {isToday && (
                                    <span
                                        className={`absolute bottom-1 h-1 w-1 rounded-full ${
                                            isSelected ? "bg-white" : "bg-current"
                                        }`}
                                        aria-hidden
                                    />
                                )}
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function Field(props: {
    label: string
    htmlFor: string
    required?: boolean
    error?: string
    hint?: string
    children: React.ReactNode
}) {
    return (
        <div>
            <label htmlFor={props.htmlFor} className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-neutral-200">
                {props.label}
                {props.required && <span className="ml-0.5 text-red-500">*</span>}
            </label>
            {props.children}
            {props.error ? (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{props.error}</p>
            ) : props.hint ? (
                <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">{props.hint}</p>
            ) : null}
        </div>
    )
}

function inputClass(hasError: boolean): string {
    return [
        "block h-11 w-full rounded-lg border bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:ring-2 dark:bg-neutral-950 dark:text-neutral-50",
        hasError
            ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
            : "border-neutral-300 focus:border-[#4A6FA5] focus:ring-[#4A6FA5]/20 dark:border-neutral-700",
    ].join(" ")
}

// Same look as inputClass. The phone field is a <div> around the real
// <input>, so it shows focus with focus-within instead of focus.
function phoneBoxClass(hasError: boolean): string {
    return [
        "h-11 w-full rounded-lg border bg-white px-3 text-sm text-neutral-900 transition-colors focus-within:ring-2 dark:bg-neutral-950 dark:text-neutral-50",
        hasError
            ? "border-red-400 focus-within:border-red-500 focus-within:ring-red-500/20"
            : "border-neutral-300 focus-within:border-[#4A6FA5] focus-within:ring-[#4A6FA5]/20 dark:border-neutral-700",
    ].join(" ")
}

function PickerSkeleton() {
    return (
        <div className="grid animate-pulse gap-8 lg:grid-cols-[1fr_220px]" aria-busy="true" aria-label="Loading available times">
            <div>
                <div className="h-6 w-48 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="mt-8 grid grid-cols-7 gap-2">
                    {Array.from({ length: 35 }).map((_, i) => (
                        <div key={i} className="mx-auto aspect-square w-full max-w-11 rounded-full bg-neutral-100 dark:bg-neutral-800/60" />
                    ))}
                </div>
            </div>
            <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-11 rounded-lg bg-neutral-100 dark:bg-neutral-800/60" />
                ))}
            </div>
        </div>
    )
}
