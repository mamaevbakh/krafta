"use server";

// KRA-43 / ADR 0005 §4 — the Publish flow's server side.
//
// Step machine (client lives in publish-dialog.tsx):
//   preflight → slug confirm → demo nudge → register (anon only) → publish_shop
//   → celebration (live link + QR + Telegram order-alerts beat).
//
// Identity upgrade APIs are split by method (eng review D2):
//   email  — updateUser({email}) here; the OTP is verified on the BROWSER
//            client in publish-dialog.tsx (cookie-write race, see below).
//            NOT linkIdentity, which only does OAuth.
//   google — linkIdentity (requires the manual-linking flag on the project).
// Both hard-fail when the identity already belongs to another user; that
// collision resolves through the claim handshake (claim_draft_shop_initiate /
// _complete RPCs) so the draft survives.

import { headers } from "next/headers";

import { getRequestOrigin } from "@/lib/auth/redirect";
import {
  attachTelegramToUser,
  mintDetachedSessionForTelegramUser,
  telegramAdminClient,
  telegramLoginConfigured,
} from "@/lib/auth/telegram-bridge";
import { isValidSlug, suffixSlug, suggestSlug } from "@/lib/onboarding/slug";
import { normalizeQrStyle } from "@/lib/qr/config";
import { renderQrSvg } from "@/lib/qr/render";
import { createClient } from "@/lib/supabase/server";
import { validateTelegramLoginPayload } from "@/lib/telegram/login-widget";

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
  /** Set when the Telegram register leg is available (KRA-46 / ADR 0006). */
  telegramBotUsername: string | null;
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
    telegramBotUsername: telegramLoginConfigured()
      ? (process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null)
      : null,
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
//
// Only the SEND half lives here. Verifying the OTP mints a session, and a
// session-cookie write inside a server action makes Next.js re-render the
// current route (ActionDidRevalidateStaticAndDynamic) — that re-render races
// the publish_shop slug rename fired right after, and when it loses the old
// /dashboard/[slug] route 404s and unmounts the dialog mid-celebration. So
// verification runs on the BROWSER client in publish-dialog.tsx
// (handleVerifyOtp / handleClaimVerify), same as the Telegram leg.
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
// Register: Telegram (KRA-46 / ADR 0006 — verified widget payload → attach
// to the CURRENT anon user, uid preserved). Unlike the Google leg there is
// no redirect round-trip: the widget's data-onauth callback hands us the
// payload in-page, so even the collision case resolves in this ONE action —
// initiate-claim (as the anon owner) → mint a detached session for the
// existing account → complete-claim (through that session). The claim code
// never reaches the browser.
//
// CRITICAL: this action must NOT write session cookies. A cookie mutation
// inside a server action makes Next.js re-render the current route
// (ActionDidRevalidateStaticAndDynamic), and that re-render races the
// publish_shop slug rename fired right after — when it loses, the old
// /dashboard/[slug] route 404s and unmounts the dialog mid-celebration.
// Session installation (refresh / setSession) happens in the BROWSER, in
// publish-dialog.tsx, where cookie writes leave the router untouched.
// ---------------------------------------------------------------------------

export type RegisterPublishTelegramResult =
  | {
      registered: true;
      claimed: boolean;
      /** Collision leg only: minted session for the existing account; the
       *  browser installs it via supabase.auth.setSession(). */
      session?: { access_token: string; refresh_token: string };
    }
  | { error: string };

export async function registerPublishTelegram(
  rawPayload: Record<string, unknown>,
): Promise<RegisterPublishTelegramResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const admin = telegramAdminClient();
  if (!botToken || !admin) {
    return { error: "Telegram sign-in is not configured." };
  }

  let tg;
  try {
    tg = validateTelegramLoginPayload(rawPayload, { botToken });
  } catch {
    return { error: "Telegram sign-in could not be verified. Please try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!((user as { is_anonymous?: boolean }).is_anonymous ?? false)) {
    // Already registered (double-tap after a slow response): nothing to do.
    return { registered: true, claimed: false };
  }

  const attach = await attachTelegramToUser(admin, { userId: user.id, tg });

  if ("ok" in attach) {
    // The is_anonymous flip happened on the user ROW; one refresh re-derives
    // the JWT claim (ADR 0006 F4) so publish_shop and the trigger guards see
    // a registered caller. Same uid, same refresh-token family. The refresh
    // itself runs in the BROWSER (see header comment) — never here.
    return { registered: true, claimed: false };
  }

  if ("collision" in attach) {
    // This Telegram account already owns a Krafta account: claim handshake
    // (ADR 0005 §4 D2), fully server-side. Initiate FIRST — the code can
    // only be minted while we are still the anonymous draft owner.
    const { data: code, error: initiateErr } = await supabase.rpc(
      "claim_draft_shop_initiate",
    );
    if (initiateErr || !code) {
      return { error: "Could not start the draft transfer. Please try again." };
    }

    const minted = await mintDetachedSessionForTelegramUser(admin, {
      userId: attach.existingUserId,
      tg,
    });
    if ("error" in minted) {
      return { error: "Could not sign in to your existing account. Please try again." };
    }

    const { error: completeErr } = await minted.client
      .rpc("claim_draft_shop_complete", { p_claim_code: code as string })
      .single();
    if (completeErr) {
      return { error: "Signed in, but the draft transfer failed. Please try again." };
    }
    return {
      registered: true,
      claimed: true,
      session: {
        access_token: minted.session.access_token,
        refresh_token: minted.session.refresh_token,
      },
    };
  }

  if (attach.error === "account_already_linked") {
    return { error: "This account is already linked to a different Telegram user." };
  }
  return { error: "Telegram registration failed. Please try again." };
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

  // Pick up any merchant-customized QR style so the celebration screen's
  // QR matches what they'll print. Fresh publishes normalize to the
  // legacy default (no studio visit yet). publish_shop returns only the
  // slug trio, so look the catalog up by slug to read settings_qr_style.
  const { data: catalogStyleRow } = await supabase
    .from("catalogs")
    .select("settings_qr_style")
    .eq("slug", data.catalog_slug)
    .maybeSingle();
  const qrStyle = normalizeQrStyle(catalogStyleRow?.settings_qr_style);

  return {
    orgSlug: data.org_slug,
    catalogSlug: data.catalog_slug,
    venueSlug: data.venue_slug,
    storefrontUrl,
    qrSvg: await renderQrSvg(storefrontUrl, { style: qrStyle }),
  };
}
