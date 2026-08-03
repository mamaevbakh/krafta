import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@krafta/supabase/database.types";

type ApiKeyEnvironment = "test" | "live";

type AdminSupabaseClient = SupabaseClient<Database>;

const TOKEN_PREFIX_TEST = "krp_test_";
const TOKEN_PREFIX_LIVE = "krp_live_";

function getApiKeyHashSecret() {
  return process.env.KRAFTA_PAY_API_KEYS_SECRET ?? process.env.KRAFTA_PAY_INTERNAL_SECRET ?? "";
}

function toApiKeyEnvironment(value: string | null | undefined): ApiKeyEnvironment {
  return value === "live" ? "live" : "test";
}

export function getRuntimePayEnvironment(): ApiKeyEnvironment {
  return toApiKeyEnvironment(process.env.PAY_ENV);
}

export function parseApiKeyEnvironmentFromToken(token: string): ApiKeyEnvironment | null {
  if (token.startsWith(TOKEN_PREFIX_TEST)) return "test";
  if (token.startsWith(TOKEN_PREFIX_LIVE)) return "live";
  return null;
}

function hashApiKey(rawKey: string) {
  const hash = crypto.createHash("sha256");
  hash.update(getApiKeyHashSecret(), "utf8");
  hash.update(":", "utf8");
  hash.update(rawKey, "utf8");
  return hash.digest("hex");
}

function randomSecret(size = 32) {
  return crypto.randomBytes(size).toString("base64url");
}

export function generateApiKey(params: { environment: ApiKeyEnvironment }) {
  const prefix = params.environment === "live" ? TOKEN_PREFIX_LIVE : TOKEN_PREFIX_TEST;
  const token = `${prefix}${randomSecret(24)}`;
  const hashedKey = hashApiKey(token);
  return {
    token,
    hashedKey,
    prefix: token.slice(0, Math.min(token.length, 16)),
    last4: token.slice(-4),
    environment: params.environment,
  };
}

export function parseBearerToken(header: string | null) {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

export async function authenticateMerchantApiKey(params: {
  supabase: AdminSupabaseClient;
  authorizationHeader: string | null;
}) {
  const token = parseBearerToken(params.authorizationHeader);
  if (!token) {
    throw new Error("missing_api_key");
  }

  const tokenEnvironment = parseApiKeyEnvironmentFromToken(token);
  if (!tokenEnvironment) {
    throw new Error("invalid_api_key_format");
  }

  // The key IS the environment — deliberately no comparison against a global
  // PAY_ENV here. That check used to reject every `krp_test_` key on the live
  // deployment, so a new merchant could not integrate against test mode before
  // going live: the whole "integrate in an afternoon" promise died on it. Both
  // modes now coexist on one deployment; the environment travels with the data
  // (payment_intents / checkout_sessions / subscriptions / customers) and
  // decides which org_provider_account actually charges.
  const hashedKey = hashApiKey(token);
  const { data: apiKey, error } = await params.supabase
    .schema("payments")
    .from("api_keys")
    .select("id, org_id, environment, name, revoked_at")
    .eq("hashed_key", hashedKey)
    .eq("environment", tokenEnvironment)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!apiKey) {
    throw new Error("invalid_api_key");
  }

  return {
    keyId: apiKey.id,
    merchantOrgId: apiKey.org_id,
    environment: toApiKeyEnvironment(apiKey.environment),
    name: apiKey.name,
  };
}
