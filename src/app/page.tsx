import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Home() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
            <main className="w-full max-w-md text-center">
                <div className="mb-2 inline-flex  items-center justify-center rounded-2xl  ">
                    <Image
                        src="/zan-services-color-logo.png"
                        alt="ZAN CRM Logo"
                        height={30}
                        width={90}
                        priority
                        className="block dark:hidden"
                    />

                    {/* Dark Theme Logo */}
                    <Image
                        src="/zan-logo-white.png"
                        alt="ZAN CRM Logo"
                        height={30}
                        width={90}
                        priority
                        className="hidden dark:block"
                    />
                </div>

                <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                    Zan Workspace
                </h1>
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                    Open the operations dashboard or sign in to continue.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Link
                        href="/admin/operations"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
                    >
                        Go to dashboard
                        <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                </div>
            </main>
        </div>
    );
}
