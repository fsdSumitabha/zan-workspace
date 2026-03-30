import InteractionItem from "./InteractionItem"
import { Interaction } from "@/types/interaction"
import { AnimatedItem } from "./AnimatedItem"

interface Props {
    interactions: Interaction[]
    loading: boolean
}

export default function InteractionTimeline({
    interactions,
    loading
}: Props) {
    if (loading) {
        return <div>Loading timeline...</div> // later skeleton
    }

    if (!interactions.length) {
        return (
            <div className="text-center py-6 text-gray-500">
                No interactions yet
            </div>
        )
    }

    return (
        <div className="relative pl-6">
            {/* Animated vertical line */}
            <div className="absolute left-2 top-0 w-[2px] bg-gray-300 dark:bg-neutral-700 animate-grow-line" />

            <div className="space-y-4">
                {interactions.map((item, index) => (
                    <AnimatedItem key={item._id} index={index}>
                        <InteractionItem item={item} />
                    </AnimatedItem>
                ))}
            </div>
        </div>
    )
}