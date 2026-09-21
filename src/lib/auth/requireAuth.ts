import { NextRequest } from "next/server"
import { enterAuditContext } from "@/lib/activity-log/auditContext"
import { getUserFromRequest, AuthUser } from "./getUserFromRequest"
import { enterRegionContext } from "@/lib/region-scope"

export class AuthError extends Error {
    statusCode: number

    constructor(message: string, statusCode: number = 401) {
        super(message)
        this.statusCode = statusCode

        // fix prototype chain (important in TS)
        Object.setPrototypeOf(this, AuthError.prototype)
    }
}


export async function requireAuth(req: NextRequest): Promise<AuthUser> {
    const user = await getUserFromRequest(req)

    if (!user) {
        throw new AuthError("You aren't authorized to perform this action.", 401)
    }

    if (!user.isActive) {
        throw new AuthError("Your account is deactivated.", 403)
    }

    enterAuditContext(user.id)

    // Region scope for every query made for the rest of this request.
    // regionScopePlugin reads it. Routes do not have to do anything.
    //
    // writeRegion is what new records get stamped with. It is null when
    // the user holds more than one region, which is the admin case. Those
    // routes have to set `region` themselves, because there is no way to
    // guess which region an admin meant. Once the admin region switch
    // exists, it narrows both fields here and nothing else changes.
    enterRegionContext({
        regions: user.regions,
        writeRegion: user.regions.length === 1 ? user.regions[0] : null,
    })

    if (user.regions.length === 0) {
        console.warn(
            `[region] user ${user.id} has no regions. Every query will return ` +
            "nothing. Run: npm run db:backfill-region"
        )
    }

    return user
}