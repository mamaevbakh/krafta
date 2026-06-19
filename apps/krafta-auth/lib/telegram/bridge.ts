import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSsoAdminClient } from "@/lib/sso";
import type { TelegramIdentity } from "@/lib/telegram/oidc-login";

// Turns a verified Telegram identity into a real GoTrue session on this IdP's
// @supabase/ssr cookie rail — the same Supabase project (and the shared
// `public.telegram_merchant_identities` reverse index) the main app's
// telegram-bridge uses, so a merchant who first signs in via the main app and
// one who signs in here resolve to the SAME account.
//
// Login-only: unlike the main app we never "attach" to an anon draft owner —
// an SSO sign-in starts a fresh session. So just find-or-provision the user,
// then mint. Callers pass an identity that came out of validateTelegramIdToken;
// nothing here re-checks the signature.

const DEFAULT_EMAIL_DOMAIN = "tg.krafta.app";

export function telegramAdminClient(): SupabaseClient {
  return createSsoAdminClient();
}

/** Unguessable, unroutable address GoTrue requires on every user. */
function syntheticEmail(telegramUserId: string): string {
  const domain = process.env.TELEGRAM_LOGIN_EMAIL_DOMAIN ?? DEFAULT_EMAIL_DOMAIN;
  return `tg-${telegramUserId}-${randomBytes(4).toString("hex")}@${domain}`;
}

function telegramAppMetadata(tg: TelegramIdentity) {
  return {
    telegram: {
      id: tg.id,
      username: tg.username ?? null,
      first_name: tg.first_name,
      attached_at: new Date().toISOString(),
    },
  };
}

export async function findTelegramIdentity(
  admin: SupabaseClient,
  telegramUserId: string,
): Promise<{ userId: string } | null> {
  const { data } = await admin
    .from("telegram_merchant_identities")
    .select("user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return data ? { userId: data.user_id as string } : null;
}

/**
 * A Telegram identity Krafta has never seen gets a real (non-anonymous) GoTrue
 * user plus its row in the reverse index. Loses a concurrent-provision race
 * gracefully: the orphan user is deleted and the winner's uid returned.
 */
export async function provisionTelegramUser(
  admin: SupabaseClient,
  tg: TelegramIdentity,
): Promise<{ userId: string } | { error: string }> {
  const telegramUserId = String(tg.id);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: syntheticEmail(telegramUserId),
    email_confirm: true,
    app_metadata: telegramAppMetadata(tg),
    user_metadata: {
      full_name: [tg.first_name, tg.last_name].filter(Boolean).join(" "),
    },
  });
  if (createErr || !created?.user) {
    console.error("[telegram-bridge] provision createUser failed", {
      error: createErr?.message,
    });
    return { error: "provision_failed" };
  }

  // The reverse index INSERT is the race-free collision signal: a PK/UNIQUE
  // violation means a concurrent request already provisioned this identity.
  const { error: insErr } = await admin
    .from("telegram_merchant_identities")
    .insert({
      telegram_user_id: telegramUserId,
      user_id: created.user.id,
      username: tg.username ?? null,
      first_name: tg.first_name,
      photo_url: tg.photo_url ?? null,
    });

  if (insErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    if ((insErr as { code?: string }).code === "23505") {
      const existing = await findTelegramIdentity(admin, telegramUserId);
      if (existing) return { userId: existing.userId };
    }
    console.error("[telegram-bridge] provision index insert failed", {
      error: insErr.message,
    });
    return { error: "provision_failed" };
  }

  return { userId: created.user.id };
}

/**
 * Session mint: generateLink(magiclink) for the user's email, redeemed on the
 * caller's cookie client in this same request — the token_hash is never
 * serialized into a URL or response. This is the only sanctioned server-side
 * session mint.
 */
export async function mintSessionForTelegramUser(
  admin: SupabaseClient,
  cookieClient: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { error: string }> {
  const { data: userRes, error: getErr } =
    await admin.auth.admin.getUserById(userId);
  if (getErr || !userRes?.user?.email) return { error: "user_not_found" };
  const email = userRes.user.email;

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink(
    { type: "magiclink", email },
  );
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error("[telegram-bridge] generateLink failed", {
      error: linkErr?.message,
    });
    return { error: "mint_failed" };
  }
  // Paranoia: the token must belong to the uid the lookup table resolved.
  if (linkData.user?.id && linkData.user.id !== userId) {
    console.error("[telegram-bridge] generateLink uid mismatch", {
      expected: userId,
      got: linkData.user.id,
    });
    return { error: "mint_failed" };
  }

  const verificationType = linkData.properties.verification_type ?? "magiclink";
  const { data: verified, error: verifyErr } = await cookieClient.auth.verifyOtp({
    type: verificationType as "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyErr || !verified.session) {
    console.error("[telegram-bridge] verifyOtp failed", {
      error: verifyErr?.message,
    });
    return { error: "mint_failed" };
  }
  return { ok: true };
}

/**
 * High-level entry for the callback: resolve a verified Telegram identity to a
 * logged-in Supabase session on `cookieClient`. find-or-provision, then mint.
 */
export async function signInTelegramIdentity(
  cookieClient: SupabaseClient,
  tg: TelegramIdentity,
): Promise<{ ok: true } | { error: string }> {
  const admin = telegramAdminClient();

  const existing = await findTelegramIdentity(admin, String(tg.id));
  let userId = existing?.userId;
  if (!userId) {
    const provisioned = await provisionTelegramUser(admin, tg);
    if ("error" in provisioned) return { error: provisioned.error };
    userId = provisioned.userId;
  }

  return mintSessionForTelegramUser(admin, cookieClient, userId);
}
