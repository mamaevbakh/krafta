import type { SupabaseClient } from "@supabase/supabase-js";
import { createPaymeAttempt } from "./payme";
import { createClickAttempt } from "./click";
import { createUzumAttempt } from "./uzum";

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
  redirectUrl: string;
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
    default:
      throw new Error(`unsupported_provider: ${ctx.providerId}`);
  }
}
