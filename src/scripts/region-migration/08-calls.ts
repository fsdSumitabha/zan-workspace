/**
 * Step 8 of 11. Gives every call a region.
 *
 *   npx tsx src/scripts/region-migration/08-calls.ts
 *   npx tsx src/scripts/region-migration/08-calls.ts --apply
 *
 * This collection is empty in production today. The script still runs, so
 * that it is not forgotten if rows appear before the deploy.
 */
import { runSetRegion } from "./_setRegion"
import { crash } from "./_shared"

runSetRegion({
    collection: "calls",
    title: "08 — Calls: set region",
    label: "08 calls region",
}).catch(crash)
