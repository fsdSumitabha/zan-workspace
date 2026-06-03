"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, MoreVertical, User, UserCircle, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function OperationsMobileTopBar() {
    const { user, loading, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [avatarBroken, setAvatarBroken] = useState(false);
    const menuWrapRef = useRef<HTMLDivElement | null>(null);

    const displayName = useMemo(() => {
        if (!user) return "";
        return user.name || user.email || "";
    }, [user]);

    const avatarUrl = user?.avatar?.trim() || "";
    const showAvatarImage = Boolean(avatarUrl) && !avatarBroken;

    useEffect(() => {
        setAvatarBroken(false);
    }, [avatarUrl]);

    useEffect(() => {
        if (!open && !moreOpen) return;

        const onPointerDown = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node | null;
            if (!target) return;

            if (menuWrapRef.current && !menuWrapRef.current.contains(target)) {
                setOpen(false);
                setMoreOpen(false);
            }
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOpen(false);
                setMoreOpen(false);
            }
        };

        document.addEventListener("mousedown", onPointerDown, true);
        document.addEventListener("touchstart", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("mousedown", onPointerDown, true);
            document.removeEventListener("touchstart", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, moreOpen]);

    return (
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-50/90 dark:bg-neutral-950/90 backdrop-blur border-b border-neutral-200 dark:border-neutral-800">
            <div className="h-14 px-3 flex items-center justify-between">
                <Link
                    href="/admin/operations"
                    className="flex items-center gap-2"
                >
                    <Image
                        src="/zan-services-color-logo.png"
                        alt="ZAN CRM Logo"
                        height={26}
                        width={84}
                        priority
                        className="block dark:hidden"
                    />
                    <Image
                        src="/zan-logo-white.png"
                        alt="ZAN CRM Logo"
                        height={26}
                        width={84}
                        priority
                        className="hidden dark:block"
                    />
                </Link>

                <div ref={menuWrapRef} className="flex items-center gap-2">
                    {/* Profile menu */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => {
                                setOpen((v) => !v);
                                if (!open) setMoreOpen(false);
                            }}
                            className="h-9 w-9 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 flex items-center justify-center overflow-hidden text-neutral-700 dark:text-neutral-200"
                            aria-label="Profile menu"
                        >
                            {showAvatarImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={avatarUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    onError={() => setAvatarBroken(true)}
                                />
                            ) : (
                                <User size={18} />
                            )}
                        </button>

                        {open && (
                            <div className="absolute right-0 mt-2 w-56 rounded-lg dark:rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg overflow-hidden">
                                <div className="px-3 py-2">
                                    <div className="text-xs text-neutral-500">
                                        Signed in
                                    </div>
                                    <div className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                                        {loading
                                            ? "Loading..."
                                            : displayName || "Unknown"}
                                    </div>
                                </div>
                                <div className="border-t border-neutral-200 dark:border-neutral-800" />
                                <Link
                                    href="/admin/operations/profile"
                                    onClick={() => setOpen(false)}
                                    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900"
                                >
                                    <UserCircle size={16} />
                                    Profile
                                </Link>
                                <Link
                                    href="/admin/operations/profile/edit"
                                    onClick={() => setOpen(false)}
                                    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900"
                                >
                                    <Pencil size={16} />
                                    Edit profile
                                </Link>
                                <div className="border-t border-neutral-200 dark:border-neutral-800" />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOpen(false);
                                        logout();
                                    }}
                                    disabled={loading || !user}
                                    className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-red-600 dark:text-red-400 disabled:opacity-60"
                                >
                                    <LogOut size={16} />
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>

                    {/* More menu (future overflow nav) */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => {
                                setMoreOpen((v) => !v);
                                if (!moreOpen) setOpen(false);
                            }}
                            className="h-9 w-9 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 flex items-center justify-center"
                            aria-label="More menu"
                        >
                            <MoreVertical
                                size={18}
                                className="text-neutral-700 dark:text-neutral-200"
                            />
                        </button>

                        {moreOpen && (
                            <div className="absolute right-0 mt-2 w-56 rounded-lg dark:rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg overflow-hidden">
                                <Link
                                    href="/admin/operations/meetings"
                                    onClick={() => setMoreOpen(false)}
                                    className="block px-3 py-2 text-sm text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900"
                                >
                                    Meetings
                                </Link>
                                <Link
                                    href="/admin/operations/activity-logs"
                                    onClick={() => setMoreOpen(false)}
                                    className="block px-3 py-2 text-sm text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900"
                                >
                                    Activity Logs
                                </Link>
                                <Link
                                    href="/admin/operations/overall-stats"
                                    onClick={() => setMoreOpen(false)}
                                    className="block px-3 py-2 text-sm text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900"
                                >
                                    Overall Stats
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
