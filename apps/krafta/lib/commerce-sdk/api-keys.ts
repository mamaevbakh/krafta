import "server-only";

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Krafta commerce API-key auth — the public-API counterpart of Krafta Pay's
// authenticateMerchantApiKey (apps/krafta-pay/src/lib/api-keys.ts), adapted for
// commerce.api_keys: two key classes (publishable / secret), and the org +
// catalog are derived from the key, never the request body.
//
// Token format: krc_<pub|sk>_<test|live>_<base64url(24 bytes)>.
// Hash: sha256(serverPepper + ":" + rawToken). The pepper lives in
// KRAFTA_COMMERCE_API_KEYS_SECRET (never in the DB).

export type CommerceKeyType = "publishable" | "secret";
export type CommerceKeyEnvironment = "test" | "live";

export class CommerceAuthError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "CommerceAuthError";
    this.code = code;
  }
}

export type CommerceKeyContext = {
  keyId: string;
  orgId: string;
  catalogId: string | null;
  keyType: CommerceKeyType;
  environment: CommerceKeyEnvironment;
};

function hashSecret() {
  return process.env.KRAFTA_COMMERCE_API_KEYS_SECRET ?? "";
}

function hashApiKey(rawKey: string) {
  const hash = crypto.createHash("sha256");
  hash.update(hashSecret(), "utf8");
  hash.update(":", "utf8");
  hash.update(rawKey, "utf8");
  return hash.digest("hex");
}

function prefixFor(keyType: CommerceKeyType, environment: CommerceKeyEnvironment) {
  return `krc_${keyType === "publishable" ? "pub" : "sk"}_${environment}_`;
}

export function getRuntimeCommerceEnvironment(): CommerceKeyEnvironment {
  return process.env.COMMERCE_ENV === "live" ? "live" : "test";
}

export function parseCommerceKey(
  token: string,
): { keyType: CommerceKeyType; environment: CommerceKeyEnvironment } | null {
  const combos: Array<{ keyType: CommerceKeyType; environment: CommerceKeyEnvironment }> = [
    { keyType: "publishable", environment: "live" },
    { keyType: "publishable", environment: "test" },
    { keyType: "secret", environment: "live" },
    { keyType: "secret", environment: "test" },
  ];
  for (const combo of combos) {
    if (token.startsWith(prefixFor(combo.keyType, combo.environment))) return combo;
  }
  return null;
}

function parseBearer(header: string | null) {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

/** Mint a new commerce key. Returns the raw token ONCE; only the hash persists. */
export function generateCommerceApiKey(params: {
  keyType: CommerceKeyType;
  environment: CommerceKeyEnvironment;
}) {
  const prefix = prefixFor(params.keyType, params.environment);
  const token = `${prefix}${crypto.randomBytes(24).toString("base64url")}`;
  return {
    token,
    hashedKey: hashApiKey(token),
    prefix: token.slice(0, 20),
    last4: token.slice(-4),
    keyType: params.keyType,
    environment: params.environment,
  };
}

/**
 * Authenticate a bearer commerce key against commerce.api_keys (service-role).
 * Throws CommerceAuthError (fail-closed) on any problem — missing/malformed
 * key, wrong environment, revoked, not found, or table-not-present (pre-
 * migration). Returns the org + catalog the key is bound to.
 *
 * The `commerce.api_keys` table isn't in the generated Database types until the
 * migration is applied, so the query is cast; tighten once types are regen'd.
 */
export async function authenticateCommerceApiKey(params: {
  supabase: SupabaseClient<Database>;
  authorizationHeader: string | null;
  required?: CommerceKeyType;
}): Promise<CommerceKeyContext> {
  const token = parseBearer(params.authorizationHeader);
  if (!token) throw new CommerceAuthError("missing_api_key");

  const parsed = parseCommerceKey(token);
  if (!parsed) throw new CommerceAuthError("invalid_api_key_format");

  if (parsed.environment !== getRuntimeCommerceEnvironment()) {
    throw new CommerceAuthError("invalid_api_key_environment");
  }
  if (params.required === "secret" && parsed.keyType !== "secret") {
    throw new CommerceAuthError("secret_key_required");
  }

  const hashedKey = hashApiKey(token);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types until migration is applied
  const db = params.supabase as any;
  const { data, error } = await db
    .schema("commerce")
    .from("api_keys")
    .select("id, org_id, catalog_id, key_type, environment, revoked_at")
    .eq("hashed_key", hashedKey)
    .eq("environment", parsed.environment)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) throw new CommerceAuthError("invalid_api_key");

  const row = data as {
    id: string;
    org_id: string;
    catalog_id: string | null;
    key_type: string;
  };

  return {
    keyId: row.id,
    orgId: row.org_id,
    catalogId: row.catalog_id,
    keyType: row.key_type === "secret" ? "secret" : "publishable",
    environment: parsed.environment,
  };
}
