/**
 * Step 6 of 11. Gives every interaction a region.
 *
 *   npx tsx src/scripts/region-migration/06-interactions.ts
 *   npx tsx src/scripts/region-migration/06-interactions.ts --apply
 *
 * This is the largest collection. Interactions normally inherit their region
 * from the parent named by entityType and entityId. These rows already
 * exist, and every parent is an India record, so they all get "IN".
 *
 * Step 11 checks that no interaction ended up in a different region from its
 * parent.
 */
import { runSetRegion } from "./_setRegion"
import { crash } from "./_shared"

runSetRegion({
    collection: "interactions",
    title: "06 — Interactions: set region",
    label: "06 interactions region",
}).catch(crash)
