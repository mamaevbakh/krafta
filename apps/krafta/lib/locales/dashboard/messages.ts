/**
 * messages.ts — dashboard message resolution (server-safe, zero React).
 *
 * Mirrors the storefront's lib/locales/messages.ts helper shape so the two
 * systems read the same way. Resolution order: activeLocale → English. There
 * is no per-catalog "default" layer here — the dashboard's fallback is always
 * English (the canonical source), not another merchant-chosen language.
 */

import { DASHBOARD_MESSAGES, type DashboardMessageKey } from "./catalog";
import type { DashboardLocale } from "./locale";

export type { DashboardMessageKey } from "./catalog";

/**
 * Interpolate `{var}` placeholders. Unknown placeholders are left verbatim so
 * a missing var is visible in QA rather than silently blank.
 */
function interpolate(
  template: string,
  vars: Record<string, string | number> | undefined,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * getDashboardMessage — resolve a key to `locale`, falling back to English,
 * with optional `{var}` interpolation.
 *
 * If a key is somehow absent from even the English table, the key string
 * itself is returned so the gap is loud in the UI rather than empty.
 */
export function getDashboardMessage(
  key: DashboardMessageKey,
  locale: DashboardLocale,
  vars?: Record<string, string | number>,
): string {
  const template =
    DASHBOARD_MESSAGES[locale]?.[key] ?? DASHBOARD_MESSAGES.en[key] ?? key;
  return interpolate(template, vars);
}

/** A locale-bound translate function, as handed to components. */
export type TranslateFn = (
  key: DashboardMessageKey,
  vars?: Record<string, string | number>,
) => string;

/** Build a `t()` bound to a single locale. Used by both the server helper and
 *  the client context so call sites read identically on both sides. */
export function createTranslator(locale: DashboardLocale): TranslateFn {
  return (key, vars) => getDashboardMessage(key, locale, vars);
}

// ---------------------------------------------------------------------------
// Pluralization — Intl.PluralRules picks the category (ru has one/few/many,
// en/uz have one/other). Catalog entries live under `{key}.{category}`, with
// the base key as fallback. `count` is interpolated as `{count}`.
// ---------------------------------------------------------------------------

const PLURAL_RULES_CACHE = new Map<string, Intl.PluralRules>();

function getPluralRules(locale: string): Intl.PluralRules {
  let rules = PLURAL_RULES_CACHE.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules("en");
    }
    PLURAL_RULES_CACHE.set(locale, rules);
  }
  return rules;
}

export function getDashboardPlural(
  key: DashboardMessageKey,
  count: number,
  locale: DashboardLocale,
  vars?: Record<string, string | number>,
): string {
  const category = getPluralRules(locale).select(count);
  const suffixed = `${key}.${category}` as DashboardMessageKey;
  const template =
    DASHBOARD_MESSAGES[locale]?.[suffixed] ??
    DASHBOARD_MESSAGES.en[suffixed] ??
    DASHBOARD_MESSAGES[locale]?.[key] ??
    DASHBOARD_MESSAGES.en[key] ??
    key;
  return interpolate(template, { count, ...vars });
}
