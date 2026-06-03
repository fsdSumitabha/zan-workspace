export const USER_ROLE_META = {
    10: { label: "Admin", description: "Full system access" },
    20: { label: "HR", description: "Manages employees" },
    30: { label: "Project Manager", description: "Oversees projects" },
    40: { label: "Full Stack Developer", description: "Builds product" },
    42: { label: "Blockchain Developer", description: "Develops blockchain applications" },
    45: { label: "Senior Blockchain Developer", description: "Builds blockchain solutions" },
    50: { label: "Digital Marketer", description: "Run digital marketing campaigns" },
    60: { label: "Business Development Executive", description: "Handles leads" },
    70: { label: "Accountant", description: "Manages finances" },
    80: { label: "Technical Support", description: "IT support" },

    90: { label: "System Integration User", description: "Automated user for API-based lead ingestion" }
} as const

export type UserRole = keyof typeof USER_ROLE_META