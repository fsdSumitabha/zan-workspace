import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { SignJWT } from "jose"
import { cookies } from "next/headers"

import dbConnect from "@/lib/db/dbConnect"
import User from "@/models/User"
import { runWithoutRegionScope } from "@/lib/region-scope"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)

export async function POST(req: NextRequest) {
    try {
        await dbConnect()

        const body = await req.json().catch(() => null)

        // 1. Validate body existence
        if (!body) {
            return NextResponse.json(
                { success: false, message: "Invalid JSON body" },
                { status: 400 }
            )
        }

        const { email, password } = body

        // 2. Validate required fields
        if (!email || !password) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Email and password are required"
                },
                { status: 400 }
            )
        }

        // 3. Normalize email
        const normalizedEmail = String(email).toLowerCase().trim()

        // 4. Find user (deletedAt already handled by pre hook)
        //
        // Outside the region scope. Nobody is signed in yet, so there is
        // no scope to filter by. Without the bypass every login would be
        // denied. The lookup is by email only and the result is checked
        // against a password before anything is returned.
        const user = await runWithoutRegionScope(() =>
            User.findOne({ email: normalizedEmail })
        )

        // 5. User not found
        if (!user) {
            return NextResponse.json(
                { success: false, message: "Invalid credentials" },
                { status: 401 }
            )
        }

        // 6. Check if inactive
        if (!user.isActive) {
            return NextResponse.json(
                { success: false, message: "Account is deactivated" },
                { status: 403 }
            )
        }

        // 7. Compare password
        const isMatch = await bcrypt.compare(password, user.password)

        if (!isMatch) {
            return NextResponse.json(
                { success: false, message: "Invalid credentials" },
                { status: 401 }
            )
        }

        // 8. Create JWT
        // A Mongoose array is an Array subclass carrying internal state, and
        // jose runs structuredClone on the payload, which cannot clone it.
        // Array.from gives a plain array. Do this for anything leaving
        // Mongoose for a library that clones or serialises.
        const regions = Array.from(user.regions ?? []).map(String)

        // `regions` rides along for src/proxy.ts, which runs at the edge
        // and cannot read the database. API routes ignore this copy and
        // read the user row instead, so revoking a region takes effect at
        // once rather than when the 7-day token expires.
        const token = await new SignJWT({
            userId: user._id.toString(),
            role: user.role,
            regions
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("7d")
            .sign(JWT_SECRET)

        // 9. Set cookie
        const cookieStore = await cookies()

        cookieStore.set("auth_token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7
        })

        // 10. Update last login
        //
        // validateModifiedOnly, because a plain save() validates every path
        // on the document. lastLoginAt is a side effect of signing in. It
        // must never be the reason a sign-in fails, and without this flag any
        // required field added later would lock out every row that predates
        // it. That is exactly what the new `regions` validator did.
        user.lastLoginAt = new Date()
        await user.save({ validateModifiedOnly: true })

        // 11. Return success (NO password)
        return NextResponse.json(
            {
                success: true,
                message: "Login successful",
                data: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    regions: user.regions ?? []
                }
            },
            { status: 200 }
        )
    } catch (error) {
        console.error("LOGIN_ERROR:", error)

        return NextResponse.json(
            {
                success: false,
                message: "Internal server error"
            },
            { status: 500 }
        )
    }
}