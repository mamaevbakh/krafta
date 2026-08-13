"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import type { AuditFilters } from "@/lib/audit"
import type { Dict } from "@/lib/i18n"

/**
 * Filters live in the URL, not in component state.
 *
 * A merchant investigating a complaint ends up sending someone a link, or
 * reloading, or hitting back. Any of those silently resetting the filter turns
 * a two-minute check into a re-run of the whole search. The URL is also what
 * the server reads, so the table and the address bar cannot disagree.
 *
 * `NativeSelect` rather than the styled Select: this bar is dense, sits above
 * a table, and on a phone the OS picker beats a custom popover.
 */
/** The values agent.audit_log.actor_kind is constrained to. */
const ACTOR_KINDS = ["customer", "user", "system"] as const

export function AuditFilterBar({
  dict,
  tools,
  agents,
  selected,
}: {
  dict: Dict
  tools: string[]
  agents: { id: string; name: string }[]
  selected: AuditFilters
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const active =
    Boolean(selected.agentId) ||
    Boolean(selected.tool) ||
    Boolean(selected.actorKind) ||
    Boolean(selected.from) ||
    Boolean(selected.to)

  function apply(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(next.toString() ? `${pathname}?${next}` : pathname)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label={dict.common.agent}
        className="h-8 w-auto min-w-40 text-sm"
        value={selected.agentId ?? ""}
        onChange={(e) => apply("agent", e.target.value)}
      >
        <option value="">{`${dict.common.agent} · ${dict.common.all}`}</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label={dict.audit.tool}
        className="h-8 w-auto min-w-36 font-mono text-xs"
        value={selected.tool ?? ""}
        onChange={(e) => apply("tool", e.target.value)}
      >
        <option value="">{`${dict.audit.tool} · ${dict.common.all}`}</option>
        {tools.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label={dict.approvals.requestedBy}
        className="h-8 w-auto min-w-36 text-sm"
        value={selected.actorKind ?? ""}
        onChange={(e) => apply("actor", e.target.value)}
      >
        <option value="">{`${dict.approvals.requestedBy} · ${dict.common.all}`}</option>
        {ACTOR_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {kind}
          </option>
        ))}
      </NativeSelect>

      <Input
        type="date"
        aria-label={dict.audit.from}
        className="h-8 w-auto font-mono text-xs"
        value={selected.from ?? ""}
        onChange={(e) => apply("from", e.target.value)}
      />
      <Input
        type="date"
        aria-label={dict.audit.to}
        className="h-8 w-auto font-mono text-xs"
        value={selected.to ?? ""}
        onChange={(e) => apply("to", e.target.value)}
      />

      {active ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.replace(pathname)}
          aria-label={dict.common.cancel}
        >
          <X />
          {dict.common.cancel}
        </Button>
      ) : null}
    </div>
  )
}
