import "server-only";

import { randomBytes } from "node:crypto";
import {
  createClient as createSupabaseClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import type { TelegramLoginPayload } from "@/lib/telegram/login-widget";

/**
 * telegram-bridge.ts — SECURITY SPINE of Telegram MERCHANT login (KRA-46,
 * ADR 0006). Turns a verified Telegram identity into a real GoTrue account +
 * session on the existing @supabase/ssr cookie rail. Three moves:
 *
 *   attach     anon auth.users row gains a synthetic confirmed email +
 *              app_metadata.telegram via admin.updateUserById — GoTrue flips
 *              is_anonymous to false in the same call (verified in source,
 *              ADR 0006 F1), auth.uid() survives, the draft shop never moves.
 *   mint       admin.generateLink(magiclink) -> verifyOtp(token_hash) on the
 *              caller's cookie client — the ONLY sanctioned server-side
 *              session mint (F2); the token_hash never leaves this process.
 *   provision  admin.createUser for a Telegram identity Krafta has never
 *              seen (fresh sign-in at /login).
 *
 * public.telegram_merchant_identities (service-role only) is the reverse
 * index GoTrue can't hold for us (no admin identity-attach API); its
 * uniqueness constraints arbitrate identity collisions.
 *
 * Callers MUST pass a payload that came out of validateTelegramLoginPayload —
 * nothing here re-checks the HMAC.
 */

const DEFAULT_EMAIL_DOMAIN = "tg.krafta.app";

export function telegramLoginConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && adminEnv());
}

