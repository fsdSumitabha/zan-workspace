import UnsubscribeClient from "./UnsubscribeClient"

/**
 * The unsubscribe page a person sees.
 *
 * Public, outside /admin, with no session and no chrome. Somebody who
 * clicks unsubscribe in an email is not signed in and should not be asked
 * to be: under the DPDP Act, withdrawing consent must be about as easy as
 * giving it, and a sign-in wall is not that.
 *
 * One button, no questions asked first. The preference options come after
 * the unsubscribe has already been recorded, not before it.
 */
export default async function Page({
    params,
}: {
    params: Promise<{ token: string }>
}) {
    const { token } = await params
    return <UnsubscribeClient token={token} />
}

export const metadata = {
    title: "Unsubscribe",
    // Nothing here should ever appear in a search result.
    robots: { index: false, follow: false },
}
