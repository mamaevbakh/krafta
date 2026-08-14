"use client"

import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AuditRow } from "@/lib/audit"

/**
 * Exports exactly the rows on screen — the current filter included.
 *
 * A merchant exports because someone outside the console asked for evidence:
 * an accountant, a customer in a dispute, occasionally a regulator. Silently
 * exporting everything when they had filtered to one day would hand over a
 * different document than the one they were looking at.
 *
 * Built client-side from rows the server already sent. No second endpoint to
 * secure, and nothing leaves the browser.
 */
function toCsv(rows: AuditRow[]): string {
  const header = [
    "time_utc",
    "agent",
    "actor",
    "actor_kind",
    "tool",
    "outcome",
    "result",
    "latency_ms",
    "arguments",
  ]

  // Excel decides a cell is a formula when it starts with = + - @, so a value
  // like "=cmd|..." becomes executable on open. Prefixing with an apostrophe
  // is the standard defence and keeps the text readable.
  const cell = (value: unknown): string => {
    const text =
      value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value)
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }

  const lines = [header.join(",")]
  for (const row of rows) {
    lines.push(
      [
        row.at,
        row.agentName ?? row.agentId ?? "",
        row.actor,
        row.actorKind,
        row.tool,
        row.outcome,
        row.result,
        row.latencyMs ?? "",
        row.args,
      ]
        .map(cell)
        .join(",")
    )
  }
  return lines.join("\n")
}

export function AuditExportButton({
  label,
  rows,
}: {
  label: string
  rows: AuditRow[]
}) {
  function download() {
    // The BOM is what makes Excel read UTF-8 — without it, Uzbek and Russian
    // text in the log opens as mojibake on most Windows machines.
    const blob = new Blob(["﻿", toCsv(rows)], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `krafta-ai-audit-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={download}
      disabled={rows.length === 0}
    >
      <Download />
      {label}
    </Button>
  )
}
