import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"

import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

export async function GET(req: NextRequest) {
    try {
        // 1. Get token from cookie
        const token = req.cookies.get("auth_token")?.value

        // 2. No token → not logged in
        if (!token) {
            return NextResponse.json(
                {
                    success: true,
                    data: null
                },
                { status: 200 }
            )
        }

        let payload: any

        try {
            // 3. Verify JWT
            const verified = await jwtVerify(token, JWT_SECRET)
            payload = verified.payload
        } catch {
            // Invalid / expired token
            return NextResponse.json(
                {
                    success: true,
                    data: null
                },
                { status: 200 }
            )
        }

        const userId = payload.userId

        // 4. Missing userId in token
        if (!userId) {
            return NextResponse.json(
                {
                    success: true,
                    data: null
                },
                { status: 200 }
            )
        }

        // 5. Fetch user from DB (source of truth)
        await dbConnect()

        const user = await User.findById(userId).select(
            "_id name email role isActive"
        )

        // 6. User not found / inactive
        if (!user || !user.isActive) {
            return NextResponse.json(
                {
                    success: true,
                    data: null
                },
                { status: 200 }
            )
        }

        // 7. Return user
        return NextResponse.json(
            {
                success: true,
                data: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("AUTH_ME_ERROR:", error)

        return NextResponse.json(
            {
                success: false,
                message: "Internal server error"
            },
            { status: 500 }
        )
    }
}