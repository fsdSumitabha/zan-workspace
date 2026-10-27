import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getMessaging, type Messaging } from "firebase-admin/messaging"

// Server-only Firebase. It sends push messages with the service account in .env.
// Never import this file in a client component.

function getAdminApp(): App {
    if (getApps().length) return getApp()

    return initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Some hosts store the key on one line, with "\n" text for each line break.
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
    })
}

export function adminMessaging(): Messaging {
    return getMessaging(getAdminApp())
}
