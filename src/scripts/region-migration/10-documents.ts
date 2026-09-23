/**
 * Step 10 of 11. Gives every document a region.
 *
 *   npx tsx src/scripts/region-migration/10-documents.ts
 *   npx tsx src/scripts/region-migration/10-documents.ts --apply
 *
 * Empty in production today. Run it anyway.
 */
import { runSetRegion } from "./_setRegion"
import { crash } from "./_shared"

runSetRegion({
    collection: "documents",
    title: "10 — Documents: set region",
    label: "10 documents region",
}).catch(crash)
