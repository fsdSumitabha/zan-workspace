// src/components/admin/operations/ClientProjectPreviewCard.tsx
import Link from "next/link"
import StatusBadge from "@/components/admin/operations/StatusBadge"
import { PROJECT_STATUS_META } from "@/constants/projectStatus"
import { Briefcase, Tag, Calendar, IndianRupee } from "lucide-react"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"

export default function ClientProjectPreviewCard({ project }: any) {
    const createdAt = project.createdAt
        ? new Date(project.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
          })
        : null

    return (
        <div className="group p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-blue-500/50 dark:hover:border-blue-500/40 hover:shadow-sm transition-all duration-200 space-y-3">

            {/* Top row — title + status */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {project.title}
                    </p>
                    {project.companyName && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {project.companyName}
                        </p>
                    )}
                </div>

                <StatusBadge status={project.status} meta={PROJECT_STATUS_META} />
            </div>

            {/* Description */}
            {project.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                    {project.description}
                </p>
            )}

            {/* Meta pills */}
            <div className="flex flex-wrap items-center gap-2">

                {project.serviceType && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-500/20">
                        <Tag className="w-3 h-3" />
                        {project.serviceType}
                    </span>
                )}

                {project.budget != null && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                        <IndianRupee className="w-3 h-3" />
                        {project.budget.toLocaleString("en-IN")}
                    </span>
                )}

                {project.createdAt && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-neutral-700">
                        <Calendar className="w-3 h-3" />
                        <TimeAgo date={project.createdAt} />
                    </span>
                )}

            </div>

        </div>
    )
}