export type SearchEntity =
    | "LEAD"
    | "CLIENT"
    | "PROJECT"
    | "MEETING"
    | "USER"

export interface SearchHit {
    id: string
    type: SearchEntity
    title: string
    subtitle?: string
    /** Meetings only: the start time as an ISO moment. Shown in the reader's zone. */
    at?: string
    href: string
}

export interface SearchData {
    leads: SearchHit[]
    clients: SearchHit[]
    projects: SearchHit[]
    meetings: SearchHit[]
    users: SearchHit[]
    total: number
}

export interface SearchResponse {
    success: boolean
    data?: SearchData
    message?: string
}
