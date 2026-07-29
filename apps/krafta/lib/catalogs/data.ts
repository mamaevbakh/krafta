// lib/catalogs/data.ts
import { cacheTag } from "next/cache";
import type {
  PublicCatalog,
  PublicCatalogCategory,
  PublicCategoryWithItems,
  PublicItem,
  PublicModifier,
  PublicModifierList,
  PublicTax,
  PublicTranslationRow,
} from "./types";
import { groupGalleryByItem } from "./media";

// Catalog locale metadata surfaced from getCatalogLocales so the storefront
// can resolve the active locale + carry the right defaultLocale into
// pickLocalizedField. `enabled` is the merchant's enabled set (used to
// validate a ?lang= request — invalid locales fall back to default) and
// also drives the language switcher in the header.
//
// `display_name` is the human-readable label the switcher shows (the
// merchant set it on `catalog_locales.display_name` from the dashboard —
// e.g. "Русский", "O‘zbekcha"). `text_direction` is "ltr" or "rtl" and
// is reserved for future RTL-aware rendering; it's surfaced here so
// callers don't need a second fetch.
export type PublicCatalogLocaleOption = {
  locale: string;
  display_name: string | null;
  text_direction: "ltr" | "rtl";
  is_default: boolean;
};
export type PublicCatalogLocales = {
  default: string | null;
  enabled: string[];
  /** Full row metadata for each enabled locale, ordered by sort_order
   *  (the same order the dashboard uses). The switcher renders this
   *  array directly; resolveStorefrontLocale only consumes `enabled` +
   *  `default`. */
  options: PublicCatalogLocaleOption[];
};

export type PublicVenue = {
  id: string;
  catalog_id: string;
  org_id: string;
  modes_enabled: string[];
  currency: string;
  timezone: string;
  language_code: string;
  status: "active" | "paused" | "archived";
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing Supabase environment variables.");
}

const supabaseHeaders = {
  apikey: supabasePublishableKey,
  Authorization: `Bearer ${supabasePublishableKey}`,
};

export async function getCatalogBySlug(
  slug: string
): Promise<PublicCatalog | null> {
  "use cache";
  cacheTag(`catalog:${slug}`, "catalogs");

  const url = `${supabaseUrl}/rest/v1/catalogs?slug=eq.${encodeURIComponent(
    slug,
  )}&select=id,slug,name,description,logo_path,org_id,tags,settings_layout,settings_currency,settings_behavior,settings_delivery`;
  const response = await fetch(url, {
    headers: supabaseHeaders,
    next: {
      tags: [`catalog:${slug}`, "catalogs"],
    },
    cache: "force-cache",
  });

  if (!response.ok) return null;
  const data = (await response.json()) as PublicCatalog[];
  const catalog = data[0] ?? null;
  if (catalog?.id) {
    cacheTag(`catalog:${catalog.id}`);
  }
  return catalog;
}

// KRA-98: fetch the catalog meta translation row for a specific locale.
// Returns an empty array when there's no row for that locale yet (the
// storefront then falls back to catalogs.name + catalogs.description via
// pickLocalizedField). Keeps the shape compatible with the i18n helper's
// TranslationRow contract — `image_alt` is always null because catalogs
// don't carry one, but the field is on the union so the resolver can
// query it without branching.
export async function getCatalogMetaTranslation(
  catalogId: string,
  locale: string,
): Promise<Array<{
  locale: string;
  name: string | null;
  description: string | null;
  image_alt: null;
}>> {
  "use cache";
  cacheTag(`catalog:${catalogId}`, `catalog-structure:${catalogId}`);

  const url =
    `${supabaseUrl}/rest/v1/catalog_translations` +
    `?catalog_id=eq.${encodeURIComponent(catalogId)}` +
    `&locale=eq.${encodeURIComponent(locale)}` +
    `&select=locale,name,description`;
  const response = await fetch(url, {
    headers: supabaseHeaders,
    next: {
      tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
    },
    cache: "force-cache",
  });
  if (!response.ok) return [];
  const rows = (await response.json()) as Array<{
    locale: string;
    name: string | null;
    description: string | null;
  }>;
  return rows.map((r) => ({
    locale: r.locale,
    name: r.name,
    description: r.description,
    image_alt: null,
  }));
}

