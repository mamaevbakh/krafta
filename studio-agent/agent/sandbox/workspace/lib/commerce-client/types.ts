// Public type surface for the Krafta commerce engine.
//
// Money is ALWAYS in integer cents = major unit × 100 (UZS included — the
// price-cents invariant). The client never builds or sums money; every total
// shown comes from the engine.

/** Integer cents: major currency unit × 100 (UZS too). */
export type Cents = number;

export type OrderMode = "dine_in" | "pickup" | "delivery";

export type Currency = { code: string; label: string };

export type Modifier = {
  id: string;
  name: string;
  priceCents: Cents;
  onByDefault: boolean;
};

export type ModifierList = {
  id: string;
  name: string;
  type: "list" | "text";
  minSelected: number;
  maxSelected: number | null;
  textRequired: boolean;
  maxLength: number | null;
  modifiers: Modifier[];
};

export type Variation = {
  id: string;
  name: string;
  priceCents: Cents;
  isDefault: boolean;
  isSoldOut: boolean;
};

export type Item = {
  id: string;
  slug: string | null;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** Price of the default variation, in cents. */
  priceCents: Cents;
  variations: Variation[];
  modifierLists: ModifierList[];
};

export type Category = {
  id: string;
  slug: string | null;
  name: string;
  items: Item[];
};

export type Tax = {
  id: string;
  name: string;
  kind: "tax" | "service_fee";
  inclusionType: "additive" | "included";
  percentage: number;
};

export type Catalog = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currency: Currency;
  orderModes: OrderMode[];
  categories: Category[];
  taxes: Tax[];
};

export type SearchResult = {
  entityId: string;
  kind: "item" | "category";
  title: string;
  category: string | null;
  description: string | null;
  score: number;
};

/** A modifier selection for a cart line. */
export type ModifierSelection = {
  modifierListId: string;
  /** For list modifiers: chosen modifier ids. */
  modifierIds?: string[];
  /** For text modifiers: the free-text value. */
  text?: string;
};

/** The client sends only ids + quantities + selections — never prices. */
export type CartLineInput = {
  itemId: string;
  variationId: string;
  qty: number;
  modifiers?: ModifierSelection[];
};

export type CartLine = {
  lineId: string;
  itemId: string;
  variationId: string;
  name: string;
  qty: number;
  /** Server-computed; render via <Price>, never recompute. */
  unitPriceCents: Cents;
  lineTotalCents: Cents;
  modifiers: Array<{ name: string; priceCents: Cents }>;
};

export type Cart = {
  cartToken: string;
  lines: CartLine[];
  subtotalCents: Cents;
  currency: Currency;
};

export type FeeLine = {
  name: string;
  kind: "tax" | "service_fee";
  inclusionType: "additive" | "included";
  amountCents: Cents;
  percentage: number;
};

/** Server-authoritative pricing. Display only; never summed client-side. */
export type PricingBreakdown = {
  subtotalCents: Cents;
  feeLines: FeeLine[];
  additiveFeesCents: Cents;
  includedFeesCents: Cents;
  deliveryFeeCents: Cents;
  tipCents: Cents;
  totalCents: Cents;
  currency: Currency;
};

export type PricingInput = {
  mode?: OrderMode;
  tipCents?: Cents;
  deliveryCoords?: { lat: number; lng: number };
};

export type CheckoutFields = {
  name?: string;
  phone?: string;
  /** dine_in */
  table?: string;
  /** delivery */
  address?: string;
  apartment?: string;
  note?: string;
  coords?: { lat: number; lng: number };
  /** pickup/delivery */
  scheduledFor?: string;
};

export type CheckoutInput = {
  mode: OrderMode;
  fields: CheckoutFields;
  tipCents?: Cents;
};

/** Typed checkout failures the storefront should handle, not retry blindly. */
export type CheckoutErrorCode =
  | "price_changed"
  | "out_of_zone"
  | "below_min_order"
  | "phone_invalid"
  | "tip_too_high"
  | "cart_empty";

export type OrderState =
  | "open"
  | "reserved"
  | "prepared"
  | "completed"
  | "canceled";

export type CheckoutResult = {
  orderId: string;
  state: OrderState;
};

export type Order = {
  id: string;
  state: OrderState;
  mode: OrderMode;
  lines: CartLine[];
  pricing: PricingBreakdown;
  paymentStatus: "pending" | "completed";
  createdAt: string | null;
};

export type CommerceClientConfig = {
  /** Krafta engine base URL, e.g. "https://www.krafta.org". */
  apiUrl: string;
  /** Publishable key (krc_pub_…). Browser-safe; binds the shop's org. */
  publishableKey: string;
  /** Optional explicit catalog id; otherwise the key's bound catalog is used. */
  catalogId?: string;
  /** Override fetch (SSR / edge / tests). Defaults to global fetch. */
  fetch?: typeof fetch;
};
