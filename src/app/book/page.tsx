import type { Metadata } from "next"
import BookingClient from "./BookingClient"

export const metadata: Metadata = {
    title: "Book a meeting | Zan Services",
    description:
        "Pick a time that works for you and book a 30-minute Google Meet call with the Zan Services team.",
}

export default function BookPage() {
    return <BookingClient />
}
