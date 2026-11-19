import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Email studio — Zan Services CRM",
}

/**
 * The MJML editor's own layout.
 *
 * It sits outside /admin/operations on purpose. That layout wraps every
 * page in a max-w-7xl three-column grid with a sticky stats rail and a
 * mobile bottom bar. An editor that needs the whole viewport cannot live
 * inside it, and changing the shared layout to make room would affect
 * every other screen in the CRM.
 *
 * src/proxy.ts guards this path with EMAIL_AUTHOR_ROLES, so the route is
 * protected exactly like the operations pages even though it does not
 * share their chrome.
 */
export default function EmailStudioLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-100 dark:bg-neutral-950">
            {children}
        </div>
    )
}
