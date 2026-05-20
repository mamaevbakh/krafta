import "server-only";

import { createClient } from "@/lib/supabase/server";

// KRA-41 — anon merchant onboarding. First-time visitor taps "Create your
// shop" on the homepage CTA; we sign them in anonymously and provision a
// minimal but functional shop (org + owner membership + catalog + venue,
// 1:1 per ADR 0001 §7 Q1). The same auth.uid then survives a later
// linkIdentity() upgrade so no data moves when they register (KRA-43).
//
// RLS bootstrap problem: a brand-new visitor isn't an owner of any org
// yet, so direct INSERTs into public.organizations / organization_members
// are denied (the table's RLS expects pre-existing membership). The
// public.create_draft_shop SECURITY DEFINER RPC (KRA-41 migration) wraps
// the 4-row stamp atomically and trusts auth.uid() to identify the
// caller.

export type DraftShop = {
  orgSlug: string;
  catalogSlug: string;
  orgId: string;
  catalogId: string;
};

// 8-char base36 slug, e.g. "a3f9k2x1". ~36^8 = 2.8e12 combinations; UNIQUE
// retries on collision. The crypto-random source keeps adversarial slug
// guessing impractical.
function randomSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => (b % 36).toString(36))
    .join("");
}

/**
 * Creates an anon Supabase session + a minimal shop the visitor owns. If
 * the visitor already has an owned org with a catalog, returns the first.
 * Idempotent on repeat calls from the same session.
 */
export async function createDraftShopForAnonUser(): Promise<DraftShop> {
  const supabase = await createClient();

  // 1. Anonymous session (or reuse existing).
  let {
    data: { user },
  } = await supabase.auth.getUser();
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

  // 2. If the user already owns an org with a catalog, surface it instead
  //    of stamping a duplicate shop. Selects through organization_members
  //    so the policy join is consistent.
  const { data: existingMembership, error: membershipReadError } = await supabase
    .from("organization_members")
    .select("org_id, organizations(slug)")
    .eq("user_id", userId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (membershipReadError) throw new Error(membershipReadError.message);
  if (existingMembership) {
    const { data: existingCatalog } = await supabase
      .from("catalogs")
      .select("id, slug")
      .eq("org_id", existingMembership.org_id)
      .limit(1)
      .maybeSingle();
    if (existingCatalog) {
      const orgSlug =
        (existingMembership.organizations as { slug: string } | null)?.slug ??
        "";
      return {
        orgSlug,
        catalogSlug: existingCatalog.slug,
        orgId: existingMembership.org_id,
        catalogId: existingCatalog.id,
      };
    }
  }

  // 3. Stamp a fresh shop via the SECURITY DEFINER RPC. Retry on slug
  //    collision (rare; 23505 unique_violation surfaces as a generic
  //    Postgres error through the RPC, so match on the message tail).
  const maxAttempts = 5;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = randomSlug();
    const { data, error } = await supabase
      .rpc("create_draft_shop", { p_slug: slug })
      .single();
    if (error) {
      const code = (error as { code?: string }).code;
      const msg = (error as { message?: string }).message ?? "";
      if (code === "23505" || msg.includes("duplicate key")) {
        lastError = error;
        continue;
      }
      throw new Error(msg || "create_draft_shop failed");
    }
    if (!data) throw new Error("create_draft_shop returned no row");
    return {
      orgSlug: slug,
      catalogSlug: slug,
      orgId: data.org_id,
      catalogId: data.catalog_id,
    };
  }
  throw new Error(
    `Failed to allocate a unique shop slug after ${maxAttempts} attempts: ${String(
      lastError,
    )}`,
  );
}
