import type { SupabaseClient } from "@supabase/supabase-js";

export function assertNonNegativeAmount(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("amount_minor must be a non-negative number");
  }
}

export async function getCheckoutSessionByPublicToken(
  supabase: SupabaseClient,
  publicToken: string,
) {
  const { data, error } = await supabase
    .schema("payments")
    .from("checkout_sessions")
    .select("*")
    .eq("public_token", publicToken)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("checkout_session_not_found");
  return data;
}

export async function listActiveProvidersForOrg(
  supabase: SupabaseClient,
  orgId: string,
  environment: "test" | "live",
) {
  // Join through org_provider_accounts to providers
  const { data, error } = await supabase
    .schema("payments")
    .from("org_provider_accounts")
    .select("provider_id, display_label, status, providers:provider_id(id, display_name, is_active, capabilities)")
    .eq("org_id", orgId)
    .eq("environment", environment)
    .eq("status", "active");

  if (error) throw error;

  // Filter provider is_active
  return (data ?? [])
    .filter((row: any) => row.providers?.is_active)
    .map((row: any) => ({
      providerId: row.provider_id as string,
      displayName: row.providers.display_name as string,
      capabilities: row.providers.capabilities as Record<string, unknown>,
      displayLabel: row.display_label as string | null,
    }));
}
