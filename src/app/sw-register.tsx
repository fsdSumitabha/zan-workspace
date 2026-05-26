"use client";

import { useEffect } from "react";

export function SWRegister() {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("/sw.js").catch(() => {
                // registration failed — app still works, just no PWA features
            });
        }
    }, []);

    return null;
}