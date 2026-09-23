/**
 * Step 7 of 11. Gives every meeting a region.
 *
 *   npx tsx src/scripts/region-migration/07-meetings.ts
 *   npx tsx src/scripts/region-migration/07-meetings.ts --apply
 */
import { runSetRegion } from "./_setRegion"
import { crash } from "./_shared"

runSetRegion({
    collection: "meetings",
    title: "07 — Meetings: set region",
    label: "07 meetings region",
}).catch(crash)
