import SearchBar from "@/components/admin/operations/SearchBar"
import ContactCard from "@/components/admin/operations/ContactCard"
import StatsPanel from "@/components/admin/operations/StatsPanel"

export default function Page() {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-neutral-950 text-gray-900 dark:text-white">

            <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">

                <div className="lg:col-span-2 space-y-4">

                    <SearchBar />

                    <ContactCard
                        name="Suresh Raina"
                        company="Raina Ventures"
                        service="Web Development"
                        status="ACTIVE"
                        interaction={{
                            type: "MEETING",
                            title: "Requirement Discussion",
                            subtitle: "ERP modules overview",
                            time: "21 Mar • 11:00 AM",
                            user: "Karthikeh"
                        }}
                    />

                    <ContactCard
                        name="Munaf Patel"
                        company="Patel Infra"
                        service="Digital Marketing"
                        status="NEGOTIATION"
                        interaction={{
                            type: "NOTE",
                            title: "Client requested marketing automation",
                            time: "Yesterday",
                            user: "Saransh"
                        }}
                    />

                </div>

                <StatsPanel />

            </div>

        </div>
    )
}
