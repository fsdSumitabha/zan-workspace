import { Types } from "mongoose"
import User from "@/models/User"
import { LEAD_SOURCE_ACCESS_ROLES } from "@/constants/leadSourceRoles"
import type { RegionCode } from "@/lib/region"
import { LeadSourceError } from "./http"
import { parseObjectId } from "./access"

export interface ResolvedAssignee {
    _id: Types.ObjectId
    name: string
}

/**
 * The person lead sources are being assigned to, checked.
 *
 * They must be active, have a lead source role, and hold every region the
 * sources are in. Without the region rule a US source could go to someone
 * who can never open it, and it would vanish from every list but a manager's.
 *
 * The User query is also region-scoped for the caller, so a manager cannot
 * pick someone outside their own regions either.
 */
export async function resolveAssignee(
    rawId: unknown,
    regions: RegionCode[]
): Promise<ResolvedAssignee> {
    const _id = parseObjectId(rawId, "user")

    const user = await User.findOne({
        _id,
        isActive: true,
        role: { $in: LEAD_SOURCE_ACCESS_ROLES },
        // In $and so it cannot collide with the region scope's own
        // condition on the same `regions` field.
        $and: [{ regions: { $all: regions } }],
    })
        .select("_id name")
        .lean<{ _id: Types.ObjectId; name: string }>()

    if (!user) {
        throw new LeadSourceError(
            `That person cannot take these lead sources. They must be active, ` +
                `have a lead source role, and cover ${regions.join(" and ")}.`,
            400,
            { field: "assignedTo" }
        )
    }

    return { _id: user._id, name: user.name }
}
