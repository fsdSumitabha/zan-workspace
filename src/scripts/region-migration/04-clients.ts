/**
 * Step 4 of 11. Gives every client a region.
 *
 *   npx tsx src/scripts/region-migration/04-clients.ts
 *   npx tsx src/scripts/region-migration/04-clients.ts --apply
 *
 * A client normally inherits its region from the lead it was converted from.
 * That only happens at create time. These rows already exist, and every one
 * of them belongs to the India team, so they all get "IN" directly.
 */
import { runSetRegion } from "./_setRegion"
import { crash } from "./_shared"

runSetRegion({
    collection: "clients",
    title: "04 — Clients: set region",
    label: "04 clients region",
}).catch(crash)
