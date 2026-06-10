"use server";

// KRA-42 wizard v2 / ADR 0005 §2 (amended) — guided seeding.
//
// The wizard collects vertical → name → curated sections → curated items →
// order modes (+ table count) → languages → contacts, then submits ONCE:
//
//   ensure anon session
//   → create_draft_shop(p_slug, NULL, p_name)        bare bootstrap (no seed)
//   → catalog UPDATE (vertical, currency settings)    owner RLS
//   → venue UPDATE (modes, contacts in address)       owner RLS
//   → catalog_locales bulk insert                      owner RLS
//   → create_wizard_menu(catalog, curated payload)    atomic, SECURITY INVOKER
//   → createTable × N (paired table QRs)              existing lib action
//
// Nothing exists until submit — abandoning the wizard leaves zero rows.
// Untouched suggestions keep template variations + translations + the
// seeded_at demo marker; edited or custom items are the merchant's own.

import { redirect } from "next/navigation";
import { z } from "zod";

import { createDraftShopForAnonUser } from "@/lib/auth/merchant-shop";
import { suggestSlug } from "@/lib/onboarding/slug";
import { createClient } from "@/lib/supabase/server";
import { createTable } from "@/lib/tables/actions";
import type { Json } from "@/lib/supabase/types";

import { isShopVertical, type ShopVertical } from "./verticals";

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
  locales: z.array(z.enum(["uz", "en"])).max(2),
  phone: z.string().trim().max(32),
  city: z.string().trim().max(64),
});

export type WizardPayload = z.input<typeof wizardPayloadSchema>;
export type CreateShopState = { error?: string };

const UZS_CURRENCY_SETTINGS = {
  defaultCurrency: "UZS",
  label: "сум",
  labelPosition: "suffix",
  thousandSeparator: " ",
  decimalSeparator: ",",
  showDecimals: false,
};

export async function createShopFromWizard(
  payload: WizardPayload,
): Promise<CreateShopState> {
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

  // Idempotency guard: if this session already had a shop (double-submit,
  // resumed wizard), the RPC returned the existing one — don't write a
  // second menu onto it.
  const { count: existingItems } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("catalog_id", shop.catalogId);
  const { count: existingCats } = await supabase
    .from("catalog_categories")
    .select("id", { count: "exact", head: true })
    .eq("catalog_id", shop.catalogId);
  if ((existingItems ?? 0) > 0 || (existingCats ?? 0) > 0) {
    redirect(`/dashboard/${shop.orgSlug}/${shop.catalogSlug}/items`);
  }

  const { data: venue } = await supabase
    .from("venues")
    .select("id, address")
    .eq("catalog_id", shop.catalogId)
    .maybeSingle();

  // Catalog identity + currency, venue modes + contacts, locales — small
  // single-row writes under owner RLS.
  const enabledLocales = ["ru", ...input.locales];
  const [catalogRes, venueRes, localesRes] = await Promise.all([
    supabase
      .from("catalogs")
      .update({
        vertical: input.vertical as ShopVertical,
        settings_currency: UZS_CURRENCY_SETTINGS,
      })
      .eq("id", shop.catalogId),
    venue
      ? supabase
          .from("venues")
          .update({
            modes_enabled: input.modes,
            address: {
              ...((venue.address as Record<string, unknown>) ?? {}),
              ...(input.city ? { city: input.city } : {}),
              ...(input.phone ? { phone: input.phone } : {}),
            },
          })
          .eq("id", venue.id)
      : Promise.resolve({ error: null }),
    supabase.from("catalog_locales").insert(
      enabledLocales.map((locale, i) => ({
        catalog_id: shop.catalogId,
        locale,
        is_default: locale === "ru",
        is_enabled: true,
        sort_order: i,
        display_name: locale === "ru" ? "Русский" : locale === "uz" ? "Oʻzbekcha" : "English",
        text_direction: "ltr",
      })),
    ),
  ]);
  const settingsError = catalogRes.error ?? venueRes.error ?? localesRes.error;
  if (settingsError) {
    console.error("[onboarding] settings writes failed", settingsError);
    return { error: "We couldn't save your shop settings. Try again." };
  }

  // The curated menu — one atomic RPC under the merchant's own RLS.
  const localeFilter = (tr: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(tr).filter(([k]) => input.locales.includes(k as "uz" | "en")));
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
      return {
        name: section.name,
        slug: uniqueSlug(section.suggestionSlug ?? section.name, `section-${sIdx + 1}`),
        position: sIdx,
        translations:
          suggestedSection && section.name === suggestedSection.name
            ? localeFilter(suggestedSection.translations)
            : {},
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
          return {
            name: item.name,
            slug: uniqueSlug(item.suggestionSlug ?? item.name, `item-${sIdx + 1}-${iIdx + 1}`),
            position: iIdx,
            description: untouched ? (suggested?.description ?? null) : null,
            seeded: untouched,
            variations: untouched
              ? suggested!.variations
              : [{ name: "Стандарт", price_cents: item.priceCents, ordinal: 0, is_default: true }],
            translations: untouched ? localeFilter(suggested!.translations) : {},
          };
        }),
      };
    }),
  };

  if (menu.categories.length > 0) {
    const { error: menuError } = await supabase.rpc("create_wizard_menu", {
      p_catalog_id: shop.catalogId,
      p_menu: menu as unknown as Json,
    });
    if (menuError) {
      console.error("[onboarding] create_wizard_menu failed", menuError);
      return { error: "We couldn't create your menu. Try again." };
    }
  }

  // Dine-in tables → paired table QR codes (reuses the qr-codes page action;
  // sequential because positions append). Best-effort: a table failure
  // shouldn't strand the merchant outside their new shop.
  if (input.modes.includes("dine_in") && input.tableCount > 0 && venue) {
    for (let i = 1; i <= input.tableCount; i++) {
      const res = await createTable({
        venueId: venue.id,
        label: String(i),
        catalogSlug: shop.catalogSlug,
      });
      if (!res.ok) {
        console.error("[onboarding] createTable failed", res.error);
        break;
      }
    }
  }

  redirect(`/dashboard/${shop.orgSlug}/${shop.catalogSlug}/items`);
}
