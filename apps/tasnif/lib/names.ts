import type { Dictionary, Locale } from "@/lib/i18n"
import type { Kind, LocalizedName } from "@/lib/types"

/*
 * How catalog names are shown. Plain functions, not a client module, so server
 * pages (a code's own page) and client components (search results) share them.
 */

/**
 * Names come from the official catalog, which has Russian and Uzbek but no
 * English. When the interface language has no official name, the Russian one
 * is shown in italics, per DESIGN.md: a visible hint, never a silent fallback.
 */
export function localized(name: LocalizedName, locale: Locale): { text: string; fallback: boolean } {
  if (locale === "uz" && name.uzLatn) return { text: name.uzLatn, fallback: false }
  return { text: name.ru, fallback: locale !== "ru" }
}

/**
 * Group names arrive in capitals ("УСЛУГИ ПО РАЗМЕЩЕНИЮ И ОРГАНИЗАЦИИ ПИТАНИЯ", and
 * "TURARJOY VA OVQATLANISh XIZMATLARI" with a stray lowercase digraph). In a
 * breadcrumb, shouting reads like an error, so mostly-capital names are shown in
 * sentence case. Only the display changes.
 */
export function readable(text: string) {
  const letters = text.match(/\p{L}/gu) ?? []
  const capitals = letters.filter((letter) => letter !== letter.toLowerCase()).length
  if (letters.length < 4 || capitals / letters.length < 0.8) return text
  const lower = text.toLocaleLowerCase()
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1)
}

export function kindLabel(kind: Kind, t: Dictionary) {
  return { goods: t.result.kindGoods, service: t.result.kindService, catering: t.result.kindCatering }[kind]
}
