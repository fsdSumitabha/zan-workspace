/**
 * Cookie that holds this browser's Firebase Installation ID (FID).
 *
 * POST /api/notifications/devices sets it. Logout reads it to stop push
 * alerts on this browser, then deletes it.
 */
export const PUSH_DEVICE_COOKIE = "push_device"
