// @/lib/commerce-client — the typed client a generated/ejected Krafta Studio shop
// uses to drive Krafta's commerce engine through a publishable key. The engine
// keeps pricing server-authoritative; this package never builds or sums money.
//
// Usage in a generated shop:
//   import { createCommerceClient } from "@/lib/commerce-client";
//   export const commerce = createCommerceClient({
//     apiUrl: process.env.NEXT_PUBLIC_KRAFTA_API_URL!,
//     publishableKey: process.env.NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY!,
//   });
//
// See apps/krafta/docs/krafta-studio-codegen-architecture.md.
export { createCommerceClient, CommerceError } from "./client";
export type { CommerceClient } from "./client";
export type {
  Cents,
  OrderMode,
  Currency,
  Modifier,
  ModifierList,
  Variation,
  Item,
  Category,
  Tax,
  Catalog,
  SearchResult,
  ModifierSelection,
  CartLineInput,
  CartLine,
  Cart,
  FeeLine,
  PricingBreakdown,
  PricingInput,
  CheckoutFields,
  CheckoutInput,
  CheckoutErrorCode,
  OrderState,
  CheckoutResult,
  Order,
  CommerceClientConfig,
} from "./types";
