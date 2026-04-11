export enum Service {
    WEB_DEVELOPMENT = 10,
    DIGITAL_MARKETING = 20,
    BLOCKCHAIN = 30,
    MOBILE_APP = 40,
    SEO = 50
}

export type ServiceType = typeof Service[keyof typeof Service]

export const SERVICE_META: Record<
    ServiceType,
    { label: string; color: string }
> = {
    10: { label: "Web Dev", color: "bg-blue-500 text-white" },
    20: { label: "Marketing", color: "bg-pink-500 text-white" },
    30: { label: "Blockchain", color: "bg-purple-500 text-white" },
    40: { label: "Mobile App", color: "bg-green-500 text-white" },
    50: { label: "SEO", color: "bg-yellow-500 text-black" }
}