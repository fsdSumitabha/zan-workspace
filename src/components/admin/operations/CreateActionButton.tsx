import Link from "next/link";
import { Plus } from "lucide-react";
import { LucideIcon } from "lucide-react";

type ButtonVariant = "soft" | "primary";

interface CreateActionButtonProps {
    href?: string;
    label?: string;
    icon?: LucideIcon;
    variant?: ButtonVariant;
}

function CreateActionButton({
    href = "/",
    label = "Create",
    icon: Icon = Plus,
    variant = "soft",
}: CreateActionButtonProps) {
    const baseStyles = `
        group w-full flex items-center justify-center gap-2
        px-4 py-3 rounded-2xl
        font-medium
        transition-all duration-200
        active:scale-[0.98]
        focus:outline-none focus:ring-2 focus:ring-blue-500/40
    `;

    const variants: Record<ButtonVariant, string> = {
        soft: `
            bg-white dark:bg-neutral-900
            border border-gray-200 dark:border-neutral-800
            text-gray-800 dark:text-gray-100
            shadow-sm hover:shadow-md
            hover:border-blue-500/50 dark:hover:border-blue-500/50
            hover:bg-blue-50/60 dark:hover:bg-blue-500/10
        `,
        primary: `
            bg-blue-600 hover:bg-blue-500
            text-white
            shadow-sm hover:shadow-lg shadow-blue-600/20
        `,
    };

    return (
        <Link href={href} className={`${baseStyles} ${variants[variant]}`}>
            <div className="
                flex items-center justify-center
                h-8 w-8 rounded-lg
                bg-blue-600/10 dark:bg-blue-500/20
                text-blue-600 dark:text-blue-400
                group-hover:scale-110
                transition
            ">
                <Icon size={16} />
            </div>

            <span>{label}</span>
        </Link>
    );
}

export default CreateActionButton;