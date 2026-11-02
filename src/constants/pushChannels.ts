import { EVENT_CODE, type EventType } from "./eventTypes"

/**
 * How loud a push channel is.
 *
 * Android fixes it when the phone app creates the channel. After that, only
 * the user can change it, in system Settings. iOS has no channels, so the
 * server sends the level with each message (see sendPush.ts).
 */
export const PUSH_LEVEL = {
    /** Sound, and the notification pops up over the screen. */
    URGENT: 10,
    /** Sound, no pop-up. */
    DEFAULT: 20,
    /** No sound. It shows in the notification list only. No channel uses it today. */
    SILENT: 30,
} as const

export type PushLevel =
    (typeof PUSH_LEVEL)[keyof typeof PUSH_LEVEL]

/** Headings that sort the channels in Android's notification settings. */
export const PUSH_CHANNEL_GROUP = {
    CALLS: 10,
    PIPELINE: 20,
    TEAM: 30,
} as const

export type PushChannelGroup =
    (typeof PUSH_CHANNEL_GROUP)[keyof typeof PUSH_CHANNEL_GROUP]

export const PUSH_CHANNEL_GROUP_META: Record<
    PushChannelGroup,
    { id: string; label: string }
> = {
    10: { id: "calls", label: "Calls and meetings" },
    20: { id: "pipeline", label: "Pipeline" },
    30: { id: "team", label: "Team activity" },
}

/**
 * The kinds of push notification. On Android, each one is a notification
 * channel that the user can turn off or change in system Settings.
 *
 * `id` is the Android channel id and the iOS thread id. Android keeps the
 * user's choices under that id, so never change or reuse one. The same rule
 * applies to the codes.
 *
 * CALLBACKS comes from the phone itself: the app schedules the reminder.
 * The server sends to every other channel.
 */
export const PUSH_CHANNEL = {
    CALLBACKS: 10,
    MEETINGS: 20,
    NEW_LEADS: 30,
    NEW_RECORDS: 40,
    QUOTATIONS: 50,
    STAGE_CHANGES: 60,
    NOTES: 70,
    LOGGED_CALLS: 80,
    DOCUMENTS: 90,
    /** Test pushes, and events with no channel below. */
    GENERAL: 100,
} as const

export type PushChannel =
    (typeof PUSH_CHANNEL)[keyof typeof PUSH_CHANNEL]

export const PUSH_CHANNEL_META: Record<
    PushChannel,
    { id: string; label: string; description: string; level: PushLevel; group?: PushChannelGroup }
> = {
    10: {
        id: "callbacks",
        label: "Callback reminders",
        description: "When a callback you set on a lead source is due.",
        level: PUSH_LEVEL.URGENT,
        group: PUSH_CHANNEL_GROUP.CALLS,
    },
    20: {
        id: "meetings",
        label: "Meeting updates",
        description: "A meeting is scheduled, moved, cancelled, missed or completed.",
        level: PUSH_LEVEL.DEFAULT,
        group: PUSH_CHANNEL_GROUP.CALLS,
    },
    30: {
        id: "new_leads",
        label: "New leads",
        description: "Someone adds a lead, or one comes in from the website, Facebook or the booking page.",
        level: PUSH_LEVEL.URGENT,
        group: PUSH_CHANNEL_GROUP.PIPELINE,
    },
    40: {
        id: "new_records",
        label: "New clients and projects",
        description: "A lead becomes a client, or someone adds a client or project.",
        level: PUSH_LEVEL.URGENT,
        group: PUSH_CHANNEL_GROUP.PIPELINE,
    },
    50: {
        id: "quotations",
        label: "Quotations",
        description: "A quotation is sent to a client.",
        level: PUSH_LEVEL.DEFAULT,
        group: PUSH_CHANNEL_GROUP.PIPELINE,
    },
    60: {
        id: "stage_changes",
        label: "Stage changes",
        description: "A lead, client or project moves to a new stage.",
        level: PUSH_LEVEL.DEFAULT,
        group: PUSH_CHANNEL_GROUP.PIPELINE,
    },
    70: {
        id: "notes",
        label: "Notes",
        description: "Someone adds a note to a lead, client or project.",
        level: PUSH_LEVEL.DEFAULT,
        group: PUSH_CHANNEL_GROUP.TEAM,
    },
    80: {
        id: "logged_calls",
        label: "Logged calls",
        description: "Someone logs a call with a lead or client.",
        level: PUSH_LEVEL.DEFAULT,
        group: PUSH_CHANNEL_GROUP.TEAM,
    },
    90: {
        id: "documents",
        label: "Documents",
        description: "Someone uploads a document to a lead, client or project.",
        level: PUSH_LEVEL.DEFAULT,
        group: PUSH_CHANNEL_GROUP.TEAM,
    },
    100: {
        id: "general",
        label: "General",
        description: "Test notifications, and alerts that fit no other channel.",
        level: PUSH_LEVEL.DEFAULT,
    },
}

/**
 * The channel each event's push goes to. An event that is not listed goes to
 * GENERAL. NOTIFICATION_RULES decides who receives the event.
 */
export const PUSH_CHANNEL_BY_EVENT: Partial<Record<EventType, PushChannel>> = {
    [EVENT_CODE.MEETING_SCHEDULED]: PUSH_CHANNEL.MEETINGS,
    [EVENT_CODE.MEETING_RESCHEDULED]: PUSH_CHANNEL.MEETINGS,
    [EVENT_CODE.MEETING_CANCELLED]: PUSH_CHANNEL.MEETINGS,
    [EVENT_CODE.MEETING_MISSED]: PUSH_CHANNEL.MEETINGS,
    [EVENT_CODE.MEETING_COMPLETED]: PUSH_CHANNEL.MEETINGS,

    [EVENT_CODE.LEAD_CREATED]: PUSH_CHANNEL.NEW_LEADS,

    [EVENT_CODE.LEAD_CONVERTED]: PUSH_CHANNEL.NEW_RECORDS,
    [EVENT_CODE.CLIENT_CREATED]: PUSH_CHANNEL.NEW_RECORDS,
    [EVENT_CODE.PROJECT_CREATED]: PUSH_CHANNEL.NEW_RECORDS,

    [EVENT_CODE.QUOTATION_SENT]: PUSH_CHANNEL.QUOTATIONS,

    [EVENT_CODE.LEAD_STATUS_CHANGED]: PUSH_CHANNEL.STAGE_CHANGES,
    [EVENT_CODE.CLIENT_STATUS_CHANGED]: PUSH_CHANNEL.STAGE_CHANGES,
    [EVENT_CODE.PROJECT_STATUS_CHANGED]: PUSH_CHANNEL.STAGE_CHANGES,
    [EVENT_CODE.STATUS_CHANGED]: PUSH_CHANNEL.STAGE_CHANGES,

    [EVENT_CODE.NOTE_ADDED]: PUSH_CHANNEL.NOTES,
    [EVENT_CODE.CALL_MADE]: PUSH_CHANNEL.LOGGED_CALLS,
    [EVENT_CODE.DOCUMENT_UPLOADED]: PUSH_CHANNEL.DOCUMENTS,
}
