import "server-only";

import { createClient } from "@/lib/supabase/server";

export type CartIdentity = {
  userId: string;
  customerId: string;
};

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
 * Idempotent: existing customer is returned. A unique constraint on
 * (org_id, user_id) is not yet in place — see follow-up — so concurrent first
 * calls could in theory create two rows. Worth tightening when traffic
 * justifies it.
 */
export async function ensureCartIdentity(orgId: string): Promise<CartIdentity> {
  const supabase = await createClient();

  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      throw new Error(
        error?.message ?? "Failed to start an anonymous Supabase session.",
      );
    }
    user = data.user;
  }

  const userId = user.id;

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

  if (insertError || !created) {
    throw new Error(
      insertError?.message ?? "Failed to create commerce.customers row.",
    );
  }

  return { userId, customerId: created.id };
}
