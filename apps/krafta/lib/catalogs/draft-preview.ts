import "server-only";

// KRA-42 — render an UNPUBLISHED draft catalog for its owner.
//
// The public storefront/preview path (lib/catalogs/data.ts) fetches over the
// anon publishable key and is cached; RLS only exposes published catalogs to
// anon, so a fresh draft is invisible there. This reader is the session-scoped
// fallback: it runs under the OWNER'S cookies (createClient), so the org's
// owner-read RLS surfaces the draft. It is deliberately SEPARATE from the
// cached anon path — zero blast radius on the live customer storefront.
//
// Scope is the wizard-created shape: categories → items → variations. Item
// names are already canonical in the chosen default locale (complete_wizard /
// create_wizard_menu set them that way), so rendering at the default locale
// needs no translation joins — pickLocalizedField returns the canonical name.
// Modifiers aren't part of a fresh wizard shop, so modifier_lists ship empty;
// a fuller draft (Studio preview) is a follow-up.

import { createClient } from "@/lib/supabase/server";
import type {
  PublicCatalog,
  PublicCategoryWithItems,
  PublicItem,
} from "./types";
import type {
  PublicCatalogLocaleOption,
  PublicCatalogLocales,
} from "./data";

export type DraftCatalogRender = {
  catalog: PublicCatalog;
  categories: PublicCategoryWithItems[];
  locales: PublicCatalogLocales;
};

/**
 * Returns the owner's draft catalog (by slug) assembled into the storefront
 * render shape, or null when there is no session, the catalog isn't owned/
 * doesn't exist, or it's actually published (let the cached anon path serve
 * that case).
 */
export async function getOwnedDraftCatalogRender(
  slug: string,
): Promise<DraftCatalogRender | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: catalog } = await supabase
    .from("catalogs")
    .select(
      "id, slug, name, description, logo_path, org_id, tags, settings_layout, settings_currency, settings_behavior",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!catalog) return null;

  const [catsRes, itemsRes, varsRes, localesRes] = await Promise.all([
    supabase
      .from("catalog_categories")
      .select("id, slug, name, position")
      .eq("catalog_id", catalog.id)
      .eq("is_active", true)
      .order("position", { ascending: true }),
    supabase
      .from("items")
      .select(
        "id, slug, category_id, name, description, image_path, image_alt, position",
      )
      .eq("catalog_id", catalog.id)
      .eq("is_active", true)
      .order("position", { ascending: true }),
    supabase
      .from("item_variations")
      .select("id, item_id, name, price_cents, ordinal, is_default, is_sold_out")
      .eq("catalog_id", catalog.id)
      .eq("is_active", true)
      .order("ordinal", { ascending: true }),
    supabase
      .from("catalog_locales")
      .select("locale, is_default, display_name, text_direction")
      .eq("catalog_id", catalog.id)
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
  ]);

  const variationsByItem = new Map<
    string,
    NonNullable<typeof varsRes.data>
  >();
  for (const v of varsRes.data ?? []) {
    const arr = variationsByItem.get(v.item_id) ?? [];
    arr.push(v);
    variationsByItem.set(v.item_id, arr);
  }

  const itemsByCategory = new Map<string, PublicItem[]>();
  for (const it of itemsRes.data ?? []) {
    if (!it.category_id) continue;
    const vs = variationsByItem.get(it.id) ?? [];
    const def = vs.find((v) => v.is_default) ?? vs[0] ?? null;
    const pubItem: PublicItem = {
      id: it.id,
      slug: it.slug,
      category_id: it.category_id,
      name: it.name,
      description: it.description,
      image_path: it.image_path,
      image_alt: it.image_alt,
      position: it.position,
      price_cents: def?.price_cents ?? 0,
      variations: vs.map((v) => ({
        id: v.id,
        name: v.name,
        price_cents: v.price_cents,
        ordinal: v.ordinal,
        is_default: v.is_default,
        is_sold_out: v.is_sold_out,
        translations: [],
      })),
      modifier_lists: [],
      translations: [],
    };
    const arr = itemsByCategory.get(it.category_id) ?? [];
    arr.push(pubItem);
    itemsByCategory.set(it.category_id, arr);
  }

  const categories: PublicCategoryWithItems[] = (catsRes.data ?? []).map(
    (c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      position: c.position,
      description: null,
      translations: [],
      items: itemsByCategory.get(c.id) ?? [],
    }),
  );

  const localeRows = localesRes.data ?? [];
  const defaultLocale =
    localeRows.find((l) => l.is_default)?.locale ?? localeRows[0]?.locale ?? null;
  const options: PublicCatalogLocaleOption[] = localeRows.map((l) => ({
    locale: l.locale,
    display_name: l.display_name,
    text_direction: l.text_direction === "rtl" ? "rtl" : "ltr",
    is_default: l.is_default,
  }));

  return {
    catalog: catalog as PublicCatalog,
    categories,
    locales: {
      default: defaultLocale,
      enabled: localeRows.map((l) => l.locale),
      options,
    },
  };
}
