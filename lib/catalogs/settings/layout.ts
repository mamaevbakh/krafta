// lib/catalogs/settings/layout.ts

export type HeaderVariant = "header-basic" | "header-center" | "header-hero";

export type CategoryNavVariant = "nav-tabs" | "nav-none";

export type SectionVariant =
  | "section-basic"
  | "section-separated"
  | "section-pill-tabs";

export type ItemCardVariant =
  | "card-big-photo"
  | "card-minimal"
  | "card-photo-row"
  | "card-default"
  | "card-glass-blur";

export type ItemDetailVariant =
  | "item-sheet"
  | "item-fullscreen";

export type ItemCardSettings = {
  columns: number; // 1, 2, 3 (future: "auto")
  aspectRatio: number; // numeric ratio
};

export type CatalogLayoutSettings = {
  headerVariant: HeaderVariant;
  sectionVariant: SectionVariant;
  itemCardVariant: ItemCardVariant;
  categoryNavVariant: CategoryNavVariant;
  itemDetailVariant: ItemDetailVariant;
  itemCard: ItemCardSettings;
};

// ----------------
// DEFAULTS
// ----------------

export const defaultItemCardSettings: ItemCardSettings = {
  columns: 2,
  aspectRatio: 4 / 3,
};

export const defaultLayoutSettings: CatalogLayoutSettings = {
  headerVariant: "header-center",
  sectionVariant: "section-pill-tabs",
  itemCardVariant: "card-big-photo",
  categoryNavVariant: "nav-tabs",
  itemDetailVariant: "item-sheet",
  itemCard: defaultItemCardSettings,
};

// ----------------
// HELPERS
// ----------------

function normalizeCategoryNavVariant(
  rawVariant: unknown,
): CategoryNavVariant {
  if (rawVariant === "nav-none" || rawVariant === "none") return "nav-none";
  return "nav-tabs";
}

function normalizeItemDetailVariant(
  rawVariant: unknown,
): ItemDetailVariant {
  if (rawVariant === "item-fullscreen") return "item-fullscreen";
  return "item-sheet";
}

// normalize "aspectRatio" from: 
// - number (1.3333)
// - string "4:3"
// - string "1.3333"
function normalizeAspectRatio(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && raw > 0) return raw;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;

    // "4:3"
    if (trimmed.includes(":")) {
      const [w, h] = trimmed.split(":").map(Number);
      if (w > 0 && h > 0) return w / h;
    }

    // "1.333"
    const numeric = Number(trimmed);
    if (numeric > 0) return numeric;
  }

  return fallback;
}

function normalizeColumns(raw: unknown, fallback: number): number {
  const num = Number(raw);
  if (Number.isFinite(num) && num >= 1 && num <= 4) return num;
  return fallback;
}

// ----------------
// MAIN NORMALIZER
// ----------------

export function normalizeLayoutSettings(
  layoutRaw: Partial<CatalogLayoutSettings> | Record<string, unknown> = {},
): CatalogLayoutSettings {
  const raw = layoutRaw as Partial<CatalogLayoutSettings> & {
    itemCard?: Record<string, unknown>;
  };

  const normalizedItemCard: ItemCardSettings = {
    columns: normalizeColumns(
      raw.itemCard?.columns,
      defaultItemCardSettings.columns,
    ),
    aspectRatio: normalizeAspectRatio(
      raw.itemCard?.aspectRatio,
      defaultItemCardSettings.aspectRatio,
    ),
  };

  return {
    headerVariant:
      raw.headerVariant ?? defaultLayoutSettings.headerVariant,
    sectionVariant:
      raw.sectionVariant ?? defaultLayoutSettings.sectionVariant,
    itemCardVariant:
      raw.itemCardVariant ?? defaultLayoutSettings.itemCardVariant,
    categoryNavVariant: normalizeCategoryNavVariant(raw.categoryNavVariant),
    itemDetailVariant: normalizeItemDetailVariant(raw.itemDetailVariant),
    itemCard: normalizedItemCard,
  };
}
