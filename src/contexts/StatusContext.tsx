"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import type { LeadStatus } from "@/constants/leadStatus"

type StatusContextType = {
    remarks: string
    setRemarks: (val: string) => void

    nextStatus: LeadStatus | null
    setNextStatus: (status: LeadStatus | null) => void

    reset: () => void
}

const StatusContext = createContext<StatusContextType | null>(null)

export function StatusProvider({ children }: { children: ReactNode }) {
    const [remarks, setRemarks] = useState("")
    const [nextStatus, setNextStatus] = useState<LeadStatus | null>(null)

    const reset = () => {
        setRemarks("")
        setNextStatus(null)
    }

    return (
        <StatusContext.Provider
            value={{
                remarks,
                setRemarks,
                nextStatus,
                setNextStatus,
                reset
            }}
        >
            {children}
        </StatusContext.Provider>
    )
}

// custom hook (IMPORTANT)
export function useStatus() {
    const ctx = useContext(StatusContext)
    if (!ctx) {
        throw new Error("useStatus must be used inside StatusProvider")
    }
    return ctx
}