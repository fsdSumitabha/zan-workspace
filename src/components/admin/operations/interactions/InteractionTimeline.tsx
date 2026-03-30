import InteractionItem from "./InteractionItem"
import { Interaction } from "@/types/interaction"

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
        <div className="space-y-4">
            {interactions.map((item) => (
                <InteractionItem key={item._id} item={item} />
            ))}
        </div>
    )
}