"use client"

import { useDropzone } from "react-dropzone"
import { Upload } from "lucide-react"

export default function FileUpload({ setFile, label }: any) {
    const { getRootProps, getInputProps, acceptedFiles } = useDropzone({
        multiple: false,
        onDrop: (files) => {
            setFile(files[0])
        }
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

            {acceptedFiles.length > 0 && (
                <p className="text-xs mt-2">
                    {acceptedFiles[0].name}
                </p>
            )}
        </div>
    )
}