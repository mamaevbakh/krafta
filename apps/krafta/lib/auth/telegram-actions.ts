"use server";

// KRA-46 / ADR 0006 — Telegram sign-in for the /login surface.
//
// The verified Telegram identity crosses the wire exactly once, into one of
// these actions; the verification is the trust boundary. Two entry points
// share the same post-verification path:
//   - signInWithTelegramIdToken — the NEW "Log In With Telegram" OIDC flow:
//     the browser hands us a signed id_token (oidc-login.ts verifies the JWT).
//   - signInWithTelegram — the LEGACY iframe widget's HMAC payload
//     (login-widget.ts). Kept until the dashboard "secure account" surfaces
//     migrate too; remove once nothing renders the old widget.
//
// Known identity -> mint a session for its user. Unknown identity -> a fresh
// real GoTrue user is provisioned and signed in; a shopless merchant lands in
// the wizard. (The REGISTER leg — attaching Telegram to the current anonymous
// draft owner — lives in publish-actions.ts.)

import { headers } from "next/headers";

import { getRequestOrigin, normalizeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import {
  findTelegramIdentity,
  mintSessionForTelegramUser,
  provisionTelegramUser,
  telegramAdminClient,
} from "@/lib/auth/telegram-bridge";
import {
  validateTelegramLoginPayload,
  type TelegramLoginPayload,
} from "@/lib/telegram/login-widget";
import { validateTelegramIdToken } from "@/lib/telegram/oidc-login";

type SignInResult = { next: string } | { error: string };

// Shared from the moment we hold a verified identity: resolve its user (mint
// or provision) and a session, then pick where to land.
async function completeTelegramSignIn(
  tg: TelegramLoginPayload,
  next?: string,
): Promise<SignInResult> {
  const admin = telegramAdminClient();
  if (!admin) return { error: "Telegram sign-in is not configured." };

  let userId: string;
  const existing = await findTelegramIdentity(admin, String(tg.id));
  if (existing) {
    userId = existing.userId;
  } else {
    const provisioned = await provisionTelegramUser(admin, tg);
    if ("error" in provisioned) {
      return { error: "Could not create your account. Please try again." };
    }
    userId = provisioned.userId;
  }

  const supabase = await createClient();
  const minted = await mintSessionForTelegramUser(admin, supabase, {
    userId,
    tg,
  });
  if ("error" in minted) {
    return { error: "Sign-in failed. Please try again." };
  }

  const origin = getRequestOrigin(await headers());
  let resolvedNext = normalizeNextPath(next, origin);

  // A brand-new Telegram merchant owns nothing yet; /dashboard would 404.
  // Send them into the wizard instead (ADR 0005 §2 wedge entry).
  if (resolvedNext.startsWith("/dashboard")) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!org) resolvedNext = "/onboarding";
  }

  return { next: resolvedNext };
}

/** New OIDC flow: verify the popup's id_token, then sign in. */
export async function signInWithTelegramIdToken(
  idToken: string,
  next?: string,
): Promise<SignInResult> {
  const clientId = process.env.TELEGRAM_LOGIN_CLIENT_ID;
  if (!clientId || !telegramAdminClient()) {
    return { error: "Telegram sign-in is not configured." };
  }

  let tg: TelegramLoginPayload;
  try {
    tg = await validateTelegramIdToken(idToken, { clientId });
  } catch {
    return { error: "Telegram sign-in could not be verified. Please try again." };
  }

  return completeTelegramSignIn(tg, next);
}

/** Legacy iframe widget: verify the HMAC payload, then sign in. */
export async function signInWithTelegram(
  rawPayload: Record<string, unknown>,
  next?: string,
): Promise<SignInResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !telegramAdminClient()) {
    return { error: "Telegram sign-in is not configured." };
  }

  let tg: TelegramLoginPayload;
  try {
    tg = validateTelegramLoginPayload(rawPayload, { botToken });
  } catch {
    return { error: "Telegram sign-in could not be verified. Please try again." };
  }

  return completeTelegramSignIn(tg, next);
}
