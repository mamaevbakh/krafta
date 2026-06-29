import "server-only";

import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

import { ensureCartIdentity, type CartIdentity } from "@/lib/cart/identity";
import { getCommerceAdminClient } from "./client";
import type { CommerceKeyContext, CommerceKeyEnvironment } from "./api-keys";

// Headless cart identity (approach A — see krafta-studio-codegen-architecture.md
// → Layer 1.5). A commerce key has no cookie session, so each cart is bound to a
// fresh ANONYMOUS Supabase user. We mint that user on createCart and store its
// refresh token (server-role only, in commerce.cart_sessions) keyed by the
// SHA-256 hash of an opaque `cartToken`. Every later call rebuilds an RLS-scoped
// client authed as that anon user, so the database stays the isolation boundary —
// the exact same write path the storefront uses, never service-role + app-level
// filters.

export type CartSessionContext = {
  client: SupabaseClient<Database>;
  identity: CartIdentity;
  orgId: string;
  catalogId: string;
  environment: CommerceKeyEnvironment;
};

function anonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

function supabaseUrl() {
  return (
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  );
}

/**
 * A non-persistent anon-key Supabase client. Used to mint anonymous users and to
 * rebuild a session from a stored refresh token. NOT the storefront's cookie
 * client and NOT service-role: it carries exactly one anonymous user's JWT, so
 * RLS scopes it to that user's own cart/orders.
 */
export function getCommerceAnonClient(): SupabaseClient<Database> | null {
  const url = supabaseUrl();
  const key = anonKey();
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * An anon-key client that carries a specific user's access token on EVERY
 * request via a global Authorization header, so PostgREST resolves the request
 * as role `authenticated` (the commerce-table grants live there; the bare anon
 * role has none). We attach the header explicitly rather than rely on
 * refreshSession's in-memory session, which supabase-js does not reliably bind
 * to outgoing PostgREST/RPC calls when the session is set from an external
 * refresh token. The caller supplies the identity hint, so getSession() is never
 * needed on this client.
 */
function anonClientWithToken(
  accessToken: string,
): SupabaseClient<Database> | null {
  const url = supabaseUrl();
  const key = anonKey();
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function hashSecret() {
  return process.env.KRAFTA_COMMERCE_API_KEYS_SECRET ?? "";
}

/** sha256(pepper + ":" + cartToken). Only the hash is stored; the raw token is a
 *  bearer secret the shop persists client-side. Same peppered-hash scheme as the
 *  commerce API keys. */
function hashCartToken(token: string) {
  const hash = crypto.createHash("sha256");
  hash.update(hashSecret(), "utf8");
  hash.update(":", "utf8");
  hash.update(token, "utf8");
  return hash.digest("hex");
}

function generateCartToken(environment: CommerceKeyEnvironment) {
  return `krc_cart_${environment}_${crypto.randomBytes(24).toString("base64url")}`;
}

// commerce.cart_sessions isn't in the generated Database types until the
// migration's types are regenerated, so the table queries are cast. Tighten
// once `supabase gen types` is rerun (same posture as api-keys.ts).
type CartSessionRow = {
  customer_id: string;
  auth_user_id: string;
  org_id: string;
  catalog_id: string;
  refresh_token: string;
  environment: string;
  expires_at: string;
};

/**
 * Mint a new headless cart: a fresh anonymous Supabase user + its
 * commerce.customers row + a stored cart session. Returns the opaque cartToken
 * (shown ONCE — the shop persists it) and a client already authed as the anon
 * user, so the caller can read the (empty) cart without a second round-trip.
 */
export async function createCartSession(
  key: CommerceKeyContext,
): Promise<{ cartToken: string; ctx: CartSessionContext } | null> {
  if (!key.catalogId) return null;
  const admin = getCommerceAdminClient();
  const anon = getCommerceAnonClient();
  if (!admin || !anon) return null;

  const { data: signIn, error: signInError } =
    await anon.auth.signInAnonymously();
  if (signInError || !signIn.user || !signIn.session) return null;

  // anon is now authed in-memory as the new user; ensureCartIdentity mints the
  // commerce.customers row under that user's RLS.
  const identity = await ensureCartIdentity(key.orgId, anon);

  const cartToken = generateCartToken(key.environment);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types until regen
  const db = admin as any;
  const { error: insertError } = await db
    .schema("commerce")
    .from("cart_sessions")
    .insert({
      token_hash: hashCartToken(cartToken),
      customer_id: identity.customerId,
      auth_user_id: identity.userId,
      org_id: key.orgId,
      catalog_id: key.catalogId,
      api_key_id: key.keyId,
      refresh_token: signIn.session.refresh_token,
      environment: key.environment,
    });
  if (insertError) return null;

  return {
    cartToken,
    ctx: {
      client: anon,
      identity,
      orgId: key.orgId,
      catalogId: key.catalogId,
      environment: key.environment,
    },
  };
}

/**
 * Resolve a cartToken back to an RLS-scoped client + identity. Refreshes the
 * stored anon session and rotates the persisted refresh token. Returns null when
 * the token is unknown/expired, or when it doesn't belong to the authenticating
 * key's shop+env (cross-shop / cross-environment cart tokens are rejected).
 */
export async function clientForCartToken(
  cartToken: string,
  key: CommerceKeyContext,
): Promise<CartSessionContext | null> {
  if (!key.catalogId) return null;
  const admin = getCommerceAdminClient();
  const anon = getCommerceAnonClient();
  if (!admin || !anon) return null;

  const tokenHash = hashCartToken(cartToken);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types until regen
  const db = admin as any;
  const { data, error } = await db
    .schema("commerce")
    .from("cart_sessions")
    .select(
      "customer_id, auth_user_id, org_id, catalog_id, refresh_token, environment, expires_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as CartSessionRow;

  // Bind the token to the key's shop + environment. A cart minted for one shop
  // can never be driven with another shop's key, nor a test token with a live key.
  if (
    row.org_id !== key.orgId ||
    row.catalog_id !== key.catalogId ||
    row.environment !== key.environment
  ) {
    return null;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  const { data: refreshed, error: refreshError } = await anon.auth.refreshSession(
    { refresh_token: row.refresh_token },
  );
  if (refreshError || !refreshed.session) return null;

  // Supabase rotates refresh tokens; persist the new one so the next call works.
  if (refreshed.session.refresh_token !== row.refresh_token) {
    await db
      .schema("commerce")
      .from("cart_sessions")
      .update({
        refresh_token: refreshed.session.refresh_token,
        last_used_at: new Date().toISOString(),
      })
      .eq("token_hash", tokenHash);
  } else {
    await db
      .schema("commerce")
      .from("cart_sessions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_hash", tokenHash);
  }

  const authed = anonClientWithToken(refreshed.session.access_token);
  if (!authed) return null;

  return {
    client: authed,
    identity: { userId: row.auth_user_id, customerId: row.customer_id },
    orgId: row.org_id,
    catalogId: row.catalog_id,
    environment: row.environment as CommerceKeyEnvironment,
  };
}
