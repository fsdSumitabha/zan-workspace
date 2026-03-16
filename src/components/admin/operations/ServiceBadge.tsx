type Service = "Web Development" | "Digital Marketing" | "BlockChain" | "Mobile APP" | "SEO"

function getColor(service: Service) {
    switch (service) {
        case "Web Development":
            return "bg-blue-500/20 text-blue-400"

        case "Digital Marketing":
            return "bg-purple-500/20 text-purple-400"

        case "BlockChain":
            return "bg-emerald-500/20 text-emerald-400"

        case "Mobile APP":
            return "bg-orange-500/20 text-orange-400"

        case "SEO":
            return "bg-pink-500/20 text-pink-400"

        default:
            return "bg-gray-500/20 text-gray-400"
    }
}

export default function ServiceBadge({ service }: { service: Service }) {
    return (
        <span
            className={`text-xs px-2 py-1 rounded-md font-medium ${getColor(
                service
            )}`}
        >
            {service}
        </span>
    )
}
