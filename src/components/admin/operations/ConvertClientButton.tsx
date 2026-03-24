"use client"
import { useRouter } from "next/navigation"
import { SquaresIntersect } from "lucide-react"

export default function ConvertButton({ id }: { id: string }) {
  const router = useRouter()

  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        router.push(`/admin/operations/leads/${id}/convert`)
      }}
      className="flex items-center gap-1 text-xs px-3 py-2 rounded-md 
                 bg-green-600 hover:bg-green-700 text-white 
                 shadow-sm hover:shadow-md transition-all duration-200"
    >
      <span>Convert To Client</span>
      <SquaresIntersect size={14} strokeWidth={2} />
    </button>
  )
}