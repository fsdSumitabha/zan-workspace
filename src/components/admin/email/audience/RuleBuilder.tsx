"use client"

import clsx from "clsx"
import { Target, Handshake, Contact, ClipboardList, Ban } from "lucide-react"

import { LEAD_STATUS_META } from "@/constants/leadStatus"
import { CLIENT_STATUS_META } from "@/constants/clientStatus"

/**
 * The visual rule builder. Nobody writes a query.
 *
 * Each group maps to one field of the closed rule shape the server knows.
 * The component never builds a filter; it only ever produces the same
 * plain object that EmailAudience stores, which parseRules.ts then checks
 * again on the server.
 */

export interface RuleState {
    leads?: {
        all?: boolean
        status?: number[]
        source?: string[]
        assignedTo?: string[]
    }
    clients?: {
        all?: boolean
        status?: number[]
    }
    contacts?: {
        all?: boolean
        tags?: string[]
    }
    manual?: string[]
    exclude?: { emails?: string[] }
}

export interface BuilderOptions {
    leadSources: string[]
    assignees: Array<{ _id: string; name: string }>
    contactTags: string[]
}

export default function RuleBuilder({
    rules,
    options,
    onChange,
    disabled,
}: {
    rules: RuleState
    options: BuilderOptions
    onChange: (rules: RuleState) => void
    disabled?: boolean
}) {
    function update(patch: Partial<RuleState>) {
        onChange({ ...rules, ...patch })
    }

    /** Adds or removes one value from a list, without mutating. */
    function toggle<T>(list: T[] | undefined, value: T): T[] {
        const current = list ?? []
        return current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value]
    }

    const leadStatuses = Object.entries(LEAD_STATUS_META).map(([code, meta]) => ({
        code: Number(code),
        label: (meta as { label: string }).label,
    }))

    const clientStatuses = Object.entries(CLIENT_STATUS_META).map(
        ([code, meta]) => ({
            code: Number(code),
            label: (meta as { label: string }).label,
        })
    )

    return (
        <div className="space-y-3">
            {/* ---------------- Leads ---------------- */}
            <Group
                icon={<Target size={15} />}
                title="Leads"
                enabled={Boolean(rules.leads)}
                onToggle={(on) => update({ leads: on ? { all: true } : undefined })}
                disabled={disabled}
            >
                <Scope
                    all={rules.leads?.all ?? false}
                    onAll={(all) =>
                        update({
                            leads: all
                                ? { all: true }
                                : { all: false, status: [], source: [], assignedTo: [] },
                        })
                    }
                    allLabel="Every lead"
                    someLabel="Only leads that match"
                    disabled={disabled}
                />

                {!rules.leads?.all && (
                    <div className="space-y-2.5 pt-1">
                        <ChipRow
                            label="Status"
                            options={leadStatuses.map((s) => ({
                                value: s.code,
                                label: s.label,
                            }))}
                            selected={rules.leads?.status ?? []}
                            onToggle={(v) =>
                                update({
                                    leads: {
                                        ...rules.leads,
                                        status: toggle(rules.leads?.status, v),
                                    },
                                })
                            }
                            disabled={disabled}
                        />

                        {options.leadSources.length > 0 && (
                            <ChipRow
                                label="Source"
                                options={options.leadSources.map((s) => ({
                                    value: s,
                                    label: s,
                                }))}
                                selected={rules.leads?.source ?? []}
                                onToggle={(v) =>
                                    update({
                                        leads: {
                                            ...rules.leads,
                                            source: toggle(rules.leads?.source, v),
                                        },
                                    })
                                }
                                disabled={disabled}
                            />
                        )}

                        {options.assignees.length > 0 && (
                            <ChipRow
                                label="Assigned to"
                                options={options.assignees.map((a) => ({
                                    value: a._id,
                                    label: a.name,
                                }))}
                                selected={rules.leads?.assignedTo ?? []}
                                onToggle={(v) =>
                                    update({
                                        leads: {
                                            ...rules.leads,
                                            assignedTo: toggle(
                                                rules.leads?.assignedTo,
                                                v
                                            ),
                                        },
                                    })
                                }
                                disabled={disabled}
                            />
                        )}

                        <p className="text-[11px] text-slate-500 dark:text-neutral-500">
                            Picking nothing in a row means that row is ignored.
                            Picking several means any of them.
                        </p>
                    </div>
                )}
            </Group>

            {/* ---------------- Clients ---------------- */}
            <Group
                icon={<Handshake size={15} />}
                title="Clients"
                enabled={Boolean(rules.clients)}
                onToggle={(on) =>
                    update({ clients: on ? { all: true } : undefined })
                }
                disabled={disabled}
            >
                <Scope
                    all={rules.clients?.all ?? false}
                    onAll={(all) =>
                        update({
                            clients: all ? { all: true } : { all: false, status: [] },
                        })
                    }
                    allLabel="Every client"
                    someLabel="Only clients that match"
                    disabled={disabled}
                />

                {!rules.clients?.all && (
                    <div className="pt-1">
                        <ChipRow
                            label="Status"
                            options={clientStatuses.map((s) => ({
                                value: s.code,
                                label: s.label,
                            }))}
                            selected={rules.clients?.status ?? []}
                            onToggle={(v) =>
                                update({
                                    clients: {
                                        ...rules.clients,
                                        status: toggle(rules.clients?.status, v),
                                    },
                                })
                            }
                            disabled={disabled}
                        />
                    </div>
                )}
            </Group>

            {/* ---------------- Contacts ---------------- */}
            <Group
                icon={<Contact size={15} />}
                title="Imported contacts"
                enabled={Boolean(rules.contacts)}
                onToggle={(on) =>
                    update({ contacts: on ? { all: true } : undefined })
                }
                disabled={disabled}
            >
                <Scope
                    all={rules.contacts?.all ?? false}
                    onAll={(all) =>
                        update({
                            contacts: all ? { all: true } : { all: false, tags: [] },
                        })
                    }
                    allLabel="Every contact"
                    someLabel="Only these tags"
                    disabled={disabled}
                />

                {!rules.contacts?.all && options.contactTags.length > 0 && (
                    <div className="pt-1">
                        <ChipRow
                            label="Tags"
                            options={options.contactTags.map((t) => ({
                                value: t,
                                label: t,
                            }))}
                            selected={rules.contacts?.tags ?? []}
                            onToggle={(v) =>
                                update({
                                    contacts: {
                                        ...rules.contacts,
                                        tags: toggle(rules.contacts?.tags, v),
                                    },
                                })
                            }
                            disabled={disabled}
                        />
                    </div>
                )}

                <p className="pt-1 text-[11px] text-slate-500 dark:text-neutral-500">
                    Contacts without recorded marketing consent are always left
                    out, and the count below says how many.
                </p>
            </Group>

            {/* ---------------- Pasted addresses ---------------- */}
            <Group
                icon={<ClipboardList size={15} />}
                title="Typed or pasted addresses"
                enabled={Boolean(rules.manual)}
                onToggle={(on) => update({ manual: on ? [] : undefined })}
                disabled={disabled}
            >
                <textarea
                    rows={4}
                    disabled={disabled}
                    value={(rules.manual ?? []).join("\n")}
                    onChange={(e) =>
                        update({
                            manual: e.target.value
                                .split(/\n/)
                                .map((v) => v.trim())
                                .filter(Boolean),
                        })
                    }
                    placeholder={"one@example.com\ntwo@example.com"}
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs outline-none transition focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                />
                <p className="text-[11px] text-slate-500 dark:text-neutral-500">
                    One per line, or separated by commas. For a longer list,
                    import it as contacts so there is a record of where it came
                    from.
                </p>
            </Group>

            {/* ---------------- Exclusions ---------------- */}
            <Group
                icon={<Ban size={15} />}
                title="Leave these out"
                enabled={Boolean(rules.exclude)}
                onToggle={(on) =>
                    update({ exclude: on ? { emails: [] } : undefined })
                }
                disabled={disabled}
            >
                <textarea
                    rows={3}
                    disabled={disabled}
                    value={(rules.exclude?.emails ?? []).join("\n")}
                    onChange={(e) =>
                        update({
                            exclude: {
                                emails: e.target.value
                                    .split(/\n/)
                                    .map((v) => v.trim())
                                    .filter(Boolean),
                            },
                        })
                    }
                    placeholder="skip@example.com"
                    className="w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs outline-none transition focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                />
                <p className="text-[11px] text-slate-500 dark:text-neutral-500">
                    People who have unsubscribed are already excluded
                    everywhere. This is for one-off cases.
                </p>
            </Group>
        </div>
    )
}

