/**
 * lib/catalogs/i18n.ts — locale write router + per-field fallback helpers.
 *
 * Two pieces:
 *
 *   routeLocaleWrite()
 *     Pure function. Decides whether an edit in the active locale should
 *     hit the canonical `items.name` / `items.description` columns
 *     (default locale) or `item_translations.name` / `description`
 *     (non-default locale). Returns a discriminated union the caller
 *     dispatches on. THE bug class this whole file exists to guard
 *     against: silently writing a non-default-locale string into
 *     `items.name`, which corrupts the canonical row and can't be
 *     reverted by git revert (per /plan-eng-review D11 — the only
 *     irreversible bug class in KRA-35 PR 1, which is why this fn
 *     has a vitest test even though everything else in the PR ships
 *     manual-QA-only).
 *
 *   useLocalizedField() / pickLocalizedField()
 *     Per-field fallback per design doc P2 / ER5. When the active locale
 *     lacks a translation for a field, render the default-locale value
 *     with isFallback=true so the consumer can italicize it (visible
 *     hint that the merchant needs to translate). Never silently fall
 *     back without indication.
 *
 * Why this lives in lib/catalogs/i18n.ts, not in the component files:
 * single source of truth for the routing semantics across surfaces.
 * The Library Canvas (PR 2), Inspector (PR 2), Modifier list page
 * (KRA-85), and any future catalog-author surface all flow through
 * this module — change the rules here, every surface picks up.
 *
 * See:
 *   ~/.gstack/projects/mamaevbakh-krafta/bakh-dev-design-20260520-032237.md
 *   — P2 (multi-language editing in v1) + ER5 (useLocalizedField hook)
 *   + D11 (vitest carve-out for the routing function specifically)
 */

import * as React from "react";

// =======================================================================
// Locale write router
// =======================================================================
//
// The router takes the active locale + the catalog's default locale +
// the field being edited, and returns where the WRITE should land. The
// caller (the server action that actually performs the upsert) dispatches
// on `target.kind` and writes to the right table.
//
// CRITICAL: this function is pure (no I/O) and exhaustive (every input
// produces a deterministic target). The vitest carve-out exercises the
// one bug class that can't be reverted: writing UZ into items.name. If
// you change this function's behavior, update the test.

export type LocaleWriteTarget =
  | {
      /** Write to the canonical `items` row column directly. The active
       *  locale is the catalog's default; this IS the canonical value. */
      kind: "items";
      /** Which items column receives the value. */
      column: "name" | "description" | "image_alt";
      /** Value to write (caller passes through). */
      value: string | null;
    }
  | {
      /** Write to the `item_translations` row for this (item_id, locale).
       *  Upsert on (item_id, locale) conflict. */
      kind: "item_translations";
      /** Which item_translations column receives the value. */
      column: "name" | "description" | "image_alt";
      /** The locale this translation row is for (active locale, non-default). */
      locale: string;
      /** Value to write (caller passes through). */
      value: string | null;
    };

export type RouteLocaleWriteParams = {
  /** The locale the merchant is currently editing in (locale tab strip
   *  active tab). */
  activeLocale: string;
  /** The catalog's default locale (from `catalog_locales.is_default=true`).
   *  Equality with activeLocale decides the routing. */
  defaultLocale: string;
  /** Which field is being written. Currently three field types are
   *  routable: name (required), description (optional), image_alt (optional). */
  field: "name" | "description" | "image_alt";
  /** The value the merchant typed. null is allowed for description /
   *  image_alt (means "clear"). For name, callers should reject empty
   *  upstream before reaching this router — this function does not
   *  enforce required-fields. */
  value: string | null;
};

/**
 * routeLocaleWrite — decides where an edit lands.
 *
 * Pure function. Same inputs → same output, no side effects. This is the
 * boundary the bug class lives at: a `kind: "items"` return when
 * activeLocale !== defaultLocale would silently overwrite the canonical
 * row with non-default text. The implementation makes that bug
 * structurally impossible — equality check is the only branch.
 *
 * Locale matching is exact-string (case-sensitive). Callers normalize
 * upstream if needed (e.g. "RU" → "ru"); this function does not
 * lowercase or otherwise transform the inputs because making it forgiving
 * would mask the bug class the test exists to catch.
 */
