import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { openSecret } from "@/lib/crypto/secret-box";

/**
 * settings.ts — server-only access to commerce.venue_telegram_settings.
 *
 * The dispatcher (order-notification.ts) reads a venue's connected bot
 * here using a service-role client: it runs inside Next's `after()`,
 * past the response, where the cookie-scoped client is unreliable, and
 * the read is trusted server work. The bot token is decrypted here and
 * never leaves the server.
 *
 * Dashboard reads/writes (connect, detect chat, toggle) live in the
 * dashboard server actions and use the request-scoped authed client so
 * RLS enforces org ownership — those never need the decrypted token
 * except transiently to call the Telegram API.
 */

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

export type VenueTelegramTarget = {
  botToken: string;
  chatId: string;
  botUsername: string | null;
  chatTitle: string | null;
};

/**
 * The shared platform bot token (@KraftaBot). Used for S1, where the
 * merchant connects a chat to the platform bot rather than running their
 * own. A per-venue token (S2 "bring your own bot") overrides it.
 */
export function getPlatformBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

/**
 * Resolve a venue's active, fully-connected Telegram target (which bot
 * token to send with + which chat to send to). Returns null when
 * notifications aren't set up (no row, inactive, no chat bound, or no
 * usable token) — the dispatcher treats null as a no-op.
 *
 * Token resolution:
 *   - S2 (bring your own bot): bot_token_encrypted is set → decrypt + use it.
 *   - S1 (shared bot, default): bot_token_encrypted NULL → fall back to the
 *     platform TELEGRAM_BOT_TOKEN.
 */
export async function getVenueTelegramTargetForDispatch(
  venueId: string,
): Promise<VenueTelegramTarget | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .schema("commerce")
    .from("venue_telegram_settings")
    .select("bot_token_encrypted, bot_username, chat_id, chat_title, is_active")
    .eq("venue_id", venueId)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.is_active) return null;
  if (!data.chat_id) return null;

  const botToken = data.bot_token_encrypted
    ? openSecret(data.bot_token_encrypted)
    : getPlatformBotToken();
  if (!botToken) return null;

  return {
    botToken,
    chatId: data.chat_id,
    botUsername: data.bot_username,
    chatTitle: data.chat_title,
  };
}
