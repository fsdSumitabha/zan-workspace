import "dotenv/config"

import seedLeads from "@/seeder/leadSeeder"
import seedClients from "@/seeder/clientSeeder"
import seedProjects from "@/seeder/projectSeeder"
import seedUsers from "@/seeder/userSeeder"

async function runSeed() {
    try {
        console.log("Seeding Started...")

        await seedUsers()
        await seedLeads()
        await seedClients()
        await seedProjects()

        console.log("Seeding Completed")
        process.exit(0)
    } catch (err) {
        console.error(err)
        process.exit(1)
    }
}

runSeed()