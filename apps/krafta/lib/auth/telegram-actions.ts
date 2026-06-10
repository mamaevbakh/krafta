"use server";

// KRA-46 / ADR 0006 — Telegram sign-in for the /login surface.
//
// The raw widget payload (data-onauth callback object) crosses the wire
// exactly once, into this action; the HMAC check is the trust boundary.
// Known identity -> mint a session for its user. Unknown identity -> a
// fresh real GoTrue user is provisioned and signed in; a shopless merchant
// then lands in the standard wizard. (The REGISTER leg — attaching Telegram
// to the current anonymous draft owner — lives in publish-actions.ts.)

import { headers } from "next/headers";

import { getRequestOrigin, normalizeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import {
  findTelegramIdentity,
  mintSessionForTelegramUser,
  provisionTelegramUser,
  telegramAdminClient,
} from "@/lib/auth/telegram-bridge";
import { validateTelegramLoginPayload } from "@/lib/telegram/login-widget";

export async function signInWithTelegram(
  rawPayload: Record<string, unknown>,
  next?: string,
): Promise<{ next: string } | { error: string }> {
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
