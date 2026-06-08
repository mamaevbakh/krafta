"use server";

import crypto from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { openSecret } from "@/lib/crypto/secret-box";
import { sendTelegramMessage, telegramGetMe } from "@/lib/telegram/bot-api";
import { getPlatformBotToken } from "@/lib/telegram/settings";

/**
 * notifications-actions.ts — S1 connect flow.
 *
 * The merchant connects an order-alert chat to the shared platform bot
 * (@KraftaBot). The dashboard mints a short-lived code; the merchant
 * sends it to the bot (DM deep link `?start=<code>` or group
 * `/connect <code>`); the webhook binds their chat. These actions run on
 * the authed client, so RLS keeps each merchant to their own venue.
 *
 * No bot token is handled here for S1 — the platform token lives in env.
 * (The S2 "bring your own bot" path stays available in the schema +
 * dispatcher; its dashboard UI is shelved for launch.)
 */

type Result<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const CONNECT_CODE_TTL_MIN = 30;

function randomCode(): string {
  // 10 hex chars — unambiguous, matches the webhook's [A-Za-z0-9] parser.
  return crypto.randomBytes(5).toString("hex");
}

async function platformBotUsername(): Promise<string | null> {
  const fromEnv = process.env.TELEGRAM_BOT_USERNAME;
  if (fromEnv) return fromEnv.replace(/^@/, "");
  const token = getPlatformBotToken();
  if (!token) return null;
  const me = await telegramGetMe(token);
  return me.ok ? me.username : null;
}

export async function generateConnectCode(params: {
  venueId: string;
  orgId: string;
}): Promise<Result<{ code: string; botUsername: string; deepLink: string }>> {
  const botUsername = await platformBotUsername();
  if (!botUsername) {
    return {
      ok: false,
      error: "Бот ещё не настроен на стороне Krafta. Напишите в поддержку.",
    };
  }

  const code = randomCode();
  const expiresAt = new Date(
    Date.now() + CONNECT_CODE_TTL_MIN * 60_000,
  ).toISOString();

  const supabase = await createClient();
  const { error } = await supabase
    .schema("commerce")
    .from("venue_telegram_settings")
    .upsert(
      {
        venue_id: params.venueId,
        org_id: params.orgId, // trigger re-syncs from the venue
        connect_code: code,
        connect_code_expires_at: expiresAt,
      },
      { onConflict: "venue_id" },
    );

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    code,
    botUsername,
    deepLink: `https://t.me/${botUsername}?start=${code}`,
  };
}

export async function refreshTelegramStatus(params: {
  venueId: string;
}): Promise<
  Result<{ chatConnected: boolean; chatTitle: string | null; isActive: boolean }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("commerce")
    .from("venue_telegram_settings")
    .select("chat_id, chat_title, is_active")
    .eq("venue_id", params.venueId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    chatConnected: Boolean(data?.chat_id),
    chatTitle: data?.chat_title ?? null,
    isActive: data?.is_active ?? true,
  };
}

export async function sendTelegramTest(params: {
  venueId: string;
}): Promise<Result> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("commerce")
    .from("venue_telegram_settings")
    .select("bot_token_encrypted, chat_id")
    .eq("venue_id", params.venueId)
    .maybeSingle();

  // S1: platform token. S2: the venue's own token if present.
  const token =
    (data?.bot_token_encrypted ? openSecret(data.bot_token_encrypted) : null) ??
    getPlatformBotToken();
  if (!token || !data?.chat_id) {
    return { ok: false, error: "Сначала подключите чат." };
  }

  const res = await sendTelegramMessage(token, {
    chatId: data.chat_id,
    text: "✅ Тест Krafta. Уведомления о заказах работают.",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function setTelegramActive(params: {
  venueId: string;
  isActive: boolean;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("commerce")
    .from("venue_telegram_settings")
    .update({ is_active: params.isActive })
    .eq("venue_id", params.venueId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function disconnectTelegram(params: {
  venueId: string;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("commerce")
    .from("venue_telegram_settings")
    .delete()
    .eq("venue_id", params.venueId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
