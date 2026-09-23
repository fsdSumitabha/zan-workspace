/**
 * Step 9 of 11. Gives every quotation a region.
 *
 *   npx tsx src/scripts/region-migration/09-quotations.ts
 *   npx tsx src/scripts/region-migration/09-quotations.ts --apply
 *
 * Empty in production today. Run it anyway.
 */
import { runSetRegion } from "./_setRegion"
import { crash } from "./_shared"

runSetRegion({
    collection: "quotations",
    title: "09 — Quotations: set region",
    label: "09 quotations region",
}).catch(crash)
