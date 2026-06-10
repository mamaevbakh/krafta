"use server";

// KRA-43 / ADR 0005 §4 — the Publish flow's server side.
//
// Step machine (client lives in publish-dialog.tsx):
//   preflight → slug confirm → demo nudge → register (anon only) → publish_shop
//   → celebration (live link + QR + Telegram order-alerts beat).
//
// Identity upgrade APIs are split by method (eng review D2):
//   email  — updateUser({email}) + verifyOtp(type 'email_change'); NOT
//            linkIdentity, which only does OAuth.
//   google — linkIdentity (requires the manual-linking flag on the project).
// Both hard-fail when the identity already belongs to another user; that
// collision resolves through the claim handshake (claim_draft_shop_initiate /
// _complete RPCs) so the draft survives.

import { headers } from "next/headers";

import { getRequestOrigin } from "@/lib/auth/redirect";
import { isValidSlug, suffixSlug, suggestSlug } from "@/lib/onboarding/slug";
import { renderQrSvg } from "@/lib/qr/render";
import { createClient } from "@/lib/supabase/server";

export type PublishPreflight = {
  orgId: string;
  catalogId: string;
  shopName: string;
  venueStatus: string;
  /** Transliterated, availability-checked suggestion for the final slug. */
  suggestedSlug: string;
  /** Seeded items never edited since creation (D19). */
  demoItems: { id: string; name: string }[];
  isAnonymous: boolean;
};

export async function getPublishPreflight(params: {
  orgSlug: string;
  catalogSlug: string;
}): Promise<PublishPreflight | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", params.orgSlug)
    .maybeSingle();
  if (!org) return { error: "Organization not found." };

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id, name")
    .eq("org_id", org.id)
    .eq("slug", params.catalogSlug)
    .maybeSingle();
  if (!catalog) return { error: "Catalog not found." };

  const { data: venue } = await supabase
    .from("venues")
    .select("status")
    .eq("catalog_id", catalog.id)
    .maybeSingle();

  // Untouched demo items: seeded and never edited (updated_at still equals
  // created_at). Edited seeds are the merchant's real menu now — not nagged.
  const { data: items } = await supabase
    .from("items")
    .select("id, name, created_at, updated_at, seeded_at")
    .eq("catalog_id", catalog.id)
    .not("seeded_at", "is", null);
  const demoItems = (items ?? [])
    .filter((i) => i.updated_at === i.created_at)
    .map((i) => ({ id: i.id, name: i.name }));

  return {
    orgId: org.id,
    catalogId: catalog.id,
    shopName: catalog.name,
    venueStatus: venue?.status ?? "paused",
    suggestedSlug: await findAvailableSlug(catalog.name, org.slug),
    demoItems,
    isAnonymous: Boolean(
      (user as { is_anonymous?: boolean }).is_anonymous ?? false,
    ),
  };
}

/** Transliterates the shop name and walks -2, -3… past taken org slugs. */
async function findAvailableSlug(
  shopName: string,
  currentSlug: string,
): Promise<string> {
  const supabase = await createClient();
  const base = suggestSlug(shopName);
  if (!base) return currentSlug; // untransliterable name → keep random slug
  if (base === currentSlug) return base;

  for (let n = 0; n < 5; n++) {
    const candidate = n === 0 ? base : suffixSlug(base, n + 1);
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return currentSlug;
}

export async function removeDemoItems(params: {
  catalogId: string;
  itemIds: string[];
}): Promise<{ removed: number } | { error: string }> {
  if (params.itemIds.length === 0) return { removed: 0 };
  const supabase = await createClient();
  // One bulk DELETE = one transaction; search-doc cleanup happens via the
  // existing AFTER DELETE triggers (never add app-level sync, KRA-88).
  const { error, count } = await supabase
    .from("items")
    .delete({ count: "exact" })
    .eq("catalog_id", params.catalogId)
    .in("id", params.itemIds)
    .not("seeded_at", "is", null);
  if (error) return { error: error.message };
  return { removed: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Register: email OTP (anon → permanent via updateUser + email_change OTP)
// ---------------------------------------------------------------------------

export async function registerPublishEmail(
  email: string,
): Promise<{ sent: true } | { collision: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") && (msg.includes("regist") || msg.includes("exist"))) {
      return { collision: true };
    }
    return { error: error.message };
  }
  return { sent: true };
}

export async function verifyPublishOtp(
  email: string,
  token: string,
): Promise<{ verified: true } | { error: string }> {
  const supabase = await createClient();
  // Anon → email conversion confirms as an email CHANGE on the existing user
  // (the uid must survive — that's the whole point). Some project configs
  // issue plain 'email' OTPs instead; try both before failing.
  const change = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email_change",
  });
  if (!change.error && change.data.user) return { verified: true };
  const plain = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (!plain.error && plain.data.user) return { verified: true };
  return { error: change.error?.message ?? plain.error?.message ?? "Verification failed" };
}

