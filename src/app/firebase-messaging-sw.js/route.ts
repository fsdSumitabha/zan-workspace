import { SDK_VERSION } from "firebase/app"
import { firebaseConfig } from "@/lib/firebase/firebase"

/**
 * The push service worker. Firebase looks for it at /firebase-messaging-sw.js.
 *
 * It is a route, not a file in /public, so it can read the Firebase config
 * from .env. It also loads the same Firebase version as the npm package.
 *
 * It shows a system notification only when no CRM tab is open on screen.
 * When a tab is open, Firebase passes the message to that tab instead
 * (see PushListener).
 */
export function GET() {
    const script = `
importScripts("https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-messaging-compat.js");

firebase.initializeApp(${JSON.stringify(firebaseConfig)});
const messaging = firebase.messaging();

// The server sends data only: title, body and url.
messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    return self.registration.showNotification(data.title || "Zan CRM", {
        body: data.body,
        icon: "/icon-192.png",
        data: { url: data.url || "/admin/operations/notifications" },
    });
});

// Open the page the notification is about. Reuse an open CRM tab if there is one.
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification.data?.url || "/admin/operations/notifications";

    event.waitUntil((async () => {
        const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const tab = tabs.find((t) => new URL(t.url).pathname.startsWith("/admin/operations"));
        if (tab) {
            await tab.focus();
            tab.postMessage({ type: "open-url", url });   // PushListener moves the tab to the page
            return;
        }
        await self.clients.openWindow(url);
    })());
});
`

    return new Response(script.trimStart(), {
        headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-cache",
        },
    })
}
