"use server";

// KRA-42 wizard v3 / ADR 0005 §2 (amended) — guided seeding.
//
// The wizard collects vertical → name → curated sections → curated items →
// order modes (+ table count) → languages → contacts, then submits ONCE:
//
//   ensure anon session
//   → create_draft_shop(p_slug, NULL, p_name)   bare bootstrap (no seed)
//   → complete_wizard(...)                       everything else: catalog
//     settings, venue modes/contacts, locales, curated menu, dine-in table
//     QRs — ONE transactional SECURITY INVOKER call under owner RLS
//
// Two round-trips after auth instead of ~ten. Atomic: a failed submit rolls
// back completely, so a retry never collides with half-written state. The
// RPC is also idempotent (an existing menu no-ops), which covers the
// resumed-wizard / double-submit races.
//
// Nothing exists until submit — abandoning the wizard leaves zero rows.
// Untouched suggestions keep template variations + translations + the
// seeded_at demo marker; edited or custom items are the merchant's own.

import { z } from "zod";

import { createDraftShopForAnonUser } from "@/lib/auth/merchant-shop";
import { getLocaleDefinition } from "@/lib/locales/registry";
import { suggestSlug } from "@/lib/onboarding/slug";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

import { isShopVertical, VERTICALS, type ShopVertical } from "./verticals";

// ---------------------------------------------------------------------------
// Suggestions (step ① → ③/④ prefill). vertical_templates is public-read
// reference data; this runs before any session exists.
// ---------------------------------------------------------------------------

export type SuggestedItem = {
  slug: string;
  name: string;
  description: string | null;
  defaultPriceCents: number;
  variations: { name: string; price_cents: number; ordinal: number; is_default: boolean }[];
  translations: Record<string, { name: string; description?: string | null }>;
};

export type SuggestedSection = {
  slug: string;
  name: string;
  translations: Record<string, { name: string }>;
  items: SuggestedItem[];
};

export type VerticalSuggestions = {
  sections: SuggestedSection[];
  defaultModes: string[];
};

