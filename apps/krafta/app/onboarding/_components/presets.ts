// KRA-42 wizard PR 2 — Look presets.
//
// Four curated storefront looks, each a combination of existing layout-
// registry variants (no new storefront components). The wizard's Look screen
// renders each preset as a scaled-down live preview of the merchant's own
// draft menu; the chosen key is re-resolved SERVER-side in actions.ts (the
// client never ships a layout payload — same trust stance as suggestions).
//
// Chosen for photoless legibility: a fresh wizard shop has zero item photos,
// so the four presets must read differently without images. Header shape +
// section chrome + card density carry the difference.
//
// settings_branding gets { preset: <key> } — the activation checklist's
// "Pick your look" fact (branding keys > 0) is then born-done HONESTLY:
// the merchant explicitly chose a look in the wizard.

import type { CatalogLayoutOverride } from "@/lib/catalogs/settings/layout";

export const LOOK_KEYS = ["classic", "showcase", "list", "minimal"] as const;
export type LookKey = (typeof LOOK_KEYS)[number];

export function isLookKey(value: string): value is LookKey {
  return (LOOK_KEYS as readonly string[]).includes(value);
}

export const LOOK_PRESETS: Record<
  LookKey,
  {
    /** Merged over defaultLayoutSettings server-side; {} = ship defaults. */
    layout: CatalogLayoutOverride;
  }
> = {
  // The platform default: centered header, pill-tab sections, photo cards.
  classic: { layout: {} },
  // Photo-forward with a hero header — for merchants who will add imagery.
  showcase: {
    layout: {
      headerVariant: "header-hero",
      sectionVariant: "section-separated",
      itemCardVariant: "card-photo-row",
      categoryNavVariant: "nav-tabs-motion",
    },
  },
  // Dense menu-list — the best photoless look (cafes with printed-menu DNA).
  list: {
    layout: {
      headerVariant: "header-basic",
      sectionVariant: "section-basic",
      itemCardVariant: "card-row-compact",
      categoryNavVariant: "nav-tabs",
    },
  },
  // Quiet typography-only storefront.
  minimal: {
    layout: {
      headerVariant: "header-center",
      sectionVariant: "section-basic",
      itemCardVariant: "card-minimal",
      categoryNavVariant: "nav-none",
    },
  },
};
