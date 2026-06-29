import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

import {
  generateCommerceApiKey,
  getRuntimeCommerceEnvironment,
  type CommerceKeyType,
} from "./api-keys";

// Issue a commerce API key for a shop: generate the token, persist only its hash
// (via commerce.api_keys), and return the RAW token ONCE. The caller is
// responsible for authorization (org owner/admin) — this runs with the
// service-role admin client. The environment (test|live) is the runtime's, never
// the request's.

export type IssuedCommerceKey = {
  id: string;
  token: string; // raw — shown once, never recoverable
  prefix: string;
  last4: string;
  keyType: CommerceKeyType;
  environment: "test" | "live";
};

export async function issueCommerceKey(params: {
  admin: SupabaseClient<Database>;
  orgId: string;
  catalogId: string;
  keyType?: CommerceKeyType;
  name?: string;
}): Promise<IssuedCommerceKey | null> {
  const environment = getRuntimeCommerceEnvironment();
  const keyType = params.keyType ?? "publishable";
  const generated = generateCommerceApiKey({ keyType, environment });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types until regen
  const db = params.admin as any;
  const { data, error } = await db
    .schema("commerce")
    .from("api_keys")
    .insert({
      org_id: params.orgId,
      catalog_id: params.catalogId,
      key_type: keyType,
      environment,
      name:
        params.name?.trim() ||
        (keyType === "secret" ? "Secret key" : "Publishable key"),
      prefix: generated.prefix,
      last4: generated.last4,
      hashed_key: generated.hashedKey,
    })
    .select("id")
    .single();

  if (error || !data) return null;

  return {
    id: data.id as string,
    token: generated.token,
    prefix: generated.prefix,
    last4: generated.last4,
    keyType,
    environment,
  };
}
