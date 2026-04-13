"use client"

import { createContext, useContext, useState, ReactNode } from "react"

type StatusContextType = {
    remarks: string
    setRemarks: (val: string) => void
    showRemarks: boolean
    setShowRemarks: (val: boolean) => void
    nextStatus: number | null
    setNextStatus: (status: number | null) => void
    reset: () => void
}

const StatusContext = createContext<StatusContextType | null>(null)

export function StatusProvider({ children }: { children: ReactNode }) {
    const [remarks, setRemarks] = useState("")
    const [showRemarks, setShowRemarks] = useState(false)
    const [nextStatus, setNextStatus] = useState<number | null>(null)

    const reset = () => {
        setRemarks("")
        setNextStatus(null)
        setShowRemarks(false)
    }

    return (
        <StatusContext.Provider
            value={{ remarks, setRemarks, nextStatus, setNextStatus, showRemarks, setShowRemarks, reset }}
        >
            {children}
        </StatusContext.Provider>
    )
}

export function useStatus() {
    const ctx = useContext(StatusContext)
    if (!ctx) throw new Error("useStatus must be used inside StatusProvider")
    return ctx
}