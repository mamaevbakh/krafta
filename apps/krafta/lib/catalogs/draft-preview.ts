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
// Scope is the wizard-created shape: categories → items → variations +
// modifiers, plus the venue. Item names are already canonical in the chosen
// default locale (complete_wizard / create_wizard_menu set them that way), so
// rendering at the default locale needs no translation joins. The venue is
// returned so the onboarding-reveal preview can render the FULL customer
// experience (cart + size/add-on pickers) — the preview page forces it active
// because a fresh shop's venue is paused until it goes live.

import { createClient } from "@/lib/supabase/server";
import { groupGalleryByItem } from "./media";
import type {
  PublicCatalog,
  PublicCategoryWithItems,
  PublicItem,
  PublicItemImage,
  PublicModifier,
  PublicModifierList,
} from "./types";
import type {
  PublicCatalogLocaleOption,
  PublicCatalogLocales,
  PublicVenue,
} from "./data";

export type DraftCatalogRender = {
  catalog: PublicCatalog;
  categories: PublicCategoryWithItems[];
  locales: PublicCatalogLocales;
  venue: PublicVenue | null;
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

  const [
    catsRes,
    itemsRes,
    varsRes,
    localesRes,
    venueRes,
    modListsRes,
    modsRes,
    itemModListsRes,
  ] = await Promise.all([
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
    supabase
      .from("venues")
      .select(
        "id, catalog_id, org_id, modes_enabled, currency, timezone, language_code, status",
      )
      .eq("catalog_id", catalog.id)
      .maybeSingle(),
    supabase
      .from("modifier_lists")
      .select(
        "id, name, modifier_type, min_selected, max_selected, text_required, max_length, version",
      )
      .eq("catalog_id", catalog.id)
      .eq("is_active", true),
    supabase
      .from("modifiers")
      .select("id, modifier_list_id, name, price_cents, ordinal, on_by_default, version")
      .eq("catalog_id", catalog.id)
      .eq("is_active", true)
      .order("ordinal", { ascending: true }),
    supabase
      .from("item_modifier_lists")
      .select(
        "item_id, modifier_list_id, ordinal, min_selected_override, max_selected_override, hidden_from_customer_override",
      )
      .eq("catalog_id", catalog.id)
      .eq("is_active", true)
      .order("ordinal", { ascending: true }),
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

  // Modifiers (options) grouped by their list, then each item's linked lists
  // assembled into PublicModifierList — mirrors getCatalogStructure so the
  // storefront's add-on picker renders identically in preview. Per-item
  // overrides on the link win over the list defaults.
  const modifiersByList = new Map<string, PublicModifier[]>();
  for (const m of modsRes.data ?? []) {
    const arr = modifiersByList.get(m.modifier_list_id) ?? [];
    arr.push({
      id: m.id,
      name: m.name,
      price_cents: m.price_cents,
      ordinal: m.ordinal,
      on_by_default: m.on_by_default,
      version: m.version,
      translations: [],
    });
    modifiersByList.set(m.modifier_list_id, arr);
  }
  const listById = new Map((modListsRes.data ?? []).map((l) => [l.id, l]));
  const modListsByItem = new Map<string, PublicModifierList[]>();
  for (const link of itemModListsRes.data ?? []) {
    const list = listById.get(link.modifier_list_id);
    if (!list) continue;
    const pub: PublicModifierList = {
      id: list.id,
      name: list.name,
      modifier_type: list.modifier_type === "text" ? "text" : "list",
      min_selected: link.min_selected_override ?? list.min_selected,
      max_selected: link.max_selected_override ?? list.max_selected,
      text_required: list.text_required,
      max_length: list.max_length,
      hidden_from_customer: link.hidden_from_customer_override ?? false,
      ordinal: link.ordinal,
      version: list.version,
      modifiers: modifiersByList.get(list.id) ?? [],
      translations: [],
    };
    const arr = modListsByItem.get(link.item_id) ?? [];
    arr.push(pub);
    modListsByItem.set(link.item_id, arr);
  }

  // Full galleries for the draft preview — createItem registers
  // item_media rows for multi-photo drafts, so previewing only
  // image_path would hide every photo but the cover until publish.
  // Owner-session client: the org-member RLS select policy applies.
  const draftItemIds = (itemsRes.data ?? []).map((it) => it.id);
  const { data: mediaRows } = draftItemIds.length
    ? await supabase
        .from("item_media")
        .select("item_id, storage_path, alt, is_primary, position")
        .in("item_id", draftItemIds)
        .order("position", { ascending: true })
        .order("id", { ascending: true })
    : { data: [] as never[] };
  const imagesByItemId: Map<string, PublicItemImage[]> = groupGalleryByItem(
    mediaRows ?? [],
  );

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
      // Media rows are the source of truth; wizard-created shops that
      // only stamped image_path fall back to a one-photo gallery.
      images:
        imagesByItemId.get(it.id) ??
        (it.image_path ? [{ path: it.image_path, alt: null }] : []),
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
      modifier_lists: modListsByItem.get(it.id) ?? [],
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
    venue: (venueRes.data as PublicVenue | null) ?? null,
    locales: {
      default: defaultLocale,
      enabled: localeRows.map((l) => l.locale),
      options,
    },
  };
}