export async function getVenueByCatalogId(
  catalogId: string,
): Promise<PublicVenue | null> {
  "use cache";
  cacheTag(`catalog:${catalogId}`, `venue:catalog:${catalogId}`);

  const url = `${supabaseUrl}/rest/v1/venues?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&select=id,catalog_id,org_id,modes_enabled,currency,timezone,language_code,status&limit=1`;

  const response = await fetch(url, {
    headers: supabaseHeaders,
    next: { tags: [`catalog:${catalogId}`, `venue:catalog:${catalogId}`] },
    cache: "force-cache",
  });

  if (!response.ok) return null;
  const rows = (await response.json()) as PublicVenue[];
  return rows[0] ?? null;
}

// Active taxes + service fees for the catalog, scoped to the v1-supported
// shape (applies_to='all_items', calculation_phase='subtotal'). Both
// inclusion_types are returned: 'additive' fees add to the customer's total,
// 'included' fees are recorded informationally (e.g., UZ VAT baked into menu
// price). Hidden behind the same cache tag as the catalog so merchant edits
// invalidate the customer view.
export async function getCatalogTaxes(
  catalogId: string,
): Promise<PublicTax[]> {
  "use cache";
  cacheTag(`catalog:${catalogId}`, `catalog-taxes:${catalogId}`);

  const url =
    `${supabaseUrl}/rest/v1/taxes?catalog_id=eq.${encodeURIComponent(catalogId)}` +
    `&is_active=eq.true` +
    `&applies_to=eq.all_items` +
    `&calculation_phase=eq.subtotal` +
    `&select=id,name,kind,inclusion_type,percentage,version`;
  const response = await fetch(url, {
    headers: supabaseHeaders,
    next: { tags: [`catalog:${catalogId}`, `catalog-taxes:${catalogId}`] },
    cache: "force-cache",
  });
  if (!response.ok) return [];
  const rows = (await response.json()) as Array<{
    id: string;
    name: string;
    kind: "tax" | "service_fee";
    inclusion_type: "additive" | "included";
    percentage: string | number;
    version: number;
  }>;
  // PostgREST returns numeric as string; normalize to number.
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    inclusion_type: row.inclusion_type,
    percentage: typeof row.percentage === "string" ? Number(row.percentage) : row.percentage,
    version: row.version,
  }));
}

