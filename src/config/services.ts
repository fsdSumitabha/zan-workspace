export const SERVICES = [
    "Web Development",
    "Digital Marketing",
    "BlockChain",
    "Mobile APP",
    "SEO"
] as const

export type Service = typeof SERVICES[number]