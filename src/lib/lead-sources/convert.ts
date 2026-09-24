import mongoose, { Types } from "mongoose"
import type { AuthUser } from "@/lib/auth/getUserFromRequest"
import { REGIONS } from "@/lib/region"
import { LEAD_SOURCE_COLUMNS } from "@/config/leadSourceSheet"
import { ENTITY_TYPE } from "@/constants/entityTypes"
import { EVENT_CODE } from "@/constants/eventTypes"
import { INTERACTION_TYPE } from "@/constants/interactionTypes"
import {
    LEAD_SOURCE_ACTIVITY,
    LEAD_SOURCE_STATUS,
    LEAD_SOURCE_STATUS_META,
    type LeadSourceStatus,
} from "@/constants/leadSourceStatus"
import { logEntityChanges } from "@/lib/activity-log"
import { resolveTrackedFields } from "@/lib/activity-log/fieldResolution"
import { toAuditPlain } from "@/lib/activity-log/normalize"
import { DUPLICATE_LEAD_MESSAGE, findLeadPhoneConflict } from "@/lib/leads/findLeadByPhone"
import { emitNotification } from "@/lib/notifications/emit"
import Interaction from "@/models/Interaction"
import Lead from "@/models/Lead"
import LeadSource, { type ILeadSource } from "@/models/LeadSource"
import LeadSourceUpload from "@/models/LeadSourceUpload"
import { findVisibleSource } from "./access"
import { activityEntry } from "./activity"
import { LeadSourceError } from "./http"

/** The `source` text on a Lead created from a lead source. */
export const CONVERTED_LEAD_SOURCE = "Cold Call"

/**
 * Turns a lead source into a real Lead.
 *
 * The Lead gets the name, email, phone and region. Everything else from the
 * sheet, and every note from the calls, goes into the first note on the
 * Lead's timeline. The Lead model has no place for a domain or an address,
 * and nothing learned on the calls should be lost.
 *
 * The Lead, its note and the change to the source are saved in one
 * transaction. The unique index on Lead.phone stops two people converting
 * the same source at once: the second insert fails and nothing is saved.
 */