// ---------------------------------------------------------------------------
// Register: Google (linkIdentity — OAuth redirect round-trip)
// ---------------------------------------------------------------------------

export async function linkGoogleForPublish(
  nextPath: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const origin = getRequestOrigin(await headers());
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`,
    },
  });
  if (error) return { error: error.message };
  if (data.url) return { url: data.url };
  return { error: "Failed to start Google sign-in." };
}

// ---------------------------------------------------------------------------
// Identity collision → claim handshake (D2). The anon session mints a
// possession proof BEFORE the browser switches to the existing account; the
// registered session redeems it and the draft's ownership moves over.
// ---------------------------------------------------------------------------

export async function initiateDraftClaim(): Promise<
  { code: string } | { error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_draft_shop_initiate");
  if (error) return { error: error.message };
  return { code: data as string };
}

export async function completeDraftClaim(code: string): Promise<
  { orgSlug: string; catalogSlug: string } | { error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("claim_draft_shop_complete", { p_claim_code: code })
    .single();
  if (error) return { error: error.message };
  return { orgSlug: data.org_slug, catalogSlug: data.catalog_slug };
}

// ---------------------------------------------------------------------------
// publish_shop — dual gate + final slug (D15/D16/D17), then the celebration
// payload (live URL + QR) rendered server-side.
// ---------------------------------------------------------------------------

export type PublishResult = {
  orgSlug: string;
  catalogSlug: string;
  venueSlug: string;
  storefrontUrl: string;
  qrSvg: string;
};

export async function publishShop(params: {
  orgId: string;
  finalSlug?: string;
}): Promise<PublishResult | { error: string; slugTaken?: boolean }> {
  const finalSlug = params.finalSlug?.trim() || undefined;
  if (finalSlug && !isValidSlug(finalSlug)) {
    return {
      error: "The link can use lowercase letters, digits and dashes (3-64 characters).",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("publish_shop", {
      p_org_id: params.orgId,
      ...(finalSlug ? { p_final_slug: finalSlug } : {}),
    })
    .single();

  if (error) {
    const code = (error as { code?: string }).code;
    const msg = (error as { message?: string }).message ?? "";
    if (code === "23505" || msg.includes("duplicate key")) {
      return { error: "That link is already taken.", slugTaken: true };
    }
    return { error: msg || "Publishing failed." };
  }

  const origin = getRequestOrigin(await headers());
  // Customer storefront is the top-level catch-all keyed by CATALOG slug
  // (app/[...slug]/page.tsx). After publish_shop all three slugs are equal,
  // but the catalog slug is the semantically correct one.
  const storefrontUrl = `${origin}/${data.catalog_slug}`;
  return {
    orgSlug: data.org_slug,
    catalogSlug: data.catalog_slug,
    venueSlug: data.venue_slug,
    storefrontUrl,
    qrSvg: await renderQrSvg(storefrontUrl),
  };
}
