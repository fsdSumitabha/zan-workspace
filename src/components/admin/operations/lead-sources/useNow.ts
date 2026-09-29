"use client"

import { useEffect, useState } from "react"

/**
 * The current time, updated every `intervalMs`.
 *
 * Callback chips use it to turn "in 5 min" into "due" while the page stays
 * open, without asking the server again.
 */
export function useNow(intervalMs = 20_000): number {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs)
        return () => clearInterval(timer)
    }, [intervalMs])

    return now
}
