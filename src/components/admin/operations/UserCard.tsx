import { USER_ROLE_META, UserRole } from "@/constants/userRoles"
import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"

interface UserCardProps {
    user: {
        _id: string
        name: string
        email: string
        role: UserRole
        isActive: boolean
        avatar?: string
        lastLoginAt?: string
        createdAt: string
    }
}

export default function UserCard({ user }: UserCardProps) {
    const roleMeta = USER_ROLE_META[user.role]
    const isInactive = !user.isActive

    return (
        <div
            className={`
                rounded-xl p-4 border transition
                bg-white border-gray-200 shadow-sm hover:shadow-md
                dark:bg-neutral-900 dark:border-neutral-800

                ${isInactive ? "opacity-60" : ""}
            `}
        >
            {/* Top Section */}
            <div className="flex items-center gap-3">
                {/* Avatar */}
                <div
                    className={`
                        w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold
                        bg-gray-200 text-gray-700
                        dark:bg-neutral-700 dark:text-neutral-200
                    `}
                >
                    {user.avatar ? (
                        <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-full h-full rounded-full object-cover"
                        />
                    ) : (
                        user.name.charAt(0).toUpperCase()
                    )}
                </div>

                {/* Name + Email */}
                <div className="flex-1">
                    <p
                        className={`
                            font-semibold
                            ${isInactive
                                ? "text-gray-400 dark:text-neutral-500"
                                : "text-gray-900 dark:text-white"}
                        `}
                    >
                        {user.name}
                    </p>

                    <p
                        className={`
                            text-sm
                            ${isInactive
                                ? "text-gray-400 dark:text-neutral-500"
                                : "text-gray-500 dark:text-neutral-400"}
                        `}
                    >
                        {user.email}
                    </p>
                </div>

                {/* Status Pill */}
                <span
                    className={`
                        text-xs px-2 py-1 rounded-full font-medium
                        ${
                            user.isActive
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-gray-200 text-gray-600 dark:bg-neutral-700 dark:text-neutral-400"
                        }
                    `}
                >
                    {user.isActive ? "Active" : "Inactive"}
                </span>
            </div>

            {/* Divider */}
            <div className="my-4 border-t border-gray-200 dark:border-neutral-800" />

            {/* Role + Joined */}
            <div className="flex items-center justify-between text-sm">
                <div>
                    <p className="text-gray-500 dark:text-neutral-400">
                        Role :
                        <span title={roleMeta?.description || "No description available"} className="ml-1 text-gray-400 dark:text-neutral-500">
                            {roleMeta?.label || "Unknown"}
                        </span>
                    </p>
                </div>

                <div className="text-right">
                    <p className="text-gray-500 dark:text-neutral-400">
                        Joined
                    </p>
                    <TimeAgo date={user.createdAt} />
                </div>
            </div>

            {/* Footer */}
            <div className="mt-3 flex justify-between items-center text-xs">
                <div className="text-gray-500 dark:text-neutral-400">
                    {user.lastLoginAt ? (
                        <>
                            Last login:{" "}
                            <TimeAgo date={user.lastLoginAt} />
                        </>
                    ) : (
                        "No login yet"
                    )}
                </div>

                {/* Optional subtle inactive indicator */}
                {isInactive && (
                    <span className="text-red-400 dark:text-red-500 font-medium">
                        Disabled
                    </span>
                )}
            </div>
        </div>
    )
}