function adminEnv(): { url: string; key: string } | null {
  const url =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function telegramAdminClient(): SupabaseClient<Database> | null {
  const env = adminEnv();
  if (!env) return null;
  return createSupabaseClient<Database>(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Unguessable, unroutable address GoTrue requires on every user (F3).
 * Generated ONCE per account and stored on the user record; everything
 * downstream reads the record (never recomputes), so the random suffix has
 * no secret to manage and the merchant may later replace the address with a
 * real one without breaking Telegram sign-in.
 */
function syntheticEmail(telegramUserId: string): string {
  const domain = process.env.TELEGRAM_LOGIN_EMAIL_DOMAIN ?? DEFAULT_EMAIL_DOMAIN;
  return `tg-${telegramUserId}-${randomBytes(4).toString("hex")}@${domain}`;
}

export function isSyntheticTelegramEmail(email: string | null | undefined): boolean {
  const domain = process.env.TELEGRAM_LOGIN_EMAIL_DOMAIN ?? DEFAULT_EMAIL_DOMAIN;
  return Boolean(email && /^tg-\d+-[a-f0-9]{8}@/.test(email) && email.endsWith(`@${domain}`));
}

type Admin = SupabaseClient<Database>;

export async function findTelegramIdentity(
  admin: Admin,
  telegramUserId: string,
): Promise<{ userId: string } | null> {
  const { data } = await admin
    .from("telegram_merchant_identities")
    .select("user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return data ? { userId: data.user_id } : null;
}

function telegramAppMetadata(tg: TelegramLoginPayload) {
  return {
    telegram: {
      id: tg.id,
      username: tg.username ?? null,
      first_name: tg.first_name,
      attached_at: new Date().toISOString(),
    },
  };
}

export type AttachResult =
  | { ok: true }
  | { collision: true; existingUserId: string }
  | { error: string };

/**
 * Register leg: bind the verified Telegram identity to userId (the caller's
 * CURRENT anon uid). Order matters (ADR 0006): the lookup INSERT goes first —
 * its PK violation is the race-free collision signal — then the GoTrue
 * attach, with a compensating DELETE if that fails. A crash between the two
 * leaves a dangling row that mintSessionForTelegramUser self-repairs.
 */
export async function attachTelegramToUser(
  admin: Admin,
  args: { userId: string; tg: TelegramLoginPayload },
): Promise<AttachResult> {
  const { userId, tg } = args;
  const telegramUserId = String(tg.id);

  const insert = await admin.from("telegram_merchant_identities").insert({
    telegram_user_id: telegramUserId,
    user_id: userId,
    username: tg.username ?? null,
    first_name: tg.first_name,
    photo_url: tg.photo_url ?? null,
  });

  if (insert.error) {
    if ((insert.error as { code?: string }).code === "23505") {
      const existing = await findTelegramIdentity(admin, telegramUserId);
      if (existing?.userId === userId) return { ok: true }; // idempotent re-tap
      if (existing) return { collision: true, existingUserId: existing.userId };
      // PK was free => the UNIQUE(user_id) side fired: this account already
      // carries a different Telegram identity (v1: one per account).
      return { error: "account_already_linked" };
    }
    console.error("[telegram-bridge] identity insert failed", {
      error: insert.error.message,
    });
    return { error: "identity_insert_failed" };
  }

  const { data: userRes, error: getErr } =
    await admin.auth.admin.getUserById(userId);
  if (getErr || !userRes?.user) {
    await admin
      .from("telegram_merchant_identities")
      .delete()
      .eq("telegram_user_id", telegramUserId);
    return { error: "user_not_found" };
  }

  // Anon users have no email; the confirmed synthetic email is what flips
  // is_anonymous (F1). If an email is somehow already present, attach only
  // the metadata — never clobber a real address. Same care for full_name.
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    ...(userRes.user.email
      ? {}
      : { email: syntheticEmail(telegramUserId), email_confirm: true }),
    ...(userRes.user.user_metadata?.full_name
      ? {}
      : {
          user_metadata: {
            full_name: [tg.first_name, tg.last_name].filter(Boolean).join(" "),
          },
        }),
    app_metadata: telegramAppMetadata(tg),
  });
  if (updErr) {
    await admin
      .from("telegram_merchant_identities")
      .delete()
      .eq("telegram_user_id", telegramUserId);
    console.error("[telegram-bridge] attach update failed", {
      error: updErr.message,
    });
    return { error: "attach_failed" };
  }

  return { ok: true };
}

/**
 * Fresh sign-in leg: a Telegram identity Krafta has never seen gets a real
 * (non-anonymous) GoTrue user. Loses a concurrent-provision race gracefully:
 * the orphan user is deleted and the winner's uid returned.
 */
export async function provisionTelegramUser(
  admin: Admin,
  tg: TelegramLoginPayload,
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

  const attach = await attachTelegramToUser(admin, {
    userId: created.user.id,
    tg,
  });
  if ("ok" in attach) return { userId: created.user.id };

  await admin.auth.admin.deleteUser(created.user.id);
  if ("collision" in attach) return { userId: attach.existingUserId };
  return { error: attach.error };
}

/**
 * Session mint (F2): generateLink(magiclink) for the user's CURRENT email,
 * redeemed on the caller's cookie client in this same request — the
 * token_hash is never serialized into a URL or response. Self-repairs the
 * attach-crash case (lookup row exists, user still email-less) before
 * minting, because generateLink for an email no user owns silently degrades
 * to a signup link (F3) — the one trap this module must never fall into.
 */
export async function mintSessionForTelegramUser(
  admin: Admin,
  cookieClient: SupabaseClient<Database>,
  args: { userId: string; tg: TelegramLoginPayload },
): Promise<{ ok: true; session: Session } | { error: string }> {
  const { userId, tg } = args;
  const { data: userRes, error: getErr } =
    await admin.auth.admin.getUserById(userId);
  if (getErr || !userRes?.user) return { error: "user_not_found" };

  let email = userRes.user.email ?? null;
  if (!email) {
    email = syntheticEmail(String(tg.id));
    const { error: repairErr } = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
      app_metadata: telegramAppMetadata(tg),
    });
    if (repairErr) {
      console.error("[telegram-bridge] self-repair failed", {
        error: repairErr.message,
      });
      return { error: "mint_failed" };
    }
  }

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
  return { ok: true, session: verified.session };
}

/**
 * mintSessionForTelegramUser, but WITHOUT touching the caller's cookie jar:
 * the OTP is redeemed on a detached in-memory client and the session handed
 * back. The publish flow needs this variant — writing session cookies inside
 * a server action makes Next.js re-render the current route (cookie mutation
 * ⇒ ActionDidRevalidateStaticAndDynamic), and that re-render races
 * publish_shop's slug rename: when it loses, the old /dashboard/[slug] URL
 * 404s and unmounts the publish dialog mid-celebration. The browser installs
 * the returned session via supabase.auth.setSession() instead.
 */
export async function mintDetachedSessionForTelegramUser(
  admin: Admin,
  args: { userId: string; tg: TelegramLoginPayload },
): Promise<
  { session: Session; client: SupabaseClient<Database> } | { error: string }
> {
  const env = adminEnv();
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!env || !anonKey) return { error: "mint_failed" };
  const detached = createSupabaseClient<Database>(env.url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const minted = await mintSessionForTelegramUser(admin, detached, args);
  if ("error" in minted) return minted;
  return { session: minted.session, client: detached };
}
