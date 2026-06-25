export type CatalogBehaviorSettings = {
  enableCart: boolean;
  /**
   * When true, the storefront's search affordance opens the conversational
   * shopping assistant instead of the plain search dialog. OFF by default —
   * it's an opt-in AI feature with a per-message cost, so merchants turn it on
   * deliberately in Settings → Catalog.
   */
  enableAssistant: boolean;
};

export const defaultBehaviorSettings: CatalogBehaviorSettings = {
  // Ordering is ON by default — a catalog with order modes (every venue has at
  // least one) is orderable out of the box. Merchants can still switch a catalog
  // to browse-only via the Studio's Cart toggle (which stores enableCart:false).
  enableCart: true,
  // AI shopping assistant is OFF by default (opt-in).
  enableAssistant: false,
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
    enableAssistant:
      typeof typed.enableAssistant === "boolean"
        ? typed.enableAssistant
        : defaultBehaviorSettings.enableAssistant,
  };
}
