"use client"

import { useState } from "react"
import * as Icons from "lucide-react"

export default function MeetingLinkButton({ link }: { link: string }) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <div className="flex items-center gap-2">

            {/* Join Button */}
            <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-emerald-900 text-white dark:text-green-400 dark:bg-emerald-700 hover:bg-emerald-700 transition"
            >
                <Icons.Video className="w-3 h-3" />
                Join
            </a>

            {/* Copy Button */}
            <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
            >
                <Icons.Copy className="w-3 h-3" />
                {copied ? "Copied" : "Copy"}
            </button>
        </div>
    )
}