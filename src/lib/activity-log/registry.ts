import type { EntityType } from "./types"

export interface EntityAuditConfig {
    trackedFields: readonly string[]
    skipFields?: readonly string[]
}

export const ENTITY_AUDIT_CONFIG: Record<EntityType, EntityAuditConfig> = {
    USER: {
        trackedFields: [
            "name",
            "email",
            "role",
            "isActive",
            "avatar",
            "createdBy",
            "deletedAt",
        ],
        skipFields: ["password", "lastLoginAt"],
    },
    LEAD: {
        trackedFields: [
            "name",
            "email",
            "phone",
            "source",
            "status",
            "assignedTo",
            "convertedClientId",
            "lastInteractionAt",
            "lastInteractionId",
            "createdBy",
            "deletedAt",
            "deletedBy",
        ],
    },
    CLIENT: {
        trackedFields: [
            "name",
            "company",
            "email",
            "phone",
            "status",
            "lastInteractionAt",
            "lastInteractionId",
            "createdBy",
        ],
    },
    PROJECT: {
        trackedFields: [
            "clientId",
            "companyName",
            "title",
            "description",
            "serviceType",
            "status",
            "budget",
            "lastInteractionAt",
            "lastInteractionId",
            "createdBy",
        ],
    },
    INTERACTION: {
        trackedFields: [
            "entityType",
            "entityId",
            "type",
            "title",
            "description",
            "refId",
            "createdBy",
        ],
    },
    CALL: {
        trackedFields: [
            "entityType",
            "entityId",
            "contactPersonName",
            "contactPersonPhone",
            "callTime",
            "duration",
            "recordingUrl",
            "notes",
            "direction",
            "status",
            "createdBy",
        ],
    },
    MEETING: {
        trackedFields: [
            "entityType",
            "entityId",
            "title",
            "agenda",
            "description",
            "meetingType",
            "meetingLink",
            "attendees",
            "scheduledAt",
            "status",
            "outcome",
            "createdBy",
        ],
        skipFields: ["rescheduleHistory", "external"],
    },
    DOCUMENT: {
        trackedFields: [
            "clientId",
            "projectId",
            "title",
            "type",
            "url",
            "uploadedBy",
        ],
    },
    QUOTATION: {
        trackedFields: [
            "entityType",
            "entityId",
            "title",
            "amount",
            "gst_percentage",
            "url",
            "status",
            "uploadedBy",
            "createdBy",
        ],
    },
}
