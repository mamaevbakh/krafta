/**
 * Telegram webhook — the single inbound endpoint for the shared platform
 * bot (@KraftaBot). Telegram POSTs every update here.
 *
 * v1 scope: the CONNECT handshake. The merchant generates a code in the
 * dashboard and sends it to the bot as `/start <code>` (DM, via the
 * deep link) or `/connect <code>` (in their team group). We match the
 * code to a venue and bind that chat as the order-alert destination.
 *
 * Auth: `setWebhook` is registered with a secret_token; Telegram echoes
 * it in the `X-Telegram-Bot-Api-Secret-Token` header on every call. We
 * reject anything that doesn't match TELEGRAM_WEBHOOK_SECRET — that's the
 * only caller that should ever hit this route.
 *
 * Ops note: TELEGRAM_WEBHOOK_SECRET must exist in EVERY Vercel environment
 * that serves the app — Production, Preview, AND the `staging` custom env
 * behind dev.krafta.org. If it's missing in the serving env, `expected` is
 * undefined and every Telegram call 401s (cost us a debugging session).
 *
 * Always returns 200 quickly (Telegram retries non-200 with backoff).
 * All work is best-effort; we never surface errors to Telegram.
 *
 * Future: inline-button callbacks (Accept/Ready/Served) land here too.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { sendTelegramMessage } from "@/lib/telegram/bot-api";
import { getPlatformBotToken } from "@/lib/telegram/settings";

function getAdminClient() {
  const url =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

type TgChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

function chatLabel(chat: TgChat): string {
  if (chat.title) return chat.title;
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ");
  if (name) return name;
  if (chat.username) return `@${chat.username}`;
  return chat.type === "private" ? "Личный чат" : "Чат";
}

// Pull a connect code out of `/start CODE`, `/connect CODE`, or the
// @-suffixed group forms (`/connect@KraftaBot CODE`).
function parseConnectCode(text: string | undefined): string | null {
  if (!text) return null;
  const m = text
    .trim()
    .match(/^\/(?:start|connect)(?:@\w+)?\s+([A-Za-z0-9]{4,64})\b/);
  return m ? m[1] : null;
}

const OK = NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  // Auth: only Telegram (carrying our secret) may call this.
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const presented = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || presented !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: {
    message?: { text?: string; chat?: TgChat };
    channel_post?: { text?: string; chat?: TgChat };
  };
  try {
    update = await req.json();
  } catch {
    return OK; // malformed body — ack and move on
  }

  const msg = update.message ?? update.channel_post;
  const chat = msg?.chat;
  const code = parseConnectCode(msg?.text);

  // Nothing to do for non-connect messages (greetings, group chatter).
  if (!chat || !code) return OK;

  try {
    const supabase = getAdminClient();
    if (!supabase) return OK;

    const { data: row } = await supabase
      .schema("commerce")
      .from("venue_telegram_settings")
      .select("venue_id, connect_code_expires_at")
      .eq("connect_code", code)
      .maybeSingle();

    const token = getPlatformBotToken();
    const reply = (text: string) =>
      token
        ? sendTelegramMessage(token, { chatId: chat.id, text })
        : Promise.resolve();

    if (!row) {
      await reply("Код не найден или уже использован. Создайте новый в панели Krafta.");
      return OK;
    }

    const expired =
      row.connect_code_expires_at != null &&
      new Date(row.connect_code_expires_at).getTime() < Date.now();
    if (expired) {
      await reply("Код истёк. Создайте новый в панели Krafta.");
      return OK;
    }

    // Bind this chat as the venue's order-alert destination and burn the code.
    await supabase
      .schema("commerce")
      .from("venue_telegram_settings")
      .update({
        chat_id: String(chat.id),
        chat_title: chatLabel(chat),
        is_active: true,
        connect_code: null,
        connect_code_expires_at: null,
      })
      .eq("venue_id", row.venue_id);

    await reply("✅ Подключено. Новые заказы будут приходить сюда.");
  } catch {
    // Best-effort — never fail the webhook.
  }

  return OK;
}