export function routeLocaleWrite(
  params: RouteLocaleWriteParams,
): LocaleWriteTarget {
  const { activeLocale, defaultLocale, field, value } = params;

  // Defensive: empty active locale would route to items (the equality
  // check below is satisfied if defaultLocale is also empty). Reject.
  if (!activeLocale) {
    throw new Error("routeLocaleWrite: activeLocale must be a non-empty string");
  }
  if (!defaultLocale) {
    throw new Error("routeLocaleWrite: defaultLocale must be a non-empty string");
  }

  if (activeLocale === defaultLocale) {
    return { kind: "items", column: field, value };
  }

  return {
    kind: "item_translations",
    column: field,
    locale: activeLocale,
    value,
  };
}

// =======================================================================
// Per-field read fallback
// =======================================================================
//
// Render path counterpart to the write router. When the merchant is
// looking at a non-default locale tab, fields without a translation row
// fall back to the default-locale canonical value AND surface
// isFallback=true so the consumer can italicize the rendering — visible
// hint that the translation is missing.
//
// Two flavors: a pure function (`pickLocalizedField`) for server-side
// rendering / non-component contexts, and a React hook
// (`useLocalizedField`) for components that already receive translations
// as props.

export type TranslationRow = {
  locale: string;
  name: string | null;
  description: string | null;
  image_alt: string | null;
};

export type ItemDefaults = {
  name: string;
  description: string | null;
  image_alt: string | null;
};

export type LocalizedFieldResult = {
  /** The string to render. Either the active-locale translation or the
   *  default-locale fallback. May be empty if both are empty/null. */
  value: string;
  /** True when the active locale lacks a translation for this field and
   *  the value came from the default-locale row. Consumers render
   *  italicized to hint "missing translation, here's the canonical for
   *  context." Never silently falls back without setting this true. */
  isFallback: boolean;
};

/**
 * pickLocalizedField — pure resolver for one field.
 *
 * Looks up the translation for `activeLocale` in `translations`. If
 * present AND the requested field has a non-empty value on that row,
 * returns that. Otherwise returns the default-locale value from
 * `defaults` with isFallback=true. Empty string and null are treated
 * as "missing" (fall back); explicit empty translation is not preserved
 * because there's no UI distinction between "merchant cleared the field"
 * and "merchant never set it" and the design opted for fallback in
 * either case.
 */
export function pickLocalizedField(params: {
  translations: TranslationRow[];
  defaults: ItemDefaults;
  activeLocale: string;
  defaultLocale: string;
  field: "name" | "description" | "image_alt";
}): LocalizedFieldResult {
  const { translations, defaults, activeLocale, defaultLocale, field } = params;

  // Active = default: serve the canonical value with no fallback marker.
  if (activeLocale === defaultLocale) {
    const canonical = defaults[field] ?? "";
    return { value: canonical, isFallback: false };
  }

  // Active = non-default: look up the translation row.
  const row = translations.find((t) => t.locale === activeLocale);
  const translated = row?.[field];
  if (translated != null && translated !== "") {
    return { value: translated, isFallback: false };
  }

  // No active-locale translation. Fall back to default-locale canonical
  // with isFallback flag set.
  const fallback = defaults[field] ?? "";
  return { value: fallback, isFallback: true };
}

/**
 * useLocalizedField — React hook wrapping pickLocalizedField.
 *
 * Memoized on (translations, defaults, activeLocale, defaultLocale,
 * field) so consumers can call it inside render without re-computing
 * every paint. The translations array reference matters — pass the same
 * filtered subset across renders or wrap in useMemo upstream.
 */
export function useLocalizedField(params: {
  translations: TranslationRow[];
  defaults: ItemDefaults;
  activeLocale: string;
  defaultLocale: string;
  field: "name" | "description" | "image_alt";
}): LocalizedFieldResult {
  const { translations, defaults, activeLocale, defaultLocale, field } = params;
  return React.useMemo(
    () =>
      pickLocalizedField({
        translations,
        defaults,
        activeLocale,
        defaultLocale,
        field,
      }),
    [translations, defaults, activeLocale, defaultLocale, field],
  );
}
