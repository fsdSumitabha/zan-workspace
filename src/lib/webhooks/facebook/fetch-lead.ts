import type { GraphApiLeadResponse } from "@/types/facebook/facebook-leads"

export async function fetchFacebookLead(leadgenId: string) {
    const token = process.env.META_PAGE_TOKEN
    if (!token) throw new Error("META_PAGE_TOKEN not set")

    const url = `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${token}`
    const res = await fetch(url, { cache: "no-store" })

    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Graph API error ${res.status}: ${err}`)
    }

    const data = (await res.json()) as GraphApiLeadResponse

    // field_data is an array of { name, values[] } — flatten into a map
    const fields: Record<string, string> = {}
    for (const f of data.field_data) {
        fields[f.name] = f.values?.[0] ?? ""
    }

    return {
        id: data.id,
        createdTime: data.created_time,
        adId: data.ad_id,
        formId: data.form_id,
        fields, // e.g. { full_name: "...", email: "...", phone_number: "..." }
    }
}