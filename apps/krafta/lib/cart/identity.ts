import "server-only";

import { decodeJwt } from "jose";

import { createClient } from "@/lib/supabase/server";

export type CartIdentity = {
  userId: string;
  customerId: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The current auth uid, working for BOTH Supabase-issued sessions (anonymous
 * web shoppers) and third-party-auth sessions (the Telegram Mini App).
 *
 * We read it from the locally-stored session — `getSession()` is a pure cookie
 * read, no network — rather than `getUser()`. `getUser()` round-trips to
 * GoTrue, which only validates Supabase-issued tokens and would reject the
 * Mini App's third-party JWT (minted by Krafta, trusted by Supabase via JWKS).
 * Trusting the local session for the *uid* is safe: the real security boundary
 * is RLS at PostgREST, which re-verifies the token on every read/write, so a
 * forged session can neither read nor write another shopper's rows. When there
 * is no session at all, we start an anonymous one (the v1 guest-cart identity).
 */
async function resolveAuthUserId(
  supabase: SupabaseServerClient,
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    const sub = decodeJwt(session.access_token).sub;
    if (typeof sub === "string" && sub.length > 0) return sub;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(
      error?.message ?? "Failed to start an anonymous Supabase session.",
    );
  }
  return data.user.id;
}

/**
 * Resolves the current user to a `commerce.customers` row for the given org.
 *
 * v1 customer cart flow (KRA-37 / KRA-41): if there's no Supabase session yet
 * we sign the visitor in anonymously (`signInAnonymously`). The auth.uid then
 * becomes the stable identity that ties them to their cart, dine-in guest
 * session, and order history. The caller can later upgrade the same auth user
 * to a real account via `linkIdentity()` without losing data — the customer
 * row's `user_id` doesn't change.
 *
 * Idempotent: existing customer is returned. A partial UNIQUE index on
 * (org_id, user_id) WHERE user_id IS NOT NULL (KRA-77) guarantees one row
 * per (org, auth user) at the DB level; concurrent first calls converge on
 * the winner via the 23505 catch below.
 */
export async function ensureCartIdentity(orgId: string): Promise<CartIdentity> {
  const supabase = await createClient();

  const userId = await resolveAuthUserId(supabase);

  const { data: existing, error: selectError } = await supabase
    .schema("commerce")
    .from("customers")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    throw new Error(selectError.message);
  }

  if (existing?.id) {
    return { userId, customerId: existing.id };
  }

  const { data: created, error: insertError } = await supabase
    .schema("commerce")
    .from("customers")
    .insert({
      org_id: orgId,
      user_id: userId,
      creation_source: "guest_checkout",
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505 = unique_violation. A concurrent call created the row after our
    // initial SELECT; re-read and adopt it. The partial UNIQUE index on
    // (org_id, user_id) makes this race deterministic instead of producing
    // two rows.
    if ((insertError as { code?: string }).code === "23505") {
      const { data: raced } = await supabase
        .schema("commerce")
        .from("customers")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .single();
      if (raced?.id) return { userId, customerId: raced.id };
    }
    throw new Error(insertError.message);
  }
  if (!created) {
    throw new Error("Failed to create commerce.customers row.");
  }

  return { userId, customerId: created.id };
}
