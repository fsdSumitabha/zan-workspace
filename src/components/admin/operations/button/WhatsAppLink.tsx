"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";
import { formatPhoneForDisplay, toWhatsAppNumber } from "@/lib/phone";

type WhatsAppLinkProps = {
    phone?: string;
};

function isMobileDevice() {
    if (typeof navigator === "undefined") return false;
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function WhatsAppLink({ phone }: WhatsAppLinkProps) {
    const { phoneCountry } = useRegion();
    const number = toWhatsAppNumber(phone, phoneCountry);

    // No link for a missing or invalid number. A link would open a chat
    // with the wrong person, or with nobody.
    if (!number) {
        return (
            <span
                title={phone ? "This is not a valid phone number" : undefined}
                className="inline-flex items-center gap-2 text-neutral-400 dark:text-neutral-500"
            >
                <MessageCircle size={16} className="shrink-0" />
                <span className="break-all">{phone?.trim() || "N/A"}</span>
            </span>
        );
    }

    const href = isMobileDevice()
        ? `whatsapp://send?phone=${number}`
        : `https://web.whatsapp.com/send?phone=${number}`;

    return (
        <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-green-500 hover:underline"
        >
            <MessageCircle size={16} className="shrink-0" />
            <span className="break-all">{formatPhoneForDisplay(phone, phoneCountry)}</span>
        </Link>
    );
}