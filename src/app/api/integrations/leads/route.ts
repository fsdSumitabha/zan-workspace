import { handleIntegrationPost } from "@/lib/integrations/handle"
import { leadSchema } from "@/lib/integrations/contract"
import { receiveLead } from "@/lib/integrations/receiveLead"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/integrations/leads
 *
 * Enquiries from the websites: their contact forms, popups, landing pages,
 * chat assistants and AI agent tools. Server to server only, with the
 * website's own key. What it saves and why is in
 * src/lib/integrations/receiveLead.ts; the contract is in
 * docs/website-integrations.md.
 */
export function POST(req: Request) {
    return handleIntegrationPost(req, "lead", leadSchema, (site, body, actorId) => receiveLead(site, body, actorId))
}
