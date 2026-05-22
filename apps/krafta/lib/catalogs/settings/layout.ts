// lib/catalogs/settings/layout.ts

export type HeaderVariant =
  | "header-basic"
  | "header-basic-free-logo"
  | "header-center"
  | "header-hero";

export type CategoryNavVariant =
  | "nav-tabs"
  | "nav-tabs-motion"
  | "nav-tabs-dashboard"
  | "nav-none";

export type SectionVariant =
  | "section-basic"
  | "section-separated"
  | "section-pill-tabs";

export type ItemCardVariant =
  | "card-big-photo"
  | "card-minimal"
  | "card-photo-row"
  | "card-default"
  | "card-glass-blur"
  // ~48px photoless row, dense — for catalogs with no photos or
  // operator preference for list-density (KRA-36 / S9).
  | "card-row-compact";

export type ItemDetailVariant =
  | "item-sheet"
  | "item-fullscreen";

export type ItemCardSettings = {
  columns: number; // 1, 2, 3 (future: "auto")
  aspectRatio: number; // numeric ratio
};

export type HeaderBasicFreeLogoSettings = {
  showLogo: boolean;
  showTitle: boolean;
  showDescription: boolean;
  showTags: boolean;
  logoFullWidth: boolean;
  logoAspectRatio: number;
  logoCornerRadius: number;
  bannerLightPath: string | null;
  bannerDarkPath: string | null;
  backgroundColorLight: string;
  backgroundColorDark: string;
};

export type HeaderSettings = {
  basicFreeLogo: HeaderBasicFreeLogoSettings;
};

export type CatalogLayoutSettings = {
  headerVariant: HeaderVariant;
  sectionVariant: SectionVariant;
  itemCardVariant: ItemCardVariant;
  categoryNavVariant: CategoryNavVariant;
  itemDetailVariant: ItemDetailVariant;
  itemCard: ItemCardSettings;
  header: HeaderSettings;
};

export type CatalogLayoutOverride = Partial<
  Omit<CatalogLayoutSettings, "itemCard" | "header">
> & {
  itemCard?: Partial<ItemCardSettings>;
  header?: {
    basicFreeLogo?: Partial<HeaderBasicFreeLogoSettings>;
  };
};

// ----------------
// DEFAULTS
// ----------------

export const defaultItemCardSettings: ItemCardSettings = {
  columns: 2,
  aspectRatio: 4 / 3,
};

export const defaultHeaderBasicFreeLogoSettings: HeaderBasicFreeLogoSettings = {
  showLogo: true,
  showTitle: true,
  showDescription: true,
  showTags: true,
  logoFullWidth: false,
  logoAspectRatio: 1,
  logoCornerRadius: 4,
  bannerLightPath: null,
  bannerDarkPath: null,
  backgroundColorLight: "transparent",
  backgroundColorDark: "transparent",
};

export const defaultHeaderSettings: HeaderSettings = {
  basicFreeLogo: defaultHeaderBasicFreeLogoSettings,
};

export const defaultLayoutSettings: CatalogLayoutSettings = {
  headerVariant: "header-center",
  sectionVariant: "section-pill-tabs",
  itemCardVariant: "card-big-photo",
  categoryNavVariant: "nav-tabs",
  // F-10 (storefront audit, 2026-05-23): default item detail is now the
  // fullscreen variant. The bottom-sheet pattern looked like a partial
  // overlay on desktop (small box pinned to the top of the viewport,
  // catalog grid still scrolling underneath) — confusing affordance for
  // customers. "item-fullscreen" claims the whole viewport with proper
  // close affordance and dedicated space for the modifier picker that
  // KRA-96 added. Merchants who want the legacy partial sheet can flip
  // back via their layout settings.
  itemDetailVariant: "item-fullscreen",
  itemCard: defaultItemCardSettings,
  header: defaultHeaderSettings,
};

// ----------------
// HELPERS
// ----------------

function normalizeCategoryNavVariant(
  rawVariant: unknown,
): CategoryNavVariant {
  if (rawVariant === "nav-tabs-motion") return "nav-tabs-motion";
  if (rawVariant === "nav-tabs-dashboard") return "nav-tabs-dashboard";
  if (rawVariant === "nav-none" || rawVariant === "none") return "nav-none";
  return "nav-tabs";
}

function normalizeItemDetailVariant(
  rawVariant: unknown,
): ItemDetailVariant {
  // F-10: explicit opt-in for the legacy bottom-sheet variant. Anything
  // else (including undefined / unknown values from older catalogs that
  // never set this field) resolves to fullscreen — the default detail
  // experience after the storefront audit.
  if (rawVariant === "item-sheet") return "item-sheet";
  return "item-fullscreen";
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

function normalizeBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  return fallback;
}

function normalizeNonNegativeNumber(raw: unknown, fallback: number): number {
  const num = Number(raw);
  if (Number.isFinite(num) && num >= 0) return num;
  return fallback;
}

function normalizeOptionalString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeColor(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeHeaderBasicFreeLogoSettings(
  raw: unknown,
): HeaderBasicFreeLogoSettings {
  const source =
    raw && typeof raw === "object"
      ? (raw as Partial<HeaderBasicFreeLogoSettings>)
      : {};

  return {
    showLogo: normalizeBoolean(
      source.showLogo,
      defaultHeaderBasicFreeLogoSettings.showLogo,
    ),
    showDescription: normalizeBoolean(
      source.showDescription,
      defaultHeaderBasicFreeLogoSettings.showDescription,
    ),
    showTitle: normalizeBoolean(
      source.showTitle,
      defaultHeaderBasicFreeLogoSettings.showTitle,
    ),
    showTags: normalizeBoolean(
      source.showTags,
      defaultHeaderBasicFreeLogoSettings.showTags,
    ),
    logoFullWidth: normalizeBoolean(
      source.logoFullWidth,
      defaultHeaderBasicFreeLogoSettings.logoFullWidth,
    ),
    logoAspectRatio: normalizeAspectRatio(
      source.logoAspectRatio,
      defaultHeaderBasicFreeLogoSettings.logoAspectRatio,
    ),
    logoCornerRadius: normalizeNonNegativeNumber(
      source.logoCornerRadius,
      defaultHeaderBasicFreeLogoSettings.logoCornerRadius,
    ),
    bannerLightPath: normalizeOptionalString(source.bannerLightPath),
    bannerDarkPath: normalizeOptionalString(source.bannerDarkPath),
    backgroundColorLight: normalizeColor(
      source.backgroundColorLight,
      defaultHeaderBasicFreeLogoSettings.backgroundColorLight,
    ),
    backgroundColorDark: normalizeColor(
      source.backgroundColorDark,
      defaultHeaderBasicFreeLogoSettings.backgroundColorDark,
    ),
  };
}

function normalizeHeaderSettings(raw: unknown): HeaderSettings {
  const source =
    raw && typeof raw === "object"
      ? (raw as { basicFreeLogo?: unknown })
      : {};

  return {
    basicFreeLogo: normalizeHeaderBasicFreeLogoSettings(source.basicFreeLogo),
  };
}

// ----------------
// MAIN NORMALIZER
// ----------------

export function normalizeLayoutSettings(
  layoutRaw: CatalogLayoutOverride | Record<string, unknown> = {},
): CatalogLayoutSettings {
  const raw = layoutRaw as CatalogLayoutOverride & {
    itemCard?: Record<string, unknown>;
    header?: {
      basicFreeLogo?: Record<string, unknown>;
    };
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
    header: normalizeHeaderSettings(raw.header),
  };
}
