"use client"

import { useEffect, useState } from "react"

export function AnimatedItem({
    children,
    index
}: {
    children: React.ReactNode
    index: number
}) {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const timeout = setTimeout(() => {
            setVisible(true)
        }, index * 120)

        return () => clearTimeout(timeout)
    }, [index])

    return (
        <div className="relative pl-4">
            <div className="absolute -left-5 top-1/2 w-3 h-3 rounded-full bg-blue-500" />

            <div
                className={`transition-all duration-500 ease-out ${
                    visible
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-4"
                }`}
            >
                {children}
            </div>
        </div>
    )
}