import "dotenv/config"
import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"
import bcrypt from "bcryptjs"

const USERS = [
    {
        name: "Md Nadim Ali",
        email: "operations@zanservices.com",
        password: "Nadmin@123",           // Change this in production!
        role: 10 as const,              // Admin
    },
    {
        name: "SUMAN DAS",
        email: "tech@zanservices.com",
        password: "Suman@123",            // Change this in production!
        role: 80 as const,              // Technical Support
    },
    {
        name: "UDITA DEBROY",
        email: "hr@zanservices.com",
        password: "Udita@123",           // Change this in production!
        role: 20 as const,              // HR
    },
    {
        name: "KARTHIKEYAN GOVINDAN",
        email: "development@zanservices.com",
        password: "Karthik@123",         // Change this in production!
        role: 40 as const,              // Software Developer
    },
    {
        name: "Sumitabha Dandapat",
        email: "fullstackdev@zanservices.com",
        password: "Sumitabha@123",         // Change this in production!
        role: 40 as const,              // Software Developer (Full Stack)
    },
    {
        name: "Saransh Bajpaie",
        email: "marketing@zanservices.com",
        password: "Saransh@123",         // Change this in production!
        role: 50 as const,              // Digital Marketer
    },
    {
        name: "Arpita Polley",
        email: "accountant@zanservices.com",
        password: "Arpita@123",         // Change this in production!
        role: 70 as const,              // Accountant
    },
]

export default async function seedUsers() {
    try {
        await dbConnect()
        console.log("DB Connected (Users)")

        let createdCount = 0

        for (const userData of USERS) {
            // Check if user already exists
            const existingUser = await User.findOne({ email: userData.email })

            if (existingUser) {
                console.log(`User already exists: ${userData.email}`)
                continue
            }

            // Hash password before creating
            const salt = await bcrypt.genSalt(12)
            const hashedPassword = await bcrypt.hash(userData.password, salt)

            const user = await User.create({
                name: userData.name,
                email: userData.email.toLowerCase(),
                password: hashedPassword,
                role: userData.role,
                isActive: true,
                // createdBy: you can set admin user id here if needed
            })

            console.log(`User Created: ${user.name} (${user.email}) - Role: ${user.role}`)
            createdCount++
        }

        console.log(`\nUser Seeding Completed! ${createdCount} new users created.\n`)
    } catch (err) {
        console.error("User Seeder Error:", err)
        throw err
    }
}