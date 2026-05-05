import { Pencil, Trash2, ImageIcon } from "lucide-react"
import { useState, useEffect } from "react"

interface AvatarPreviewProps {
    file: File | null
    fallbackUrl?: string
    onReplace: (file: File) => void
    onRemove: () => void
}

export default function AvatarPreview({
    file,
    fallbackUrl,
    onReplace,
    onRemove
}: AvatarPreviewProps) {
    const [previewUrl, setPreviewUrl] = useState<string>("")

    useEffect(() => {
        // No file picked — fall back to the existing avatar URL (edit mode)
        if (!file) {
            setPreviewUrl(fallbackUrl || "")
            return
        }

        // File picked — create blob URL, revoke the SAME URL on cleanup
        const url = URL.createObjectURL(file)
        setPreviewUrl(url)

        return () => {
            URL.revokeObjectURL(url)
        }
    }, [file, fallbackUrl])

    const handleReplaceClick = () => {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "image/jpeg,image/png"
        input.onchange = (e) => {
            const target = e.target as HTMLInputElement
            const newFile = target.files?.[0]
            if (newFile) onReplace(newFile)
        }
        input.click()
    }

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    return (
        <div className="flex flex-col items-center gap-4 p-5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
            {/* Circular avatar preview with overlay edit button */}
            <div className="relative w-24 h-24">
                {previewUrl ? (
                    <img
                        src={previewUrl}
                        alt="Avatar preview"
                        className="w-24 h-24 rounded-full object-cover border border-gray-200 dark:border-neutral-700"
                    />
                ) : (
                    <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700" />
                )}
                <button
                    type="button"
                    onClick={handleReplaceClick}
                    aria-label="Replace image"
                    className="..."
                >
                    <Pencil className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                </button>
            </div>

            {/* File info row */}
            <div className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-neutral-800">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <ImageIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                            {file?.name || "Current avatar"}
                        </p>
                        {file && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                {formatSize(file.size)}
                            </p>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label="Remove avatar"
                    className="
                        w-7 h-7 rounded-full
                        flex items-center justify-center
                        text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10
                        transition-colors shrink-0
                    "
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    )
}