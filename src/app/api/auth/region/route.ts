import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

import { requireAuth, AuthError } from "@/lib/auth/requireAuth"
import {
    ACTIVE_REGION_COOKIE,
    narrowToActiveRegion,
    isSelectableRegion,
} from "@/lib/region-scope"
import { ALL_REGIONS } from "@/lib/region"

/**
 * POST /api/auth/region   { "region": "US" }  or  { "region": "ALL" }
 *
 * Pins the session to one region, or restores every region the account holds.
 * No sign-out, no new token: `requireAuth` reads this cookie on the next
 * request and narrows the region scope from it.
 *
 * "ALL" clears the cookie rather than storing a value, so the default is
 * always "whatever the account holds today". An account that gains a region
 * later picks it up with no action from the user.
 *
 * The cookie only ever narrows, so there is nothing here that can widen
 * access. The check below exists to fail loudly on a bad request, not to
 * protect the data — `narrowToActiveRegion` ignores anything it does not
 * recognise.
 */
export async function POST(req: NextRequest) {
    try {
        const user = await requireAuth(req)

        const body = await req.json().catch(() => null)
        const requested = body?.region

        if (!isSelectableRegion(requested, user.regions)) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        `You cannot switch to that region. Your account covers: ` +
                        `${user.regions.join(", ") || "none"}.`,
                    field: "region",
                },
                { status: 403 }
            )
        }

        const code = String(requested).trim().toUpperCase()
        const cookieStore = await cookies()

        if (code === ALL_REGIONS) {
            cookieStore.delete(ACTIVE_REGION_COOKIE)
        } else {
            cookieStore.set(ACTIVE_REGION_COOKIE, code, {
                httpOnly: true,
                secure: true,
                sameSite: "lax",
                path: "/",
                maxAge: 60 * 60 * 24 * 7,
            })
        }

        // Report the result rather than echoing the request, so the UI cannot
        // drift from what the next request will actually do.
        const selection = narrowToActiveRegion(
            code === ALL_REGIONS ? null : code,
            user.regions
        )

        return NextResponse.json({
            success: true,
            data: {
                active: selection.active,
                regions: user.regions,
            },
        })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json(
                { success: false, message: error.message },
                { status: error.statusCode }
            )
        }

        console.error("REGION_SWITCH_ERROR:", error)

        return NextResponse.json(
            { success: false, message: "Failed to switch region" },
            { status: 500 }
        )
    }
}
