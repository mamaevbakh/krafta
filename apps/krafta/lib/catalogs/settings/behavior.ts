export type CatalogBehaviorSettings = {
  enableCart: boolean;
};

export const defaultBehaviorSettings: CatalogBehaviorSettings = {
  enableCart: false,
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
