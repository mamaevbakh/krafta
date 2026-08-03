import type { SupabaseClient } from "@supabase/supabase-js";

export type PayEnvironment = "test" | "live";

/**
 * Which environment a hosted checkout belongs to.
 *
 * Every provider-account lookup in the checkout flow has to agree on this, and
 * getting it wrong is not a cosmetic bug: resolving the LIVE Atmos account for
 * a checkout a `krp_test_` key created charges a real card.
 *
 * It used to be read from a process-global `PAY_ENV` at four separate call
 * sites, which made test mode structurally impossible on a live deployment.
 * The environment is now a property of the checkout session, fixed at creation
 * from the API key.
 *
 * PAY_ENV survives only as the fallback for sessions created before the column
 * existed. Defaulting to `live` there is the safe direction: an unknown-mode
 * checkout resolving the live account is the pre-existing behaviour, whereas
 * defaulting to `test` would silently stop charging real customers.
 */
export function fallbackPayEnvironment(): PayEnvironment {
  return process.env.PAY_ENV === "test" ? "test" : "live";
}

export function toPayEnvironment(value: unknown): PayEnvironment {
  if (value === "test") return "test";
  if (value === "live") return "live";
  return fallbackPayEnvironment();
}

export async function resolveCheckoutEnvironment(
  supabase: SupabaseClient,
  publicToken: string,
): Promise<PayEnvironment> {
  const { data, error } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .select("environment")
    .eq("public_token", publicToken)
    .maybeSingle();

  if (error || !data) return fallbackPayEnvironment();
  return toPayEnvironment((data as { environment?: string }).environment);
}
