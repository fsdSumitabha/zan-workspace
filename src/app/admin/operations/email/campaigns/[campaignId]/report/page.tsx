import CampaignReportClient from "./CampaignReportClient"

export default async function Page({
    params,
}: {
    params: Promise<{ campaignId: string }>
}) {
    const { campaignId } = await params
    return <CampaignReportClient campaignId={campaignId} />
}
