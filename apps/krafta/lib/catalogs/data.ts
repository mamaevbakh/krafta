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
} from "./types";

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
  )}&select=id,slug,name,description,logo_path,org_id,tags,settings_layout,settings_currency,settings_behavior`;
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

export async function getCatalogStructure(
  catalogId: string
): Promise<PublicCategoryWithItems[]> {
  "use cache";
  cacheTag(`catalog:${catalogId}`, `catalog-structure:${catalogId}`);

  const localesUrl = `${supabaseUrl}/rest/v1/catalog_locales?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_enabled=eq.true&select=locale,is_default,sort_order&order=sort_order.asc`;
  const categoriesUrl = `${supabaseUrl}/rest/v1/catalog_categories?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=id,slug,name,position&order=position.asc`;
  // Price is now sourced from the default item_variations row (Migration 1,
  // ADR 0001 §3.1). Embed it filtered to is_default=true; PostgREST returns
  // it as an array, we flatten below.
  const itemsUrl = `${supabaseUrl}/rest/v1/items?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&select=id,slug,category_id,name,description,image_path,image_alt,position,item_variations(price_cents)&item_variations.is_default=eq.true&item_variations.is_active=eq.true&order=position.asc`;
  // Modifier data: three tables, all denormalize catalog_id so we can fetch
  // each scoped to the active catalog in parallel with the rest of the
  // catalog structure. Assembly into PublicItem.modifier_lists happens below.
  const modifierListsUrl = `${supabaseUrl}/rest/v1/modifier_lists?catalog_id=eq.${encodeURIComponent(
    catalogId,
  )}&is_active=eq.true&modifier_type=eq.list&select=id,name,modifier_type,min_selected,max_selected,version`;
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
  const categories = (await categoriesResponse.json()) as PublicCatalogCategory[];

  if (!itemsResponse.ok) {
    return categories.map((category) => ({
      ...category,
      items: [],
    }));
  }
  const itemsRaw = (await itemsResponse.json()) as Array<
    Omit<PublicItem, "price_cents" | "modifier_lists"> & {
      item_variations: Array<{ price_cents: number }>;
    }
  >;
  // modifier_lists is filled in below during item-by-item assembly.
  const items: Array<Omit<PublicItem, "modifier_lists">> = itemsRaw.map(
    ({ item_variations, ...rest }) => ({
      ...rest,
      price_cents: item_variations[0]?.price_cents ?? 0,
    }),
  );

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

  const categoryIds = categories.map((category) => category.id);
  const itemIds = items.map((item) => item.id);

  const categoryTranslationUrl =
    defaultLocale && categoryIds.length
      ? `${supabaseUrl}/rest/v1/catalog_category_translations?locale=eq.${encodeURIComponent(
          defaultLocale,
        )}&category_id=in.(${categoryIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=category_id,name`
      : null;
  const itemTranslationUrl =
    defaultLocale && itemIds.length
      ? `${supabaseUrl}/rest/v1/item_translations?locale=eq.${encodeURIComponent(
          defaultLocale,
        )}&item_id=in.(${itemIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=item_id,name,description,image_alt`
      : null;
  const itemMediaUrl =
    itemIds.length
      ? `${supabaseUrl}/rest/v1/item_media?item_id=in.(${itemIds
          .map((id) => encodeURIComponent(id))
          .join(",")})&select=item_id,storage_path,is_primary,position&order=position.asc`
      : null;

  const [categoryTranslationsResponse, itemTranslationsResponse, itemMediaResponse] =
    await Promise.all([
      categoryTranslationUrl
        ? fetch(categoryTranslationUrl, {
            headers: supabaseHeaders,
            next: {
              tags: [`catalog:${catalogId}`, `catalog-structure:${catalogId}`],
            },
            cache: "force-cache",
          })
        : null,
      itemTranslationUrl
        ? fetch(itemTranslationUrl, {
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
    categoryTranslationsResponse?.ok
      ? ((await categoryTranslationsResponse.json()) as Array<{
          category_id: string;
          name: string | null;
        }>)
      : [];
  const itemTranslations =
    itemTranslationsResponse?.ok
      ? ((await itemTranslationsResponse.json()) as Array<{
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
  const mediaByItemId = new Map<string, string>();
  itemMedia.forEach((media) => {
    if (media.is_primary && !mediaByItemId.has(media.item_id)) {
      mediaByItemId.set(media.item_id, media.storage_path);
    }
  });

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
        hidden_from_customer: iml.hidden_from_customer_override,
        ordinal: iml.ordinal,
        version: list.version,
        modifiers: modifiersByListId.get(list.id) ?? [],
      });
    }
    return result;
  }

  const itemsByCategory = new Map<string, PublicItem[]>();
  for (const item of items) {
    const translation = itemTranslationById.get(item.id);
    const mediaPath = item.image_path || mediaByItemId.get(item.id) || null;
    const mergedItem: PublicItem = {
      ...item,
      name: translation?.name ?? item.name,
      description: translation?.description ?? item.description,
      image_alt: translation?.image_alt ?? item.image_alt,
      image_path: mediaPath,
      modifier_lists: buildItemModifierLists(item.id),
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
    };
  });
}