/* ------------------------------------------------------------------ */

function Group({
    icon,
    title,
    enabled,
    onToggle,
    disabled,
    children,
}: {
    icon: React.ReactNode
    title: string
    enabled: boolean
    onToggle: (on: boolean) => void
    disabled?: boolean
    children: React.ReactNode
}) {
    return (
        <section
            className={clsx(
                "rounded-xl border transition",
                enabled
                    ? "border-emerald-300 bg-white dark:border-emerald-800 dark:bg-neutral-900"
                    : "border-slate-200 bg-slate-50/60 dark:border-neutral-800 dark:bg-neutral-900/40"
            )}
        >
            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
                <input
                    type="checkbox"
                    checked={enabled}
                    disabled={disabled}
                    onChange={(e) => onToggle(e.target.checked)}
                    className="h-4 w-4 accent-emerald-600"
                />
                <span
                    className={clsx(
                        enabled
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-slate-400 dark:text-neutral-600"
                    )}
                >
                    {icon}
                </span>
                <span
                    className={clsx(
                        "text-sm font-medium",
                        enabled
                            ? "text-slate-900 dark:text-white"
                            : "text-slate-500 dark:text-neutral-400"
                    )}
                >
                    {title}
                </span>
            </label>

            {enabled && (
                <div className="space-y-2 border-t border-slate-100 px-3 py-3 dark:border-neutral-800">
                    {children}
                </div>
            )}
        </section>
    )
}

function Scope({
    all,
    onAll,
    allLabel,
    someLabel,
    disabled,
}: {
    all: boolean
    onAll: (all: boolean) => void
    allLabel: string
    someLabel: string
    disabled?: boolean
}) {
    return (
        <div className="flex gap-1">
            {[
                { value: true, label: allLabel },
                { value: false, label: someLabel },
            ].map((option) => (
                <button
                    key={String(option.value)}
                    type="button"
                    disabled={disabled}
                    onClick={() => onAll(option.value)}
                    className={clsx(
                        "flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                        all === option.value
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}

function ChipRow<T extends string | number>({
    label,
    options,
    selected,
    onToggle,
    disabled,
}: {
    label: string
    options: Array<{ value: T; label: string }>
    selected: T[]
    onToggle: (value: T) => void
    disabled?: boolean
}) {
    return (
        <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                {label}
            </div>
            <div className="flex flex-wrap gap-1">
                {options.map((option) => {
                    const on = selected.includes(option.value)
                    return (
                        <button
                            key={String(option.value)}
                            type="button"
                            disabled={disabled}
                            onClick={() => onToggle(option.value)}
                            className={clsx(
                                "max-w-[180px] truncate rounded-md px-2 py-1 text-xs transition",
                                on
                                    ? "bg-emerald-600 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                            )}
                        >
                            {option.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