export async function convertLeadSource(id: string, user: AuthUser): Promise<{ leadId: string }> {
    const source = await findVisibleSource(id, user)

    if (source.status === LEAD_SOURCE_STATUS.CONVERTED || source.convertedLeadId) {
        throw new LeadSourceError("This lead source is already a lead.", 409)
    }

    const { phoneCountry } = REGIONS[source.region]
    const conflict = await findLeadPhoneConflict(source.phone, phoneCountry)
    if (conflict) throw new LeadSourceError(conflict, 409, { field: "phone" })

    const upload = source.uploadId
        ? await LeadSourceUpload.findById(source.uploadId).select("fileName createdAt").lean<{ fileName: string; createdAt: Date }>()
        : null

    const leadId = new Types.ObjectId()
    const noteId = new Types.ObjectId()
    const now = new Date()
    const before = toAuditPlain(source.toObject({ flattenMaps: true }))

    const session = await mongoose.startSession()

    try {
        await session.withTransaction(async () => {
            const lead = new Lead({
                _id: leadId,
                name: source.name,
                email: source.email || undefined,
                phone: source.phone,
                source: CONVERTED_LEAD_SOURCE,
                region: source.region,
                assignedTo: source.assignedTo ?? new Types.ObjectId(user.id),
                createdBy: new Types.ObjectId(user.id),
                lastInteractionAt: now,
                lastInteractionId: noteId,
            })
            lead.$locals._auditUserId = user.id
            await lead.save({ session })

            // The region is set here, not inherited. The plugin reads the
            // parent Lead outside this transaction, where it does not exist
            // yet.
            const note = new Interaction({
                _id: noteId,
                region: source.region,
                entityType: ENTITY_TYPE.LEAD,
                entityId: leadId,
                type: INTERACTION_TYPE.NOTE_ADDED,
                title: "Converted from a lead source",
                description: conversionNote(source, user, upload),
                createdBy: new Types.ObjectId(user.id),
            })
            note.$locals._auditUserId = user.id
            await note.save({ session })

            const result = await LeadSource.updateOne(
                { _id: source._id, status: { $ne: LEAD_SOURCE_STATUS.CONVERTED } },
                {
                    $set: {
                        status: LEAD_SOURCE_STATUS.CONVERTED,
                        convertedLeadId: leadId,
                        convertedAt: now,
                        callbackAt: null,
                        lastActivityAt: now,
                    },
                    $push: {
                        activity: activityEntry(
                            user,
                            LEAD_SOURCE_ACTIVITY.CONVERTED,
                            { from: source.status, to: LEAD_SOURCE_STATUS.CONVERTED },
                            now
                        ),
                    },
                },
                { session }
            )

            if (result.modifiedCount !== 1) {
                throw new LeadSourceError("This lead source is already a lead.", 409)
            }
        })
    } catch (error) {
        if ((error as { code?: number })?.code === 11000) {
            throw new LeadSourceError(DUPLICATE_LEAD_MESSAGE, 409, { field: "phone" })
        }
        throw error
    } finally {
        await session.endSession()
    }

    // The source was changed with updateOne inside the transaction, which the
    // audit helpers cannot join. Log it here, after the commit.
    const after = await LeadSource.findById(source._id).lean()
    if (after) {
        await logEntityChanges({
            entityType: ENTITY_TYPE.LEAD_SOURCE,
            entityId: source._id.toString(),
            userId: user.id,
            before,
            after: toAuditPlain(after),
            fields: resolveTrackedFields(LeadSource.schema, ENTITY_TYPE.LEAD_SOURCE),
        }).catch((error) => console.error("[lead-sources] convert audit failed:", error))
    }

    await emitNotification({
        type: EVENT_CODE.LEAD_CREATED,
        entityType: ENTITY_TYPE.LEAD,
        entityId: leadId,
        actor: { id: user.id, name: user.name, role: user.role },
        payload: { lead: { _id: leadId, name: source.name, source: CONVERTED_LEAD_SOURCE } },
    })

    return { leadId: leadId.toString() }
}

const DATA_SKIP = new Set(["name", "phone", "email"])

function conversionNote(
    source: ILeadSource,
    user: AuthUser,
    upload: { fileName: string; createdAt: Date } | null
): string {
    const lines: string[] = [`Converted from a lead source by ${user.name || user.email || "a user"}.`]

    if (upload) {
        lines.push(
            `Uploaded from ${upload.fileName}` +
                (source.rowNumber ? `, row ${source.rowNumber}` : "") +
                `, on ${upload.createdAt.toISOString().slice(0, 10)}.`
        )
    }

    const data = source.data instanceof Map ? Object.fromEntries(source.data) : (source.data ?? {})
    const known = new Set(LEAD_SOURCE_COLUMNS.map((c) => c.key))
    const details: string[] = []

    for (const column of LEAD_SOURCE_COLUMNS) {
        if (DATA_SKIP.has(column.key)) continue
        const value = data[column.key]
        if (value) details.push(`${column.label}: ${value}`)
    }
    for (const [key, value] of Object.entries(data)) {
        if (!known.has(key) && value) details.push(`${key}: ${value}`)
    }

    if (details.length > 0) {
        lines.push("", "From the sheet:", ...details)
    }

    const notes = source.activity
        .filter((a) => a.text && a.type !== LEAD_SOURCE_ACTIVITY.UPLOADED)
        .slice(-20)
        .map((a) => {
            const status =
                a.type === LEAD_SOURCE_ACTIVITY.STATUS && typeof a.to === "number"
                    ? ` [${LEAD_SOURCE_STATUS_META[a.to as LeadSourceStatus]?.label ?? a.to}]`
                    : ""
            return `${new Date(a.at).toISOString().slice(0, 10)}, ${a.byName || "someone"}${status}: ${a.text}`
        })

    if (notes.length > 0) {
        lines.push("", "Notes from the calls:", ...notes)
    }

    return lines.join("\n")
}
