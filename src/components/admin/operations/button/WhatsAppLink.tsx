"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

type WhatsAppLinkProps = {
    phone?: string;
};

function formatPhoneNumber(phone: string) {
    let cleaned = phone.replace(/\D/g, "");

    if (cleaned.length === 10) {
        cleaned = "91" + cleaned;
    }

    return cleaned;
}

function isValidPhone(phone: string) {
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.length >= 10 && cleaned.length <= 13;
}

function isMobileDevice() {
    if (typeof navigator === "undefined") return false;
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function WhatsAppLink({ phone }: WhatsAppLinkProps) {
    const formatted = phone ? formatPhoneNumber(phone) : "";

    const href = formatted
        ? isMobileDevice()
            ? `whatsapp://send?phone=${formatted}`
            : `https://web.whatsapp.com/send?phone=${formatted}`
        : "#";

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (!phone) {
            e.preventDefault();
            toast.error("Phone number not available");
            return;
        }

        if (!isValidPhone(phone)) {
            e.preventDefault();
            toast.error("Invalid phone number");
            return;
        }
    };

    return (
        <Link
            href={href}
            onClick={handleClick}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-green-500 hover:underline"
        >
            <MessageCircle size={16} />
            <span>{phone || "N/A"}</span>
        </Link>
    );
}