import { INTERACTION_TYPE } from "./interactionTypes";
import { invert } from "./_invert";

const INTERACTION_EVENTS = invert(INTERACTION_TYPE);

export const EVENT_TYPE = {
    1000: "LEAD_CREATED",
    1010: "LEAD_CONVERTED",
    1020: "LEAD_STATUS_CHANGED",

    1100: "CLIENT_CREATED",
    1110: "CLIENT_STATUS_CHANGED",

    1200: "PROJECT_CREATED",
    1210: "PROJECT_STATUS_CHANGED",

    1500: "INTERACTION_CREATED",
    ...INTERACTION_EVENTS,
} as const;

export type EventType = keyof typeof EVENT_TYPE;
export type EventName = (typeof EVENT_TYPE)[EventType];