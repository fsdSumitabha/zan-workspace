"use client"

import StatusBadge from "./StatusBadge"
import { CLIENT_STATUS_META } from "@/constants/clientStatus"

import type { Client } from "@/types/clients"

interface Props {
    client: Client
}

export default function ClientDetails({ client }: Props) {

    return (
        <div className="space-y-4">

            {/* Header */}
            <div className="p-5 rounded-xl border bg-white dark:bg-neutral-900">
                <div className="flex items-center justify-between">

                    <div>
                        <h1 className="text-xl font-semibold">
                            {client.name}
                        </h1>
                        <p className="text-sm text-gray-500">
                            {client.company}
                        </p>
                    </div>

                    <StatusBadge status={client.status} meta={CLIENT_STATUS_META} />
                </div>
            </div>

            {/* Future Sections Placeholder */}
            <div className="p-5 rounded-xl border bg-white dark:bg-neutral-900 text-sm text-gray-500">
                Projects & interactions will appear here
            </div>

        </div>
    )
}