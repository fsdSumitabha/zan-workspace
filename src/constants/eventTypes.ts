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

/**
 * Name → code lookup. Built manually because `invert(EVENT_TYPE)` would
 * stringify numeric keys ("1000") which then breaks `switch (type)` in
 * the renderer (strict equality against number literals).
 */
export const EVENT_CODE = Object.fromEntries(
    Object.entries(EVENT_TYPE).map(([k, v]) => [v, Number(k)])
) as Record<EventName, EventType>;