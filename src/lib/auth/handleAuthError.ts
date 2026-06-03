import { toast } from "sonner"

/** Structural router type — works with `useRouter()` from next/navigation. */
interface AuthRouter {
    replace: (href: string) => void
}

const LOGIN_PATH = "/admin/authentication/login"

/**
 * Shared 401/403 response handling for client-side fetches.
 *
 * - **401**: the proxy normally redirects unauthenticated users to the
 *   login page on navigation, but if the user clears cookies (or the
 *   token simply expires) while a page is already mounted, the proxy
 *   never fires — the SPA gets the 401 from its own fetch. We surface
 *   a toast and replace the route to login. Toast is deduped by id so
 *   parallel fetches don't stack three of them on screen.
 *
 * - **403**: the user is signed in but lacks the role. The page renders
 *   the `AccessDenied` UI — we just forward the server message via the
 *   caller's `onForbidden` setter.
 *
 * Returns `true` if the response was an auth error and was handled
 * (caller should early-return). Otherwise `false` so normal parsing
 * continues.
 */
export function handleAuthError(
    res: Response,
    json: { message?: string } | null,
    router: AuthRouter,
    onForbidden: (msg: string) => void
): boolean {
    if (res.status === 401) {
        toast.error(json?.message || "Session expired. Please log in again.", {
            id: "auth-401",
        })
        router.replace(LOGIN_PATH)
        return true
    }

    if (res.status === 403) {
        onForbidden(
            json?.message || "You aren't authorized to perform this action."
        )
        return true
    }

    return false
}
