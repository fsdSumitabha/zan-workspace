import { Suspense } from "react"
import MeetingsClient from "./MeetingsClient"

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="text-center py-10 text-gray-500">
                    Loading meetings…
                </div>
            }
        >
            <MeetingsClient />
        </Suspense>
    )
}