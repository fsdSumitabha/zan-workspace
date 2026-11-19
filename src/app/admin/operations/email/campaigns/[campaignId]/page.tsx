import CampaignDetailClient from "./CampaignDetailClient"

export default async function Page({
    params,
}: {
    params: Promise<{ campaignId: string }>
}) {
    const { campaignId } = await params
    return <CampaignDetailClient campaignId={campaignId} />
}
