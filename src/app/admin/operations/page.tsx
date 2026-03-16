import SearchBar from "@/components/admin/operations/SearchBar"
import ContactCard from "@/components/admin/operations/ContactCard"
import StatsPanel from "@/components/admin/operations/StatsPanel"
import { contacts } from "@/data/data"


export default function Page() {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">

            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />

                    {contacts.map((contact, i) => (
                        <ContactCard key={i} {...contact} />
                    ))}

                </div>

                <StatsPanel />

            </div>

        </div>
    )
}
