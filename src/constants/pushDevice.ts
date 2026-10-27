/**
 * Cookie that holds this browser's Firebase Installation ID (FID).
 *
 * POST /api/notifications/devices sets it for browsers only. Logout reads it
 * to stop push alerts on this browser, then deletes it. The phone app gets no
 * cookie. It sends its FID in the DELETE body instead.
 */
export const PUSH_DEVICE_COOKIE = "push_device"

/**
 * What kind of app a push device is. A browser sends no platform and is saved
 * as WEB. The phone app sends ANDROID or IOS.
 */
export const PUSH_PLATFORM = {
    WEB: 10,
    ANDROID: 20,
    IOS: 30,
} as const

export type PushPlatform =
    (typeof PUSH_PLATFORM)[keyof typeof PUSH_PLATFORM]
