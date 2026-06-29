import type {
  Cart,
  CartLineInput,
  Catalog,
  CheckoutInput,
  CheckoutResult,
  CommerceClientConfig,
  Item,
  Order,
  PricingBreakdown,
  PricingInput,
  SearchResult,
} from "./types";

/**
 * A commerce request that failed. `code` is the engine's stable error code
 * (e.g. a CheckoutErrorCode like "out_of_zone", or "unauthorized" /
 * "not_found"), suitable for branching in shop UI. Never echoes DB internals.
 */
export class CommerceError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "CommerceError";
    this.code = code;
    this.status = status;
  }
}

export type CommerceClient = {
  /** Full catalog tree (categories → items → variations → modifiers) + taxes. */
  getCatalog(opts?: { locale?: string }): Promise<Catalog>;
  /** A single item with its variations + modifier lists, for a product page. */
  getItem(idOrSlug: string, opts?: { locale?: string }): Promise<Item>;
  /** Hybrid search across the bound catalog. */
  search(
    query: string,
    opts?: { limit?: number; locale?: string },
  ): Promise<SearchResult[]>;
  /** Mint a cart + its opaque bearer token (persist it client-side). */
  createCart(): Promise<Cart>;
  getCart(cartToken: string): Promise<Cart>;
  /** Batch absolute-quantity upsert. Server re-prices every line. */
  setLines(cartToken: string, lines: CartLineInput[]): Promise<Cart>;
  /** Server-authoritative pricing preview (taxes, fees, delivery, tip). */
  getCartPricing(
    cartToken: string,
    input?: PricingInput,
  ): Promise<PricingBreakdown>;
  /** Place the order. Throws CommerceError with a CheckoutErrorCode on failure. */
  checkout(cartToken: string, input: CheckoutInput): Promise<CheckoutResult>;
  /** Read a placed order (scoped to the cart token that created it). */
  getOrder(orderId: string, cartToken: string): Promise<Order>;
};

/**
 * Create a Krafta commerce client bound to one shop via its publishable key.
 *
 * The client only ever sends ids, quantities, modifier selections, mode, tip,
 * and coords — never prices or totals. The engine re-reads and recomputes all
 * money server-side, so a generated shop can render commerce and restyle 100%
 * but can never get the math wrong.
 */
export function createCommerceClient(
  config: CommerceClientConfig,
): CommerceClient {
  const doFetch = config.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error(
      "@/lib/commerce-client: no fetch available. Pass `fetch` in the client config.",
    );
  }
  const base = `${config.apiUrl.replace(/\/+$/, "")}/api/commerce/v1`;

  async function request<T>(
    method: string,
    path: string,
    opts?: { query?: Record<string, string | number | undefined>; body?: unknown },
  ): Promise<T> {
    const url = new URL(base + path);
    if (config.catalogId) url.searchParams.set("catalogId", config.catalogId);
    for (const [key, value] of Object.entries(opts?.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const res = await doFetch(url.toString(), {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.publishableKey}`,
      },
      body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
    });

    if (!res.ok) {
      let code = "request_failed";
      let message = `Commerce API ${method} ${path} failed (${res.status}).`;
      try {
        const data = (await res.json()) as { error?: string; message?: string };
        if (data?.error) code = data.error;
        if (data?.message) message = data.message;
      } catch {
        // non-JSON error body; keep the generic message
      }
      throw new CommerceError(code, message, res.status);
    }

    return (await res.json()) as T;
  }

  const cartPath = (cartToken: string, suffix = "") =>
    `/carts/${encodeURIComponent(cartToken)}${suffix}`;

  return {
    getCatalog: (opts) =>
      request<Catalog>("GET", "/catalog", { query: { locale: opts?.locale } }),

    getItem: (idOrSlug, opts) =>
      request<Item>("GET", `/items/${encodeURIComponent(idOrSlug)}`, {
        query: { locale: opts?.locale },
      }),

    search: (query, opts) =>
      request<{ results: SearchResult[] }>("POST", "/search", {
        body: { query, limit: opts?.limit, locale: opts?.locale },
      }).then((r) => r.results),

    createCart: () => request<Cart>("POST", "/carts", { body: {} }),

    getCart: (cartToken) => request<Cart>("GET", cartPath(cartToken)),

    setLines: (cartToken, lines) =>
      request<Cart>("PUT", cartPath(cartToken, "/lines"), { body: { lines } }),

    getCartPricing: (cartToken, input) =>
      request<PricingBreakdown>("POST", cartPath(cartToken, "/pricing"), {
        body: input ?? {},
      }),

    checkout: (cartToken, input) =>
      request<CheckoutResult>("POST", cartPath(cartToken, "/checkout"), {
        body: input,
      }),

    getOrder: (orderId, cartToken) =>
      request<Order>("GET", `/orders/${encodeURIComponent(orderId)}`, {
        query: { cartToken },
      }),
  };
}
