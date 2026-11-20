"use client"

import { useState } from "react"

/**
 * One button, then a confirmation.
 *
 * Deliberately plain: no CRM chrome, no sidebar, no sign-in. A person who
 * reached this page wants one thing, and anything in the way of it turns
 * into a spam complaint instead.
 *
 * It does not use the app's Tailwind classes for dark mode, because this
 * page is opened from a mail client in whatever browser the reader has,
 * and a half-themed page looks broken. Plain, light, legible.
 */
export default function UnsubscribeClient({ token }: { token: string }) {
    const [state, setState] = useState<"idle" | "working" | "done" | "error">(
        "idle"
    )

    async function unsubscribe() {
        setState("working")

        try {
            const res = await fetch(`/api/e/u/${encodeURIComponent(token)}`, {
                method: "POST",
            })

            // The route answers 200 for everything it can handle, so a
            // non-200 here means the request never arrived.
            setState(res.ok ? "done" : "error")
        } catch {
            setState("error")
        }
    }

    return (
        <div
            /**
             * An explicit white background, not just dark text.
             *
             * The app's global stylesheet turns the page dark when the
             * browser prefers dark, and this page sets its own dark text
             * for a light background. Without the background here the two
             * meet and the text is nearly invisible.
             *
             * It does not follow the reader's theme on purpose. This page
             * is opened from a mail client in whoever's browser, often
             * once, and a half-themed page looks broken at the exact
             * moment somebody is already annoyed enough to unsubscribe.
             */
            style={{
                minHeight: "100vh",
                background: "#ffffff",
                colorScheme: "light",
            }}
        >
        <main
            style={{
                fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
                maxWidth: "32rem",
                margin: "0 auto",
                padding: "4rem 1.25rem",
                color: "#0f172a",
                lineHeight: 1.6,
            }}
        >
            {state === "done" ? (
                <>
                    <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
                        You have been unsubscribed
                    </h1>
                    <p style={{ color: "#475569" }}>
                        You will not receive marketing email from us again. It
                        can take a moment for anything already on its way to
                        stop.
                    </p>
                    <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
                        This does not affect replies to your own messages, or
                        anything to do with work we are already doing for you.
                    </p>
                </>
            ) : state === "error" ? (
                <>
                    <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
                        That did not go through
                    </h1>
                    <p style={{ color: "#475569" }}>
                        Please try once more. If it still does not work, reply
                        to any of our emails and ask to be removed, and we will
                        do it by hand.
                    </p>
                    <button
                        type="button"
                        onClick={unsubscribe}
                        style={buttonStyle}
                    >
                        Try again
                    </button>
                </>
            ) : (
                <>
                    <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
                        Unsubscribe
                    </h1>
                    <p style={{ color: "#475569" }}>
                        Press the button and we will stop sending you marketing
                        email. You do not need an account and we will not ask
                        you why.
                    </p>
                    <button
                        type="button"
                        onClick={unsubscribe}
                        disabled={state === "working"}
                        style={{
                            ...buttonStyle,
                            opacity: state === "working" ? 0.6 : 1,
                        }}
                    >
                        {state === "working"
                            ? "Unsubscribing…"
                            : "Unsubscribe me"}
                    </button>
                </>
            )}
        </main>
        </div>
    )
}

const buttonStyle: React.CSSProperties = {
    marginTop: "1.5rem",
    background: "#059669",
    color: "#ffffff",
    border: 0,
    borderRadius: "0.5rem",
    padding: "0.75rem 1.25rem",
    fontSize: "0.95rem",
    fontWeight: 500,
    cursor: "pointer",
}
