import type { Locale } from "@/lib/i18n"

/**
 * The shared catalogue (lib/i18n) carries the audit screen's title, subtitle,
 * export label and empty state — but no column heads. Rather than ship an
 * English "Tool" into an Uzbek table, or an unlabelled column, the four missing
 * heads live here in all three languages.
 *
 * These are catalogue keys in the wrong file: fold them into `dict.audit` when
 * lib/i18n is free to edit, and delete this module.
 *
 * `agent` and `actor` are deliberately absent — `dict.nav.agents` and
 * `dict.approvals.requestedBy` already say exactly the right thing.
 */
export type AuditColumn = "time" | "tool" | "result" | "duration"

export const AUDIT_COLUMNS: Record<AuditColumn, Record<Locale, string>> = {
  time: { uz: "Vaqt", ru: "Время", en: "Time" },
  tool: { uz: "Vosita", ru: "Инструмент", en: "Tool" },
  result: { uz: "Natija", ru: "Результат", en: "Result" },
  duration: { uz: "Davomiylik", ru: "Длительность", en: "Duration" },
}
