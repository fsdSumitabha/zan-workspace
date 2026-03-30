import TimeAgo from "@/components/admin/operations/dayjs/TimeAgo"

export default function MeetingItem({ item }: { item: any }) {
    return (
        <div className="p-4 rounded-xl border bg-white dark:bg-neutral-900">
            <div className="flex justify-between items-center">
                <h3 className="font-semibold">{item.title}</h3>

                <TimeAgo date={item.createdAt} />
            </div>

            <p className="text-sm text-gray-600 mt-1">
                {item.description}
            </p>

            {item.meeting && (
                <div className="mt-2 text-sm">
                    Scheduled:{" "}
                    <TimeAgo date={item.meeting.scheduledAt} />
                </div>
            )}
        </div>
    )
}