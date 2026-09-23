/**
 * Step 2 of 11. Gives every lead a region.
 *
 *   npx tsx src/scripts/region-migration/02-leads-region.ts
 *   npx tsx src/scripts/region-migration/02-leads-region.ts --apply
 *
 * Every existing lead belongs to the India team, so they all get "IN".
 * Rows that already carry a region are left alone.
 *
 * Soft-deleted leads are included. They still hold a phone number in the
 * unique index, and they are still restorable.
 *
 * Phone numbers are a separate step. See 03-leads-phone.ts.
 */
import { runSetRegion } from "./_setRegion"
import { crash } from "./_shared"

runSetRegion({
    collection: "leads",
    title: "02 — Leads: set region",
    label: "02 leads region",
}).catch(crash)
