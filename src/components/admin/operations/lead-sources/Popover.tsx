"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import clsx from "clsx"

interface Props {
    open: boolean
    onClose: () => void
    anchorRef: RefObject<HTMLElement | null>
    /** Line the panel up with the anchor's left edge or its right edge. */
    align?: "start" | "end"
    width?: number
    /** Read by screen readers. */
    label: string
    children: ReactNode
}

/** Below this width the panel is a sheet at the bottom of the screen. */
const SHEET_BELOW = 640

/**
 * A small panel attached to a button, such as the status menu on a row.
 *
 * It lives in a portal, so a row's overflow or stacking cannot cut it off.
 * It opens upward when there is no room below. On a phone it becomes a sheet
 * at the bottom of the screen, where a thumb can reach it.
 *
 * React events bubble out of a portal to the component that rendered it.
 * The panel stops clicks and keys at its edge, so a click inside it never
 * reaches the row under it and opens the details page.
 *
 * A click outside closes it. That click is caught and goes no further.
 */
export default function Popover({ open, onClose, anchorRef, align = "end", width = 300, label, children }: Props) {
    const panelRef = useRef<HTMLDivElement>(null)
    const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null)
    const [sheet, setSheet] = useState(false)

    useLayoutEffect(() => {
        if (!open) {
            setPosition(null)
            return
        }

        const place = () => {
            const anchor = anchorRef.current
            const panel = panelRef.current
            if (!anchor || !panel) return

            if (window.innerWidth < SHEET_BELOW) {
                setSheet(true)
                return
            }
            setSheet(false)

            const rect = anchor.getBoundingClientRect()
            const w = Math.min(width, window.innerWidth - 16)
            const h = panel.offsetHeight

            let top = rect.bottom + 6
            if (top + h > window.innerHeight - 8 && rect.top - 6 - h >= 8) {
                top = rect.top - 6 - h
            }
            top = Math.max(8, Math.min(top, window.innerHeight - h - 8))

            let left = align === "end" ? rect.right - w : rect.left
            left = Math.max(8, Math.min(left, window.innerWidth - w - 8))

            setPosition({ top, left, width: w })
        }

        place()

        const observer = new ResizeObserver(place)
        if (panelRef.current) observer.observe(panelRef.current)
        window.addEventListener("resize", place)
        window.addEventListener("scroll", place, true)

        return () => {
            observer.disconnect()
            window.removeEventListener("resize", place)
            window.removeEventListener("scroll", place, true)
        }
    }, [open, anchorRef, align, width])

    useEffect(() => {
        if (!open) return

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }

        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [open, onClose])

    if (!open || typeof document === "undefined") return null

    return createPortal(
        <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === "Escape") onClose()
            }}
        >
            {/* Catches the click that closes the panel. Without it that click
                would also land on whatever is under it, often a row, and open
                the details page. Clear on a desktop, dimmed on a phone. */}
            <div
                className={clsx("fixed inset-0 z-[70]", sheet && "bg-black/40")}
                aria-hidden="true"
                onClick={onClose}
            />

            <div
                ref={panelRef}
                role="dialog"
                aria-label={label}
                style={
                    sheet
                        ? undefined
                        : {
                              position: "fixed",
                              top: position?.top ?? -9999,
                              left: position?.left ?? -9999,
                              width: position?.width ?? width,
                          }
                }
                className={clsx(
                    "z-[71] overflow-y-auto text-neutral-800 dark:text-neutral-100",
                    "bg-white ring-1 ring-black/5 shadow-xl",
                    "dark:bg-neutral-900 dark:ring-white/10 dark:shadow-black/50",
                    sheet
                        ? "fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
                        : "max-h-[80vh] rounded-xl"
                )}
            >
                {sheet && <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />}
                {children}
            </div>
        </div>,
        document.body
    )
}
