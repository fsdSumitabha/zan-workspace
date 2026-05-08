export interface LeadgenChangeValue {
    ad_id: string
    form_id: string
    leadgen_id: string
    created_time: number
    page_id: string
    adgroup_id?: string
}

export interface FacebookWebhookPayload {
    object: "page"
    entry: Array<{
        id: string
        time: number
        changes: Array<{
            field: "leadgen" | string
            value: LeadgenChangeValue
        }>
    }>
}

export interface GraphApiLeadResponse {
    id: string
    created_time: string
    ad_id?: string
    form_id?: string
    field_data: Array<{ name: string; values: string[] }>
}