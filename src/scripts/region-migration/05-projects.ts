/**
 * Step 5 of 11. Gives every project a region.
 *
 *   npx tsx src/scripts/region-migration/05-projects.ts
 *   npx tsx src/scripts/region-migration/05-projects.ts --apply
 *
 * A project normally inherits its region from its client. That only happens
 * at create time, so these existing rows are set directly to "IN".
 */
import { runSetRegion } from "./_setRegion"
import { crash } from "./_shared"

runSetRegion({
    collection: "projects",
    title: "05 — Projects: set region",
    label: "05 projects region",
}).catch(crash)
