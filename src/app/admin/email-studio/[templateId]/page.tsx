import EmailStudioClient from "./EmailStudioClient"

export default async function Page({
    params,
}: {
    params: Promise<{ templateId: string }>
}) {
    const { templateId } = await params
    return <EmailStudioClient templateId={templateId} />
}
