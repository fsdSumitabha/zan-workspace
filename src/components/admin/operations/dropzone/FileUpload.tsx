"use client"

import { useDropzone } from "react-dropzone"
import { Upload } from "lucide-react"

interface FileUploadProps {
    file: File | null
    setFile: (file: File | null) => void
    label?: string
    maxSize?: number
    acceptedTypes?: string[]
}

export default function FileUpload({
    file,
    setFile,
    label,
    maxSize = 5 * 1024 * 1024, // default 5MB
    acceptedTypes = ["image/jpeg", "image/png"],
}: FileUploadProps) {
    const { getRootProps, getInputProps, acceptedFiles, fileRejections } = useDropzone({
        multiple: false,
        maxSize,
        accept: acceptedTypes.reduce((acc, type) => {
            acc[type] = []
            return acc
        }, {} as Record<string, string[]>),
        onDrop: (files) => {
            if (files.length > 0) {
                setFile(files[0])
            } else {
                setFile(null)
            }
        },
    })

    return (
        <div
            {...getRootProps()}
            className="border-2 border-dashed dark:border-neutral-700 rounded-xl p-4 text-center cursor-pointer"
        >
            <input {...getInputProps()} />

            <Upload className="mx-auto mb-2 w-5 h-5" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
                {label || "Drag & drop or click"}
            </p>

            {file && (
                <p className="text-xs mt-2 text-green-600"> {file.name} </p>
            )}

            {fileRejections.length > 0 && (
                <div className="text-xs mt-2 text-red-600">
                    {fileRejections.map(({ file, errors }) => (
                        <div key={file.name}>
                            {file.name}
                            <ul>
                                {errors.map((e) => (
                                    <li key={e.code}>{e.message}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}