// Returns the enabled locale list + the catalog's default locale. The
// storefront uses this to validate ?lang= against the merchant's enabled
// set: a request for a disabled or unknown locale resolves to the default,
// so we never render junk locale codes the merchant hasn't opted into.
export async function getCatalogLocales(
  catalogId: string,
): Promise<PublicCatalogLocales> {
  "use cache";
  cacheTag(`catalog:${catalogId}`, `catalog-structure:${catalogId}`);

  const url = `${supabaseUrl}/rest/v1/catalog_locales?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_enabled=eq.true&select=locale,is_default,sort_order,display_name,text_direction&order=sort_order.asc`;

  const response = await fetch(url, {
    headers: supabaseHeaders,
    next: { tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`] },
    cache: "force-cache",
  });
  if (!response.ok) return { default: null, enabled: [], options: [] };
  const rows = (await response.json()) as Array<{
    locale: string;
    is_default: boolean;
    display_name: string | null;
    text_direction: string | null;
  }>;
  const enabled = rows.map((r) => r.locale);
  const defaultLocale =
    rows.find((r) => r.is_default)?.locale ?? rows[0]?.locale ?? null;
  // Narrow text_direction to the union the type system expects — the DB
  // CHECK constraint guarantees one of "ltr" / "rtl" but PostgREST surfaces
  // it as plain string.
  const options: PublicCatalogLocaleOption[] = rows.map((r) => ({
    locale: r.locale,
    display_name: r.display_name,
    text_direction: r.text_direction === "rtl" ? "rtl" : "ltr",
    is_default: r.is_default,
  }));
  return { default: defaultLocale, enabled, options };
}

// `activeLocale` (optional) — when provided AND distinct from the catalog's
// default locale, the function also fetches `*_translations` rows for that
// locale and attaches them to each entity as `translations: [...]` (length
// 0 or 1). Storefront components then call pickLocalizedField against
// those rows + the canonical defaults. When omitted (or equal to default),
// no extra translations are fetched — the helper short-circuits to the
// canonical default-locale value.
export async function getCatalogStructure(
  catalogId: string,
  activeLocale?: string,
): Promise<PublicCategoryWithItems[]> {
  "use cache";
  cacheTag(`catalog:${catalogId}`, `catalog-structure:${catalogId}`);

  const localesUrl = `${supabaseUrl}/rest/v1/catalog_locales?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_enabled=eq.true&select=locale,is_default,sort_order&order=sort_order.asc`;
  const categoriesUrl = `${supabaseUrl}/rest/v1/catalog_categories?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=id,slug,name,position&order=position.asc`;
  // Price is sourced from the default item_variations row (Migration 1,
  // ADR 0001 §3.1). We now also pull the FULL set of active variations
  // (id/name/price/ordinal/is_default/is_sold_out) so the storefront's
  // item-detail view can render a customer-facing variation selector.
  // Items with a single variation skip the selector and read price_cents
  // off the default row exactly as before; multi-variation items light
  // the chip group + reactive price.
  //
  // No `is_default=true` filter on the embed any more — the assembly pass
  // below picks the default row for the legacy `price_cents` flatten and
  // emits the full ordinal-sorted array for `variations`.
  const itemsUrl = `${supabaseUrl}/rest/v1/items?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=id,slug,category_id,name,description,image_path,image_alt,position,item_variations(id,name,price_cents,ordinal,is_default,is_sold_out)&item_variations.is_active=eq.true&item_variations.order=ordinal.asc&order=position.asc`;
  // Modifier data: three tables, all denormalize catalog_id so we can fetch
  // each scoped to the active catalog in parallel with the rest of the
  // catalog structure. Assembly into PublicItem.modifier_lists happens below.
  // Fetch ALL active modifier lists for the catalog, not just list-mode.
  // KRA-96 lit up the text-mode (free-text) rendering branch in the
  // picker; without dropping the modifier_type=eq.list filter the data
  // layer would silently exclude text-mode lists and the picker would
  // never see them. text_required + max_length are the schema knobs the
  // text-mode branch reads to enforce the merchant's constraints.
  const modifierListsUrl = `${supabaseUrl}/rest/v1/modifier_lists?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=id,name,modifier_type,min_selected,max_selected,text_required,max_length,version`;
  const modifiersUrl = `${supabaseUrl}/rest/v1/modifiers?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=id,modifier_list_id,name,price_cents,ordinal,on_by_default,version&order=ordinal.asc`;
  const itemModifierListsUrl = `${supabaseUrl}/rest/v1/item_modifier_lists?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=item_id,modifier_list_id,ordinal,min_selected_override,max_selected_override,hidden_from_customer_override&order=ordinal.asc`;

  const [
    localesResponse,
    categoriesResponse,
    itemsResponse,
    modifierListsResponse,
    modifiersResponse,
    itemModifierListsResponse,
  ] = await Promise.all([
    fetch(localesUrl, {
      headers: supabaseHeaders,
      next: {
        tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
      },
      cache: "force-cache",
    }),
    fetch(categoriesUrl, {
      headers: supabaseHeaders,
      next: {
        tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
      },
      cache: "force-cache",
    }),
    fetch(itemsUrl, {
      headers: supabaseHeaders,
      next: {
        tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
      },
      cache: "force-cache",
    }),
    fetch(modifierListsUrl, {
      headers: supabaseHeaders,
      next: {
        tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
      },
      cache: "force-cache",
    }),
    fetch(modifiersUrl, {
      headers: supabaseHeaders,
      next: {
        tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
      },
      cache: "force-cache",
    }),
    fetch(itemModifierListsUrl, {
      headers: supabaseHeaders,
      next: {
        tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
      },
      cache: "force-cache",
    }),
  ]);

  if (!categoriesResponse.ok) return [];
  // The PostgREST fetch doesn't include `translations`/`description` — both
  // are filled in by the assembly pass below. The cast is intentionally
  // narrow to keep the shape honest for the rest of the function.
  const categories = (await categoriesResponse.json()) as Array<
    Omit<PublicCatalogCategory, "translations" | "description">
  >;

  if (!itemsResponse.ok) {
    return categories.map((category) => ({
      ...category,
      items: [],
      translations: [],
    }));
  }
  const itemsRaw = (await itemsResponse.json()) as Array<
    Omit<
      PublicItem,
      "price_cents" | "variations" | "modifier_lists" | "translations" | "images"
    > & {
      item_variations: Array<{
        id: string;
        name: string;
        price_cents: number;
        ordinal: number;
        is_default: boolean;
        is_sold_out: boolean;
      }>;
    }
  >;
  // modifier_lists and translations are filled in below during assembly.
  // `variations` is built here straight from the embed; the legacy
  // `price_cents` flatten finds the default row (falling back to the
  // first ordinal entry — a guard against legacy items where Migration 1
  // didn't run cleanly and no row carries is_default=true).
  //
  // Variation translations are NOT yet plumbed through the public fetch.
  // The merchant workbench supports them (KRA-94 Variations tab), the
  // table exists with anon RLS, but adding a third fetch + per-variation
  // i18n assembly pass is a follow-up. For now `variations[i].translations`
  // ships as [] so storefront callers render the canonical variation name
  // even on RU / UZ. TODO: KRA-XYZ — variation translations on storefront.
  const items: Array<
    Omit<PublicItem, "modifier_lists" | "translations" | "images">
  > = itemsRaw.map(({ item_variations, ...rest }) => {
    const defaultRow =
      item_variations.find((v) => v.is_default) ?? item_variations[0] ?? null;
    return {
      ...rest,
      price_cents: defaultRow?.price_cents ?? 0,
      variations: item_variations.map((v) => ({
        id: v.id,
        name: v.name,
        price_cents: v.price_cents,
        ordinal: v.ordinal,
        is_default: v.is_default,
        is_sold_out: v.is_sold_out,
        translations: [],
      })),
    };
  });

  const locales = localesResponse.ok
    ? ((await localesResponse.json()) as Array<{
        locale: string;
        is_default: boolean;
      }>)
    : [];
  const defaultLocale =
    locales.find((locale) => locale.is_default)?.locale ??
    locales[0]?.locale ??
    null;
  const enabledLocales = new Set(locales.map((l) => l.locale));

  // Resolve the request's active locale against the enabled set. An invalid
  // ?lang= (disabled or unknown) silently degrades to the default — we never
  // render junk codes the merchant hasn't opted into.
  const effectiveActiveLocale =
    activeLocale && enabledLocales.has(activeLocale) ? activeLocale : null;
  // We only need to ship the active-locale translation rows when active is
  // distinct from default. Equal-or-missing → pickLocalizedField short-
  // circuits to the canonical default value carried on the entity itself.
  const wantActiveLocaleData =
    !!effectiveActiveLocale &&
    !!defaultLocale &&
    effectiveActiveLocale !== defaultLocale;

  const categoryIds = categories.map((category) => category.id);
  const itemIds = items.map((item) => item.id);

  // Default-locale legacy fetch: prior to the routeLocaleWrite router in
  // lib/catalogs/i18n.ts, default-locale edits could land in
  // `item_translations` / `catalog_category_translations` rather than the
  // canonical `items` / `catalog_categories` columns. The router fixed
  // that going forward, but historical rows may still exist, so we keep
  // the merge below (translation?.name ?? item.name) as defense-in-depth.
  const defaultCategoryTranslationUrl =
    defaultLocale && categoryIds.length
      ? `${supabaseUrl}/rest/v1/catalog_category_translations?locale=eq.${encodeURIComponent(
          defaultLocale,
        )}&category_id=in.(${categoryIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=category_id,name`
      : null;
  const defaultItemTranslationUrl =
    defaultLocale && itemIds.length
      ? `${supabaseUrl}/rest/v1/item_translations?locale=eq.${encodeURIComponent(
          defaultLocale,
        )}&item_id=in.(${itemIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=item_id,name,description,image_alt`
      : null;
  // Active-locale fetches (when active ≠ default). One per translatable
  // entity kind. Modifier list/modifier ids come from the rows already
  // fetched above — we need to await those JSONs first, but only the IDs
  // matter, so we resolve them inline below.
  const activeCategoryTranslationUrl =
    wantActiveLocaleData && categoryIds.length
      ? `${supabaseUrl}/rest/v1/catalog_category_translations?locale=eq.${encodeURIComponent(
          effectiveActiveLocale!,
        )}&category_id=in.(${categoryIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=category_id,name,description`
      : null;
  const activeItemTranslationUrl =
    wantActiveLocaleData && itemIds.length
      ? `${supabaseUrl}/rest/v1/item_translations?locale=eq.${encodeURIComponent(
          effectiveActiveLocale!,
        )}&item_id=in.(${itemIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=item_id,name,description,image_alt`
      : null;
  const itemMediaUrl =
    itemIds.length
      ? `${supabaseUrl}/rest/v1/item_media?item_id=in.(${itemIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=item_id,storage_path,alt,is_primary,position&order=position.asc,id.asc`
      : null;

  const [
    defaultCategoryTranslationsResponse,
    defaultItemTranslationsResponse,
    activeCategoryTranslationsResponse,
    activeItemTranslationsResponse,
    itemMediaResponse,
  ] = await Promise.all([
    defaultCategoryTranslationUrl
      ? fetch(defaultCategoryTranslationUrl, {
          headers: supabaseHeaders,
          next: {
            tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
          },
          cache: "force-cache",
        })
      : null,
    defaultItemTranslationUrl
      ? fetch(defaultItemTranslationUrl, {
          headers: supabaseHeaders,
          next: {
            tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
          },
          cache: "force-cache",
        })
      : null,
    activeCategoryTranslationUrl
      ? fetch(activeCategoryTranslationUrl, {
          headers: supabaseHeaders,
          next: {
            tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
          },
          cache: "force-cache",
        })
      : null,
    activeItemTranslationUrl
      ? fetch(activeItemTranslationUrl, {
          headers: supabaseHeaders,
          next: {
            tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
          },
          cache: "force-cache",
        })
      : null,
    itemMediaUrl
      ? fetch(itemMediaUrl, {
          headers: supabaseHeaders,
          next: {
            tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
          },
          cache: "force-cache",
        })
      : null,
  ]);

  const categoryTranslations =
    defaultCategoryTranslationsResponse?.ok
      ? ((await defaultCategoryTranslationsResponse.json()) as Array<{
          category_id: string;
          name: string | null;
        }>)
      : [];
  const itemTranslations =
    defaultItemTranslationsResponse?.ok
      ? ((await defaultItemTranslationsResponse.json()) as Array<{
          item_id: string;
          name: string | null;
          description: string | null;
          image_alt: string | null;
        }>)
      : [];
  const activeCategoryTranslations =
    activeCategoryTranslationsResponse?.ok
      ? ((await activeCategoryTranslationsResponse.json()) as Array<{
          category_id: string;
          name: string | null;
          description: string | null;
        }>)
      : [];
  const activeItemTranslations =
    activeItemTranslationsResponse?.ok
      ? ((await activeItemTranslationsResponse.json()) as Array<{
          item_id: string;
          name: string | null;
          description: string | null;
          image_alt: string | null;
        }>)
      : [];
  const itemMedia =
    itemMediaResponse?.ok
      ? ((await itemMediaResponse.json()) as Array<{
          item_id: string;
          storage_path: string;
          alt: string | null;
          is_primary: boolean;
          position: number;
        }>)
      : [];

  const categoryTranslationById = new Map(
    categoryTranslations.map((translation) => [
      translation.category_id,
      translation,
    ]),
  );
  const itemTranslationById = new Map(
    itemTranslations.map((translation) => [translation.item_id, translation]),
  );
  const activeCategoryTranslationById = new Map(
    activeCategoryTranslations.map((t) => [t.category_id, t]),
  );
  const activeItemTranslationById = new Map(
    activeItemTranslations.map((t) => [t.item_id, t]),
  );
  const mediaByItemId = new Map<string, string>();
  itemMedia.forEach((media) => {
    if (media.is_primary && !mediaByItemId.has(media.item_id)) {
      mediaByItemId.set(media.item_id, media.storage_path);
    }
  });
  // Full gallery per item for the detail carousel — main photo first
  // (see groupGalleryByItem for the ordering contract).
  const imagesByItemId = groupGalleryByItem(itemMedia);

  // ---- Modifier assembly ----------------------------------------------------
  // Three flat lists (modifier_lists, modifiers, item_modifier_lists) become a
  // per-item array of PublicModifierList. Overrides on the IML row win over
  // modifier_list defaults; hidden_from_customer_override surfaces to the
  // client as `hidden_from_customer` so the picker can skip rendering while
  // the server still applies on_by_default modifiers from the same list.
  type ModifierListRow = {
    id: string;
    name: string;
    modifier_type: "list" | "text";
    min_selected: number;
    max_selected: number | null;
    text_required: boolean;
    max_length: number | null;
    version: number;
  };
  type ModifierRow = {
    id: string;
    modifier_list_id: string;
    name: string;
    price_cents: number;
    ordinal: number;
    on_by_default: boolean;
    version: number;
  };
  type ItemModifierListRow = {
    item_id: string;
    modifier_list_id: string;
    ordinal: number;
    min_selected_override: number | null;
    max_selected_override: number | null;
    hidden_from_customer_override: boolean;
  };

  const modifierListRows = modifierListsResponse.ok
    ? ((await modifierListsResponse.json()) as ModifierListRow[])
    : [];
  const modifierRows = modifiersResponse.ok
    ? ((await modifiersResponse.json()) as ModifierRow[])
    : [];
  const itemModifierListRows = itemModifierListsResponse.ok
    ? ((await itemModifierListsResponse.json()) as ItemModifierListRow[])
    : [];

  // Second round of active-locale fetches: modifier_list / modifier IDs
  // are only known after the parent fetches above resolve, so they couldn't
  // join the first Promise.all. When the request is in the default locale
  // (or no active locale was set), this batch is skipped entirely.
  const modifierListIds = modifierListRows.map((row) => row.id);
  const modifierIds = modifierRows.map((row) => row.id);

  const activeModifierListTranslationUrl =
    wantActiveLocaleData && modifierListIds.length
      ? `${supabaseUrl}/rest/v1/modifier_list_translations?locale=eq.${encodeURIComponent(
          effectiveActiveLocale!,
        )}&modifier_list_id=in.(${modifierListIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=modifier_list_id,name`
      : null;
  const activeModifierTranslationUrl =
    wantActiveLocaleData && modifierIds.length
      ? `${supabaseUrl}/rest/v1/modifier_translations?locale=eq.${encodeURIComponent(
          effectiveActiveLocale!,
        )}&modifier_id=in.(${modifierIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=modifier_id,name`
      : null;

  const [
    activeModifierListTranslationsResponse,
    activeModifierTranslationsResponse,
  ] = await Promise.all([
    activeModifierListTranslationUrl
      ? fetch(activeModifierListTranslationUrl, {
          headers: supabaseHeaders,
          next: {
            tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
          },
          cache: "force-cache",
        })
      : null,
    activeModifierTranslationUrl
      ? fetch(activeModifierTranslationUrl, {
          headers: supabaseHeaders,
          next: {
            tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
          },
          cache: "force-cache",
        })
      : null,
  ]);

  const activeModifierListTranslations =
    activeModifierListTranslationsResponse?.ok
      ? ((await activeModifierListTranslationsResponse.json()) as Array<{
          modifier_list_id: string;
          name: string | null;
        }>)
      : [];
  const activeModifierTranslations =
    activeModifierTranslationsResponse?.ok
      ? ((await activeModifierTranslationsResponse.json()) as Array<{
          modifier_id: string;
          name: string | null;
        }>)
      : [];

  const activeModifierListTranslationById = new Map(
    activeModifierListTranslations.map((t) => [t.modifier_list_id, t]),
  );
  const activeModifierTranslationById = new Map(
    activeModifierTranslations.map((t) => [t.modifier_id, t]),
  );

  // Helpers wrap an active-locale row into a single-element translations
  // array (length 0 or 1) matching pickLocalizedField's TranslationRow
  // shape. Non-applicable fields are nulled — the helper ignores them.
  const activeLocaleStr = effectiveActiveLocale ?? "";
  function itemTranslationsFor(itemId: string): PublicTranslationRow[] {
    if (!wantActiveLocaleData) return [];
    const row = activeItemTranslationById.get(itemId);
    if (!row) return [];
    return [
      {
        locale: activeLocaleStr,
        name: row.name,
        description: row.description,
        image_alt: row.image_alt,
      },
    ];
  }
  function categoryTranslationsFor(
    categoryId: string,
  ): PublicTranslationRow[] {
    if (!wantActiveLocaleData) return [];
    const row = activeCategoryTranslationById.get(categoryId);
    if (!row) return [];
    return [
      {
        locale: activeLocaleStr,
        name: row.name,
        description: row.description,
        image_alt: null,
      },
    ];
  }
  function modifierListTranslationsFor(
    modifierListId: string,
  ): PublicTranslationRow[] {
    if (!wantActiveLocaleData) return [];
    const row = activeModifierListTranslationById.get(modifierListId);
    if (!row) return [];
    return [
      {
        locale: activeLocaleStr,
        name: row.name,
        description: null,
        image_alt: null,
      },
    ];
  }
  function modifierTranslationsFor(
    modifierId: string,
  ): PublicTranslationRow[] {
    if (!wantActiveLocaleData) return [];
    const row = activeModifierTranslationById.get(modifierId);
    if (!row) return [];
    return [
      {
        locale: activeLocaleStr,
        name: row.name,
        description: null,
        image_alt: null,
      },
    ];
  }

  const modifierListById = new Map(modifierListRows.map((row) => [row.id, row]));
  const modifiersByListId = new Map<string, PublicModifier[]>();
  for (const row of modifierRows) {
    const list = modifiersByListId.get(row.modifier_list_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      price_cents: row.price_cents,
      ordinal: row.ordinal,
      on_by_default: row.on_by_default,
      version: row.version,
      translations: modifierTranslationsFor(row.id),
    });
    modifiersByListId.set(row.modifier_list_id, list);
  }
  const imlsByItemId = new Map<string, ItemModifierListRow[]>();
  for (const row of itemModifierListRows) {
    const list = imlsByItemId.get(row.item_id) ?? [];
    list.push(row);
    imlsByItemId.set(row.item_id, list);
  }

  function buildItemModifierLists(itemId: string): PublicModifierList[] {
    const imls = imlsByItemId.get(itemId);
    if (!imls) return [];
    const result: PublicModifierList[] = [];
    for (const iml of imls) {
      const list = modifierListById.get(iml.modifier_list_id);
      if (!list) continue;
      result.push({
        id: list.id,
        name: list.name,
        modifier_type: list.modifier_type,
        min_selected: iml.min_selected_override ?? list.min_selected,
        max_selected: iml.max_selected_override ?? list.max_selected,
        text_required: list.text_required,
        max_length: list.max_length,
        hidden_from_customer: iml.hidden_from_customer_override,
        ordinal: iml.ordinal,
        version: list.version,
        modifiers: modifiersByListId.get(list.id) ?? [],
        translations: modifierListTranslationsFor(list.id),
      });
    }
    return result;
  }

  const itemsByCategory = new Map<string, PublicItem[]>();
  for (const item of items) {
    const translation = itemTranslationById.get(item.id);
    const mediaPath = item.image_path || mediaByItemId.get(item.id) || null;
    // Gallery: media rows are the source of truth. Items whose photo
    // predates item_media (demo seeds, backfills) only carry image_path —
    // wrap it as a one-photo gallery so the detail view has one code path.
    // alt stays null here: per-photo alt would SHADOW the localized
    // item-level image_alt in the detail view, and item.image_alt at
    // this point is the canonical (untranslated) value.
    const galleryImages =
      imagesByItemId.get(item.id) ??
      (mediaPath ? [{ path: mediaPath, alt: null }] : []);
    const mergedItem: PublicItem = {
      ...item,
      name: translation?.name ?? item.name,
      description: translation?.description ?? item.description,
      image_alt: translation?.image_alt ?? item.image_alt,
      image_path: mediaPath,
      images: galleryImages,
      modifier_lists: buildItemModifierLists(item.id),
      translations: itemTranslationsFor(item.id),
    };
    const list = itemsByCategory.get(item.category_id) ?? [];
    list.push(mergedItem);
    itemsByCategory.set(item.category_id, list);
  }

  return categories.map((category) => {
    const translation = categoryTranslationById.get(category.id);
    return {
      ...category,
      name: translation?.name ?? category.name,
      items: itemsByCategory.get(category.id) ?? [],
      translations: categoryTranslationsFor(category.id),
    };
  });
}
