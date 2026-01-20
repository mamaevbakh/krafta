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
  customer?: {
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
  redirectUrl: string;          // provider checkout URL (MVP)
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
