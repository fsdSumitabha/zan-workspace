"use client"

import { useRef } from "react";
import { Calendar } from "lucide-react"


const fmtShort = (d: string) => d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

export default function DateField({
    label,
    value,
    min,
    max,
    active,
    onChange,
}: {
    label: string;
    value: string;
    min?: string;
    max?: string;
    active: boolean;
    onChange: (v: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    const openPicker = () => {
        const el = inputRef.current;
        if (!el) return;
        try {
            el.showPicker(); // reliable, must be inside a user gesture (it is)
        } catch {
            // Older browsers without showPicker: fall back to focusing the input
            el.focus();
            el.click();
        }
    };

    return (
        <div className="flex flex-col gap-1 min-w-0">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                {label}
            </label>

            {/* Desktop / tablet: full native date input */}
            <input
                type="date"
                className={`hidden sm:block w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" ${active ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-500'}`}
                value={value}
                min={min}
                max={max}
                onChange={(e) => onChange(e.target.value)}
            />

            {/* Mobile: the whole button is tappable; picker is triggered programmatically */}
            <div className="relative sm:hidden">
                <button
                    type="button"
                    onClick={openPicker}
                    aria-label={label}
                    className={`w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 flex w-full items-center justify-center gap-1.5 ${
                        active ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-500'
                    }`}
                >
                    <Calendar className="w-4 h-4 shrink-0" />
                    {active && <span className="truncate text-xs">{fmtShort(value)}</span>}
                </button>

                {/* Value holder + picker anchor. Kept in layout (not display:none) so showPicker works. */}
                <input
                    ref={inputRef}
                    type="date"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0 opacity-0"
                    value={value}
                    min={min}
                    max={max}
                    onChange={(e) => onChange(e.target.value)}
                />
            </div>
        </div>
    );
}