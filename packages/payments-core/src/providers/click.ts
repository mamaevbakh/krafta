import type { ProviderAttemptResult } from "./index";

export async function createClickAttempt(_: any): Promise<ProviderAttemptResult> {
  // TODO: call Payme API init and return checkout url
  return {
    redirectUrl: "https://example.com/provider/payme/redirect-placeholder",
    providerPaymentId: undefined,
    status: "requires_action",
    raw: { stub: true }
  };
}
