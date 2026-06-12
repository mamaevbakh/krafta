import type { SupabaseClient } from "@supabase/supabase-js";
import { createPaymeAttempt } from "./payme";
import { createClickAttempt } from "./click";
import { createUzumAttempt } from "./uzum";
import { createAtmosAttempt } from "./atmos";

type CreateAttemptCtx = {
  supabase: SupabaseClient;
  providerId: string;
  orgProviderAccountId: string;
  environment: "test" | "live";
  paymentIntentId: string;
  paymentAttemptId: string;
  publicToken: string;
  payBaseUrl: string;
  viewType?: "WEB_VIEW" | "IFRAME" | "REDIRECT";
};

export type ProviderAttemptResult = {
  // "redirect" (default) hands the client a redirectUrl to navigate to.
  // "inline" providers (Atmos) collect the card on pay.krafta.uz and have no redirectUrl.
  mode?: "redirect" | "inline";
  redirectUrl?: string;
  providerPaymentId?: string;
  status?: "requires_action" | "processing";
  raw?: Record<string, unknown>;
};

export async function createProviderAttempt(ctx: CreateAttemptCtx): Promise<ProviderAttemptResult> {
  switch (ctx.providerId) {
    case "payme":
      return createPaymeAttempt(ctx);
    case "click":
      return createClickAttempt(ctx);
    case "uzum":
      return createUzumAttempt(ctx);
    case "atmos":
      // Inline provider: card collected on pay.krafta.uz; no Atmos call here.
      return createAtmosAttempt(ctx);
    default:
      throw new Error(`unsupported_provider: ${ctx.providerId}`);
  }
}
