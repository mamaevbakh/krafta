import type { SupabaseClient } from "@supabase/supabase-js";

// A merchant can't create payment links or subscriptions until they've connected
// at least one active payment provider for the current environment. This mirrors
// the filter the hosted pay page uses, so "can the customer actually pay?" and
// "can the merchant create a link?" stay in agreement.
export type OrgProviderStatus = {
  hasActive: boolean;
  providers: { id: string; name: string }[];
  environment: string;
};

export async function getOrgProviderStatus(
  admin: SupabaseClient,
  orgId: string,
  environment: string,
): Promise<OrgProviderStatus> {
  if (!orgId) return { hasActive: false, providers: [], environment };
  const { data } = await admin
    .schema("payments")
    .from("org_provider_accounts")
    .select("provider_id, status, providers:provider_id(display_name, is_active)")
    .eq("org_id", orgId)
    .eq("environment", environment)
    .eq("status", "active");
  const providers = (data ?? [])
    .filter((a: any) => a.providers?.is_active)
    .map((a: any) => ({
      id: a.provider_id as string,
      name: (a.providers?.display_name as string) ?? a.provider_id,
    }));
  return { hasActive: providers.length > 0, providers, environment };
}
