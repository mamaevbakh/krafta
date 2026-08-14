export type Environment = "test" | "live";

export type CreateCheckoutSessionInput = {
  orgId: string;                // merchant org
  amountMinor: number;          // >= 0
  currency: string;             // e.g. "UZS", "USD"
  description?: string;
  orderId?: string;             // your internal order id
  successUrl?: string;
  cancelUrl?: string;
  returnUrl?: string;           // fallback return URL
  /** test | live. Fixed at creation; decides which acquirer may charge it. */
  environment?: "test" | "live";
  /**
   * Whether the provider order must keep the customer's card.
   *
   * Omit it. The default is `required`, which is what a subscription, a card
   * update and anything unrecognised needs — and getting this wrong towards
   * `none` on a subscription means renewals can never charge.
   *
   * Only pass `none` from a route that structurally cannot create a
   * subscription. It makes the checkout a plain payment: the customer is asked
   * to pay rather than to add a card, and no card is kept afterwards.
   */
  cardBinding?: "required" | "none";
  customerId?: string;          // existing customer in payments.customers
  customer?: {
    /**
     * How the merchant recognises this payer — the first column of their
     * Customers page. Send it whenever you know it: without a name that page
     * can only show an email address, and a school collecting from parents is
     * not looking for an inbox. Free text; names here are not reliably
     * two-part.
     */
    name?: string;
    email?: string;
    phone?: string;
    customerUserRef?: string;   // external user id in your app
  };
  metadata?: Record<string, unknown>;
};

export type CreateCheckoutSessionResult = {
  checkoutSessionId: string;
  paymentIntentId: string;
  publicToken: string;
  payUrl: string;               // e.g. https://pay.krafta.uz/pay/{publicToken}
};

export type SelectProviderInput = {
  publicToken: string;
  providerId: string;           // "payme" | "click" | "uzum"
  // Provider-specific hint for how the payment UI should be presented.
  // Uzum supports: "WEB_VIEW" | "IFRAME" | "REDIRECT".
  viewType?: "WEB_VIEW" | "IFRAME" | "REDIRECT";
};

export type SelectProviderResult = {
  attemptId: string;
  // How the client should present the next step:
  // - "redirect": navigate to redirectUrl (Uzum and other hosted-page providers)
  // - "inline":   render the provider card form on pay.krafta.uz (Atmos); no redirectUrl
  mode?: "redirect" | "inline";
  redirectUrl?: string;         // present for redirect-mode providers
};

export type HandleWebhookInput = {
  providerId: string;
  rawBody: string;
  headers: Record<string, string | null>;
};

export type HandleWebhookResult = {
  ok: true;
  // When a webhook can be mapped to a known checkout session, these fields are returned
  // so the caller can trigger best-effort push updates (e.g. Realtime broadcast).
  checkoutPublicToken?: string;
  paymentIntentId?: string;
};
