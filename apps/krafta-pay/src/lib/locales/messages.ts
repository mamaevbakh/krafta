/**
 * messages.ts — message resolution for the Krafta Pay merchant UI.
 *
 * Mirrors Krafta's `lib/locales/dashboard/messages.ts` so a call site reads the
 * same in both apps. Resolution order: active locale → English. English is the
 * canonical source (it is what the code was written in), so a key missing a
 * translation degrades to English rather than to nothing.
 */

import { PAY_MESSAGES, type PayMessageKey } from "./catalog";
import type { PayLocale } from "./locale";

export type { PayMessageKey } from "./catalog";

/**
 * Interpolate `{var}` placeholders. An unknown placeholder is left verbatim so
 * a missing variable is visible in QA instead of silently rendering blank.
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
 * Resolve a key to `locale`, falling back to English.
 *
 * If a key is absent even from English, the key itself is returned — a loud
 * `onboarding.type.title` in the UI is far easier to catch than an empty span.
 */
export function getPayMessage(
  key: PayMessageKey,
  locale: PayLocale,
  vars?: Record<string, string | number>,
): string {
  const template = PAY_MESSAGES[locale]?.[key] ?? PAY_MESSAGES.en[key] ?? key;
  return interpolate(template, vars);
}

export type TranslateFn = (
  key: PayMessageKey,
  vars?: Record<string, string | number>,
) => string;

/** A `t()` bound to one locale, shared by the server helper and the client
 *  context so both sides render a key identically. */
export function createTranslator(locale: PayLocale): TranslateFn {
  return (key, vars) => getPayMessage(key, locale, vars);
}
