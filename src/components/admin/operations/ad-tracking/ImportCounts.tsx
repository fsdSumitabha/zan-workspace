"use client"

import type { AdSourceCounts, LeadImportCounts } from "@/constants/adTracking"
import { Tile } from "./bits"

/**
 * The counts of an import, or of the check before it. The five numbers
 * from the plan: rows, imported, duplicates, failed, and new ad records.
 */
export default function ImportCounts({
    counts,
    newSources,
    preview = false,
}: {
    counts: LeadImportCounts
    newSources: AdSourceCounts
    preview?: boolean
}) {
    const totalNew = newSources.campaigns + newSources.adSets + newSources.ads + newSources.forms
    const parts = [
        newSources.campaigns && `${newSources.campaigns} campaign${newSources.campaigns === 1 ? "" : "s"}`,
        newSources.adSets && `${newSources.adSets} ad set${newSources.adSets === 1 ? "" : "s"}`,
        newSources.ads && `${newSources.ads} ad${newSources.ads === 1 ? "" : "s"}`,
        newSources.forms && `${newSources.forms} form${newSources.forms === 1 ? "" : "s"}`,
    ].filter(Boolean)

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Tile label="Rows read" value={counts.read} />
                <Tile
                    label={preview ? "Will import" : "Imported"}
                    value={counts.imported}
                    tone="text-emerald-700 dark:text-emerald-400"
                    hint={counts.warned ? `${counts.warned} of them with warnings` : undefined}
                />
                <Tile
                    label="Duplicates"
                    value={counts.duplicates}
                    tone="text-sky-700 dark:text-sky-400"
                    hint="Already a lead in the CRM, or twice in this file. Not imported again."
                />
                <Tile label={preview ? "Will fail" : "Failed"} value={counts.failed} tone="text-rose-700 dark:text-rose-400" />
                <Tile
                    label="New ad records"
                    value={totalNew}
                    tone="text-indigo-700 dark:text-indigo-400"
                    hint="Campaigns, ad sets, ads and forms seen for the first time. Known ones are reused."
                />
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {counts.warned > 0 && <>{counts.warned} {preview ? "will be" : "were"} imported with warnings. </>}
                {counts.linked > 0 && (
                    <>
                        {counts.linked} of the duplicates had no ad yet and {preview ? "will be" : "were"} linked to the ad on
                        their row.{" "}
                    </>
                )}
                {totalNew > 0
                    ? <>New ad records: {parts.join(", ")}. Records already known are reused, never copied.</>
                    : <>No new ad records.</>}
            </p>
        </div>
    )
}
