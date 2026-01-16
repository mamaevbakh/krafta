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
};
