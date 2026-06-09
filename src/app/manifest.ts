import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Zan Services CRM",
        short_name: "Zan CRM",
        description: "Zan Services internal CRM operations platform.",
        start_url: "/",
        display: "standalone",
        background_color: "#183668",
        theme_color: "#183668",
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],

        shortcuts: [
            {
                name: "Leads Pipeline",
                short_name: "Leads",
                description: "View and manage current leads",
                url: "/admin/operations/leads",
                icons: [{ src: "/icons/target.png", sizes: "24x24", type: "image/png" }]
            },
            {
                name: "Client Directory",
                short_name: "Clients",
                description: "View corporate clients",
                url: "/admin/operations/clients",
                icons: [{ src: "/icons/handshake.png", sizes: "24x24", type: "image/png" }]
            },
            {
                name: "Scheduled Meetings",
                short_name: "Meetings",
                description: "View upcoming meetings",
                url: "/admin/operations/meetings",
                icons: [{ src: "/icons/calendar-clock.png", sizes: "24x24", type: "image/png" }]
            }
        ]
    };
}