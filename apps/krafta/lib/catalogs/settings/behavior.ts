export type CatalogBehaviorSettings = {
  enableCart: boolean;
};

export const defaultBehaviorSettings: CatalogBehaviorSettings = {
  // Ordering is ON by default — a catalog with order modes (every venue has at
  // least one) is orderable out of the box. Merchants can still switch a catalog
  // to browse-only via the Studio's Cart toggle (which stores enableCart:false).
  enableCart: true,
};

export function normalizeBehaviorSettings(
  raw: Partial<CatalogBehaviorSettings> | Record<string, unknown> = {},
): CatalogBehaviorSettings {
  const typed = raw as Partial<CatalogBehaviorSettings>;
  return {
    enableCart:
      typeof typed.enableCart === "boolean"
        ? typed.enableCart
        : defaultBehaviorSettings.enableCart,
  };
}
