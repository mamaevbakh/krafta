/**
 * use-localized-item-fields.ts — small shared helper to dedupe the
 * pickLocalizedField boilerplate every card variant needs.
 *
 * Despite the `use` prefix (kept for visual consistency with React hooks
 * elsewhere in the codebase), this is a PURE function — no useMemo, no
 * useState — so it's safe to call from RSC cards as well as client
 * variants. It just batches the three field lookups (name, description,
 * image_alt) into one call site so each card variant stays readable.
 *
 * See lib/catalogs/i18n.ts for the underlying pickLocalizedField helper
 * and the fallback semantics it implements.
 */
import { pickLocalizedField } from "@/lib/catalogs/i18n";
import type { PublicItem } from "@/lib/catalogs/types";

type LocaleArgs = {
  activeLocale: string;
  defaultLocale: string;
};

export function useLocalizedItemFields(
  item: PublicItem,
  { activeLocale, defaultLocale }: LocaleArgs,
): { name: string; description: string | null; imageAlt: string | null } {
  const defaults = {
    name: item.name,
    description: item.description,
    image_alt: item.image_alt,
  };

  const name = pickLocalizedField({
    translations: item.translations,
    defaults,
    activeLocale,
    defaultLocale,
    field: "name",
  }).value;

  const descriptionField = pickLocalizedField({
    translations: item.translations,
    defaults,
    activeLocale,
    defaultLocale,
    field: "description",
  }).value;

  const imageAltField = pickLocalizedField({
    translations: item.translations,
    defaults,
    activeLocale,
    defaultLocale,
    field: "image_alt",
  }).value;

  // Empty string from the helper means "no value" (both translation and
  // default are missing). Cards check for truthiness before rendering the
  // description / using image_alt, so collapse "" back to null here.
  return {
    name,
    description: descriptionField || null,
    imageAlt: imageAltField || null,
  };
}
