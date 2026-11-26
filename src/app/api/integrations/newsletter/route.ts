import { handleIntegrationPost } from "@/lib/integrations/handle"
import { newsletterSchema } from "@/lib/integrations/contract"
import { receiveSignup } from "@/lib/integrations/receiveSignup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/integrations/newsletter
 *
 * Newsletter sign-ups from the websites. Server to server only, with the
 * website's own key. What it saves and why is in
 * src/lib/integrations/receiveSignup.ts; the contract is in
 * docs/website-integrations.md.
 */
export function POST(req: Request) {
    return handleIntegrationPost(req, "newsletter", newsletterSchema, (site, body, actorId) =>
        receiveSignup(site, body, actorId)
    )
}
