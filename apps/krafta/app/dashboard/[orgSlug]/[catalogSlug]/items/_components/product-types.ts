export const ALL_CATALOG_ITEM_PRODUCT_TYPES = [
  "REGULAR",
  "APPOINTMENTS_SERVICE",
  "FOOD_AND_BEV",
  "EVENT",
  "DIGITAL",
  "DONATION",
  "ONLINE_SERVICE",
  "ONLINE_MEMBERSHIP",
] as const

export type CatalogItemProductType =
  (typeof ALL_CATALOG_ITEM_PRODUCT_TYPES)[number]

export const ENABLED_CATALOG_ITEM_PRODUCT_TYPES = [
  "REGULAR",
  "FOOD_AND_BEV",
] as const satisfies readonly CatalogItemProductType[]

export function isCatalogItemProductType(
  value: string,
): value is CatalogItemProductType {
  return (ALL_CATALOG_ITEM_PRODUCT_TYPES as readonly string[]).includes(value)
}

export function isEnabledCatalogItemProductType(
  value: CatalogItemProductType,
): boolean {
  return (ENABLED_CATALOG_ITEM_PRODUCT_TYPES as readonly string[]).includes(value)
}

export type CatalogItemProductTypeOption = {
  value: CatalogItemProductType
  title: string
  description: string
  badge?: string
}

export const CATALOG_ITEM_PRODUCT_TYPE_OPTIONS: CatalogItemProductTypeOption[] = [
  {
    value: "FOOD_AND_BEV",
    title: "Prepared food and beverage",
    description:
      "Food and beverage items for restaurants, cafes, and ordering menus.",
  },
  {
    value: "REGULAR",
    title: "Physical good",
    description: "Ordinary merchandise and products sold in catalogs and stores.",
  },
  {
    value: "EVENT",
    title: "Event",
    description:
      "Tickets and event-based sales with schedule and venue details.",
  },
  {
    value: "DIGITAL",
    title: "Digital",
    description:
      "Digital products such as files, ebooks, downloads, or digital access.",
  },
  {
    value: "DONATION",
    title: "Donation",
    description: "Open-ended contributions for a cause, creator, or campaign.",
  },
  {
    value: "APPOINTMENTS_SERVICE",
    title: "Appointments service",
    description:
      "Bookable services that require scheduling, staffing, and time slots.",
  },
  {
    value: "ONLINE_SERVICE",
    title: "Online service",
    description:
      "Legacy manually fulfilled online service (Square compatibility).",
    badge: "Legacy",
  },
  {
    value: "ONLINE_MEMBERSHIP",
    title: "Online membership",
    description:
      "Legacy manually fulfilled online membership (Square compatibility).",
    badge: "Legacy",
  },
]

export function getCatalogItemProductTypeLabel(
  value: CatalogItemProductType,
): string {
  return (
    CATALOG_ITEM_PRODUCT_TYPE_OPTIONS.find((option) => option.value === value)
      ?.title ?? value
  )
}