export async function getVerticalSuggestions(
  vertical: string,
): Promise<VerticalSuggestions | { error: string }> {
  if (!isShopVertical(vertical)) return { error: "Unknown shop type." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vertical_templates")
    .select("template")
    .eq("key", vertical)
    .maybeSingle();
  if (error || !data) return { error: "Suggestions unavailable." };

  const template = data.template as {
    modes?: string[];
    categories?: Array<{
      slug: string;
      name: string;
      translations?: Record<string, { name: string }>;
      items?: Array<{
        slug: string;
        name: string;
        description?: string;
        translations?: Record<string, { name: string; description?: string }>;
        variations?: Array<{ name: string; price_cents: number; ordinal: number; is_default: boolean }>;
      }>;
    }>;
  };

  return {
    defaultModes: template.modes ?? ["pickup"],
    sections: (template.categories ?? []).map((c) => ({
      slug: c.slug,
      name: c.name,
      translations: c.translations ?? {},
      items: (c.items ?? []).map((i) => ({
        slug: i.slug,
        name: i.name,
        description: i.description ?? null,
        defaultPriceCents:
          i.variations?.find((v) => v.is_default)?.price_cents ??
          i.variations?.[0]?.price_cents ??
          0,
        variations: i.variations ?? [],
        translations: i.translations ?? {},
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

const wizardItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceCents: z.number().int().min(0).max(1_000_000_000),
  /** slug of the suggestion this came from; null = merchant-typed */
  suggestionSlug: z.string().max(80).nullable(),
  /** true when name AND price still match the suggestion (keeps template
   *  variations/translations + the seeded_at demo marker) */
  untouched: z.boolean(),
});

const wizardSectionSchema = z.object({
  name: z.string().trim().min(1).max(64),
  suggestionSlug: z.string().max(64).nullable(),
  items: z.array(wizardItemSchema).max(30),
});

const wizardPayloadSchema = z.object({
  vertical: z.string().refine(isShopVertical, "Unknown shop type."),
  name: z.string().trim().min(1).max(80),
  sections: z.array(wizardSectionSchema).min(0).max(8),
  modes: z.array(z.enum(["dine_in", "pickup", "delivery"])).min(1).max(3),
  tableCount: z.number().int().min(0).max(50),
  locales: z
    .array(z.object({ code: z.string().min(2).max(16), isDefault: z.boolean() }))
    .min(1)
    .max(6)
    .refine((ls) => ls.filter((l) => l.isDefault).length === 1, "Pick one default language.")
    .refine((ls) => new Set(ls.map((l) => l.code)).size === ls.length, "Duplicate language.")
    .refine((ls) => ls.every((l) => getLocaleDefinition(l.code)), "Unknown language."),
  phone: z.string().trim().max(32),
  city: z.string().trim().max(64),
});

export type WizardPayload = z.input<typeof wizardPayloadSchema>;
export type CreateShopResult =
  | { error: string }
  // orgId + catalogId let the client finish an optional logo upload
  // (POST /api/catalogs/logo) right after the shop exists.
  | {
      ok: true;
      orgSlug: string;
      catalogSlug: string;
      orgId: string;
      catalogId: string;
    };

const UZS_CURRENCY_SETTINGS = {
  defaultCurrency: "UZS",
  label: "сум",
  labelPosition: "suffix",
  thousandSeparator: " ",
  decimalSeparator: ",",
  showDecimals: false,
};

/** New shops inherit their starting look (settings_layout) from this demo
 *  catalog — the homepage "View Demo" shop — so every shop opens looking
 *  like the reference storefront instead of the bare platform default. */
const DEMO_LOOK_SOURCE_SLUG = "vintage-shop";

/** Stock abstract (dithered) photos cycled onto a new shop's items so the
 *  card-big-photo storefront isn't a wall of empty slots. Keys live in the
 *  public `public-assets` bucket (resolved by getItemImageUrl). Photos are
 *  interchangeable — complete_wizard cycles them across items by position.
 *  The two krafta-* logo variants are deliberately excluded. */
const DEMO_ITEM_IMAGES = Array.from(
  { length: 23 },
  (_, i) => `demo/abstract/dither-${String(i + 1).padStart(2, "0")}.webp`,
);

/** Placeholder logo for shops that skip the optional logo upload — the
 *  dithered Krafta wordmark (public-assets/demo/abstract/dither-24.webp).
 *  Stored as a fully-qualified storage path so getCatalogAssetUrl resolves it
 *  against the public `public-assets` bucket (a bare path would otherwise
 *  resolve against the `krafta` logo bucket). Swappable any time in the Studio. */
const DEFAULT_LOGO_PATH =
  "/storage/v1/object/public/public-assets/demo/abstract/dither-24.webp";

export async function createShopFromWizard(
  payload: WizardPayload,
): Promise<CreateShopResult> {
  const parsed = wizardPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const input = parsed.data;
  const totalItems = input.sections.reduce((n, s) => n + s.items.length, 0);
  if (totalItems > 60) {
    return { error: "That's a lot of items for a start — keep it under 60." };
  }

  // Suggestions are re-read SERVER-side: untouched items take their
  // variations/translations from the template, never from the client.
  const suggestions = await getVerticalSuggestions(input.vertical);
  if ("error" in suggestions) return { error: suggestions.error };
  const suggestionIndex = new Map<string, SuggestedSection | SuggestedItem>(
    suggestions.sections.flatMap((s): [string, SuggestedSection | SuggestedItem][] => [
      [`section:${s.slug}`, s],
      ...s.items.map((i): [string, SuggestedItem] => [`item:${i.slug}`, i]),
    ]),
  );

  let shop;
  try {
    shop = await createDraftShopForAnonUser({ name: input.name });
  } catch (err) {
    console.error("[onboarding] create_draft_shop failed", err);
    return { error: "We couldn't create your shop just now. Check your connection and try again." };
  }

  const supabase = await createClient();

  // The curated menu payload for complete_wizard.
  //
  // Canonical strings follow the DEFAULT locale: templates are RU-canonical,
  // so when the merchant picks e.g. Uzbek as default, untouched suggestions
  // take their uz-Latn template string as the item/category NAME and Russian
  // drops into translations (if enabled). Locales without template strings
  // simply have no row — the workbench fills them later.
  const defaultCode = input.locales.find((l) => l.isDefault)!.code;
  const nonDefaultCodes = input.locales.filter((l) => !l.isDefault).map((l) => l.code);
  const localize = (
    tr: Record<string, { name: string; description?: string | null }>,
    ruName: string,
    ruDescription: string | null,
  ) => {
    const canonical =
      defaultCode === "ru" || !tr[defaultCode]
        ? { name: ruName, description: ruDescription }
        : { name: tr[defaultCode].name, description: tr[defaultCode].description ?? null };
    const translations: Record<string, { name: string; description?: string | null }> = {};
    for (const code of nonDefaultCodes) {
      if (code === "ru" && defaultCode !== "ru") {
        translations.ru = { name: ruName, description: ruDescription };
      } else if (tr[code]) {
        translations[code] = tr[code];
      }
    }
    return { canonical, translations };
  };
  const usedSlugs = new Set<string>();
  const uniqueSlug = (base: string, fallback: string) => {
    let s = suggestSlug(base) || fallback;
    while (usedSlugs.has(s)) s = `${s}-x`;
    usedSlugs.add(s);
    return s;
  };
  const menu = {
    categories: input.sections.map((section, sIdx) => {
      const suggestedSection = section.suggestionSlug
        ? (suggestionIndex.get(`section:${section.suggestionSlug}`) as SuggestedSection | undefined)
        : undefined;
      const sectionUntouched = Boolean(
        suggestedSection && section.name === suggestedSection.name,
      );
      const sectionLoc = sectionUntouched
        ? localize(suggestedSection!.translations, suggestedSection!.name, null)
        : null;
      return {
        name: sectionLoc ? sectionLoc.canonical.name : section.name,
        slug: uniqueSlug(section.suggestionSlug ?? section.name, `section-${sIdx + 1}`),
        position: sIdx,
        translations: sectionLoc ? sectionLoc.translations : {},
        items: section.items.map((item, iIdx) => {
          const suggested = item.suggestionSlug
            ? (suggestionIndex.get(`item:${item.suggestionSlug}`) as SuggestedItem | undefined)
            : undefined;
          const untouched = Boolean(
            item.untouched &&
              suggested &&
              item.name === suggested.name &&
              item.priceCents === suggested.defaultPriceCents,
          );
          const itemLoc = untouched
            ? localize(suggested!.translations, suggested!.name, suggested!.description)
            : null;
          return {
            name: itemLoc ? itemLoc.canonical.name : item.name,
            slug: uniqueSlug(item.suggestionSlug ?? item.name, `item-${sIdx + 1}-${iIdx + 1}`),
            position: iIdx,
            description: itemLoc ? itemLoc.canonical.description : null,
            seeded: untouched,
            variations: untouched
              ? suggested!.variations
              : [{ name: "Стандарт", price_cents: item.priceCents, ordinal: 0, is_default: true }],
            translations: itemLoc ? itemLoc.translations : {},
          };
        }),
      };
    }),
  };

  // New shops start on the DEMO shop's look (vintage-shop), not the bare
  // platform default. Read it fresh so retuning the demo carries forward to
  // new shops; a published catalog is readable under the merchant's own RLS.
  // We copy the LAYOUT only — settings_branding stays empty, so the
  // dashboard's "Pick your look" checklist row remains a real task pointing
  // at the Studio (not born-done). Falls back to the catalog default if the
  // demo is ever missing/unpublished.
  const { data: demoCatalog } = await supabase
    .from("catalogs")
    .select("settings_layout")
    .eq("slug", DEMO_LOOK_SOURCE_SLUG)
    .eq("status", "published")
    .maybeSingle();
  const demoLayout =
    (demoCatalog?.settings_layout as Json | null | undefined) ?? null;

  // Everything after shop creation rides ONE transactional RPC: catalog
  // settings, venue modes + contacts, locales, menu and dine-in table QRs.
  // Atomic (a failure rolls back cleanly for a safe retry) and idempotent
  // (an existing menu no-ops — covers double-submits and resumed wizards).
  const { error: completeError } = await supabase.rpc("complete_wizard", {
    p_catalog_id: shop.catalogId,
    p_vertical: input.vertical as ShopVertical,
    p_currency: UZS_CURRENCY_SETTINGS,
    // Seed the look from the demo shop (null → RPC leaves the catalog
    // default). settings_branding is intentionally not sent.
    ...(demoLayout ? { p_layout: demoLayout } : {}),
    // Cycle stock photos onto the new items so the storefront has imagery.
    p_item_images: DEMO_ITEM_IMAGES,
    p_modes: input.modes,
    p_address: {
      ...(input.city ? { city: input.city } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
    },
    p_locales: input.locales.map((l, i) => {
      // Registry resolves display metadata — validated above, never a guess.
      const def = getLocaleDefinition(l.code)!;
      return {
        locale: l.code,
        is_default: l.isDefault,
        sort_order: i,
        display_name: def.nativeName,
        text_direction: def.direction,
      };
    }),
    p_menu: menu as unknown as Json,
    p_table_count: input.modes.includes("dine_in") ? input.tableCount : 0,
  });
  if (completeError) {
    console.error("[onboarding] complete_wizard failed", completeError);
    return { error: "We couldn't set up your shop. Try again." };
  }

  // Dress the new shop's storefront header so the reveal isn't a bare name on
  // white: a placeholder logo (the dithered Krafta wordmark), a per-vertical
  // tagline, and two tags. Best-effort and gated on logo_path IS NULL (a proxy
  // for "freshly created") so a resubmit never clobbers the merchant's edits;
  // an uploaded logo overwrites logo_path right after via POST /api/catalogs/logo.
  // A failure here just leaves the header plainer — it never blocks the create.
  const seed = VERTICALS[input.vertical as ShopVertical];
  const { error: seedError } = await supabase
    .from("catalogs")
    .update({
      logo_path: DEFAULT_LOGO_PATH,
      description: seed.seedDescription,
      tags: seed.seedTags,
    })
    .eq("id", shop.catalogId)
    .is("logo_path", null);
  if (seedError) {
    console.error("[onboarding] storefront header seed failed", seedError);
  }

  // No redirect: the wizard shows the reveal (phone-frame preview) first
  // and navigates to the dashboard on the merchant's own tap.
  return {
    ok: true,
    orgSlug: shop.orgSlug,
    catalogSlug: shop.catalogSlug,
    orgId: shop.orgId,
    catalogId: shop.catalogId,
  };
}
