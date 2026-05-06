"use client"

import { useState, useRef, useEffect, ReactNode } from "react"
import { createPortal } from "react-dom"

interface TooltipProps {
    content: ReactNode
    delay?: number      // ms before reveal (Chrome ≈ 500)
    offset?: number     // gap between cursor and tooltip
    className?: string
}

export default function Tooltip({
    content,
    delay = 500,
    offset = 14,
    className = "",
}: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false)
    const [coords, setCoords] = useState({ x: 0, y: 0 })

    const anchorRef = useRef<HTMLSpanElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)
    const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Refs so we don't have to re-bind listeners
    const lastCursorRef = useRef({ x: 0, y: 0 })
    const isFrozenRef = useRef(false)

    useEffect(() => {
        if (!anchorRef.current) return
        const parent = anchorRef.current.parentElement
        if (!parent) return

        const positionTooltip = (cx: number, cy: number) => {
            const tip = tooltipRef.current
            const tipW = tip?.offsetWidth ?? 200
            const tipH = tip?.offsetHeight ?? 40
            const vw = window.innerWidth
            const vh = window.innerHeight

            let x = cx + offset
            let y = cy + offset

            if (x + tipW + 8 > vw) x = cx - tipW - offset
            if (y + tipH + 8 > vh) y = cy - tipH - offset

            x = Math.max(8, x)
            y = Math.max(8, y)

            setCoords({ x, y })
        }

        const handleEnter = (e: MouseEvent) => {
            lastCursorRef.current = { x: e.clientX, y: e.clientY }
            isFrozenRef.current = false

            if (showTimerRef.current) clearTimeout(showTimerRef.current)
            showTimerRef.current = setTimeout(() => {
                // 👇 Snapshot cursor position at reveal, then freeze
                positionTooltip(lastCursorRef.current.x, lastCursorRef.current.y)
                isFrozenRef.current = true
                setIsVisible(true)
            }, delay)
        }

        const handleMove = (e: MouseEvent) => {
            // Track cursor only DURING the delay phase
            if (!isFrozenRef.current) {
                lastCursorRef.current = { x: e.clientX, y: e.clientY }
            }
            // Once frozen, ignore movement entirely — no tail effect
        }

        const handleLeave = () => {
            if (showTimerRef.current) clearTimeout(showTimerRef.current)
            isFrozenRef.current = false
            setIsVisible(false)
        }

        parent.addEventListener("mouseenter", handleEnter)
        parent.addEventListener("mousemove", handleMove)
        parent.addEventListener("mouseleave", handleLeave)

        return () => {
            parent.removeEventListener("mouseenter", handleEnter)
            parent.removeEventListener("mousemove", handleMove)
            parent.removeEventListener("mouseleave", handleLeave)
            if (showTimerRef.current) clearTimeout(showTimerRef.current)
        }
    }, [delay, offset])

    return (
        <>
            <span
                ref={anchorRef}
                style={{ display: "none" }}
                aria-hidden="true"
            />

            {isVisible && typeof window !== "undefined" && createPortal(
                <div
                    ref={tooltipRef}
                    role="tooltip"
                    style={{
                        position: "fixed",
                        top: coords.y,
                        left: coords.x,
                        zIndex: 9999,
                    }}
                    className={`
                        pointer-events-none select-none
                        px-3 py-2 rounded-lg
                        text-xs font-medium tracking-tight whitespace-nowrap

                        bg-white/95 text-neutral-800
                        border border-neutral-200/80
                        backdrop-blur-md
                        shadow-[0_4px_14px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.06)]

                        dark:bg-neutral-900/95 dark:text-neutral-100
                        dark:border-white/[0.08]
                        dark:shadow-[0_8px_24px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.3)]

                        animate-tooltip-in
                        ${className}
                    `}
                >
                    {content}
                </div>,
                document.body
            )}

            <style jsx global>{`
                @keyframes tooltip-in {
                    from { opacity: 0; transform: translateY(2px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .animate-tooltip-in {
                    animation: tooltip-in 120ms ease-out;
                }
            `}</style>
        </>
    )
}