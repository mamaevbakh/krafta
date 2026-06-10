import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

// KRA-41 + KRA-42 — anon merchant onboarding. The wizard (/onboarding)
// collects vertical + shop name, then we sign the visitor in anonymously and
// provision a seeded shop (org + owner membership + catalog + paused venue +
// vertical starter catalog, 1:1 per ADR 0001 §7 Q1 / ADR 0005 §6) in ONE
// SECURITY DEFINER RPC. The same auth.uid survives the later register-at-
// Publish upgrade so no data moves (KRA-43).
//
// Idempotency lives in the RPC (ADR 0005 D5): an advisory lock + owned-org
// check inside create_draft_shop makes double-taps, wizard resubmits and
// two-tab races return the existing shop instead of stamping a duplicate.
// The app-level findOwnedShop() check is a fast path, not the guarantee.

export type DraftShop = {
  orgSlug: string;
  catalogSlug: string;
  orgId: string;
  catalogId: string;
};

export type ShopVertical = Database["public"]["Enums"]["shop_vertical"];

// 8-char base36 slug, e.g. "a3f9k2x1". This is the CREATION slug only — the
// merchant-facing slug is chosen and frozen at Publish (publish_shop, D17).
// ~36^8 = 2.8e12 combinations; UNIQUE retries on collision. The crypto-random
// source keeps adversarial slug guessing impractical.
function randomSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => (b % 36).toString(36))
    .join("");
}

/**
 * Returns the current session's owned shop, or null when there is no session
 * or no owned org+catalog yet. Used by /onboarding (resume rule, D5) and the
 * homepage CTA.
 */
export async function findOwnedShop(): Promise<DraftShop | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("org_id, organizations(slug)")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (error || !membership) return null;

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id, slug")
    .eq("org_id", membership.org_id)
    .limit(1)
    .maybeSingle();
  if (!catalog) return null;

  return {
    orgSlug: (membership.organizations as { slug: string } | null)?.slug ?? "",
    catalogSlug: catalog.slug,
    orgId: membership.org_id,
    catalogId: catalog.id,
  };
}

/**
 * Creates an anon Supabase session (or reuses the current session) and a
 * seeded shop the visitor owns. If the user already owns a shop, returns it —
 * the RPC never reseeds an existing owner.
 */
export async function createDraftShopForAnonUser(options?: {
  vertical: ShopVertical;
  name: string;
}): Promise<DraftShop> {
  const supabase = await createClient();

  // 1. Anonymous session (or reuse existing — anon OR registered).
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

  // 2. Fast path: surface the existing shop without an RPC round-trip. The
  //    RPC repeats this check under an advisory lock, so racing callers are
  //    safe regardless.
  const existing = await findOwnedShop();
  if (existing) return existing;

  // 3. Stamp a fresh seeded shop. Retry on creation-slug collision (rare;
  //    23505 unique_violation surfaces as a generic Postgres error through
  //    the RPC, so match on the message tail too).
  const maxAttempts = 5;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = randomSlug();
    const { data, error } = await supabase
      .rpc("create_draft_shop", {
        p_slug: slug,
        ...(options ? { p_vertical: options.vertical, p_name: options.name } : {}),
      })
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
