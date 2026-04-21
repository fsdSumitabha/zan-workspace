import { ServiceType, SERVICE_META } from "@/constants/services"

type Props = {
    service: ServiceType
}

export default function ServiceBadge({ service }: Props) {
    const meta = SERVICE_META[service]

    if (!meta) {
        return (
            <span className="text-xs px-2 py-1 rounded-md font-medium bg-gray-500/20 text-gray-400">
                Unknown
            </span>
        )
    }

    return (
        <span
            className={`text-xs px-2 py-1 rounded-md font-medium ${meta.color}`}
        >
            {meta.label}
        </span>
    )
}