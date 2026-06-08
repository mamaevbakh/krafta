import "server-only";

/**
 * bot-api.ts — thin, never-throw wrappers over the Telegram Bot API.
 *
 * Every call takes the bot TOKEN explicitly, because Krafta is
 * per-merchant: each venue connects its own bot (token stored encrypted
 * in commerce.venue_telegram_settings). This is the OUTBOUND counterpart
 * to lib/telegram/init-data.ts (which only validates inbound customer
 * Mini-App logins).
 *
 * Used by:
 *   - the order-notification dispatcher (send order alerts), and
 *   - the dashboard connect flow (validate a pasted token via getMe,
 *     detect the chat via getUpdates, send a test message).
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";
const DEFAULT_TIMEOUT_MS = 8000;

/** Escape the HTML-significant chars for Telegram's HTML parse mode.
 *  Apply to every piece of dynamic/user text before interpolation. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

type TelegramResponse<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string; error_code?: number };

async function callTelegram<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: "missing bot token" };
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as TelegramResponse<T> | null;
    if (!json) {
      return { ok: false, error: `Telegram ${res.status}: non-JSON response` };
    }
    if (!json.ok) {
      return {
        ok: false,
        error: `Telegram ${json.error_code ?? res.status}: ${json.description ?? "request failed"}`,
      };
    }
    return { ok: true, result: json.result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : `${method} failed`,
    };
  }
}

// ── getMe — validate a token + read the bot's @username ─────────────────────

type TelegramUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export async function telegramGetMe(
  token: string,
): Promise<
  | { ok: true; username: string | null; botId: number }
  | { ok: false; error: string }
> {
  const res = await callTelegram<TelegramUser>(token, "getMe");
  if (!res.ok) return res;
  return {
    ok: true,
    username: res.result.username ?? null,
    botId: res.result.id,
  };
}

// ── getUpdates → detect the chat the merchant just messaged ─────────────────

type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: { chat?: TelegramChat };
  my_chat_member?: { chat?: TelegramChat };
  channel_post?: { chat?: TelegramChat };
};

function chatLabel(chat: TelegramChat): string {
  if (chat.title) return chat.title;
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ");
  if (name) return name;
  if (chat.username) return `@${chat.username}`;
  return chat.type === "private" ? "Личный чат" : "Чат";
}

/**
 * Pull recent updates and return the MOST RECENT chat that interacted
 * with the bot (a DM /start, or a message in a group the bot is in).
 * This is the connect handshake: the merchant messages their bot, then
 * the dashboard calls this to capture where to send alerts. No webhook.
 *
 * Returns ok:true with chat:null when there are no updates yet (the
 * merchant hasn't messaged the bot) — the caller surfaces a "send your
 * bot a message first" hint.
 */
export async function detectLatestChat(
  token: string,
): Promise<
  | { ok: true; chat: { id: string; title: string } | null }
  | { ok: false; error: string }
> {
  // offset/limit are unsupported here on purpose — we want the freshest
  // chat, and a merchant connect flow has a tiny update backlog.
  const res = await callTelegram<TelegramUpdate[]>(token, "getUpdates", {
    allowed_updates: ["message", "my_chat_member", "channel_post"],
  });
  if (!res.ok) return res;

  const updates = res.result ?? [];
  for (let i = updates.length - 1; i >= 0; i--) {
    const u = updates[i];
    const chat =
      u.message?.chat ?? u.my_chat_member?.chat ?? u.channel_post?.chat;
    if (chat) {
      return {
        ok: true,
        chat: { id: String(chat.id), title: chatLabel(chat) },
      };
    }
  }
  return { ok: true, chat: null };
}

// ── sendMessage ─────────────────────────────────────────────────────────────

export async function sendTelegramMessage(
  token: string,
  input: {
    chatId: string | number;
    text: string;
    parseMode?: "HTML" | "MarkdownV2" | null;
    disablePreview?: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body: Record<string, unknown> = {
    chat_id: input.chatId,
    text: input.text,
    disable_web_page_preview: input.disablePreview ?? true,
  };
  if (input.parseMode !== null) body.parse_mode = input.parseMode ?? "HTML";

  const res = await callTelegram<unknown>(token, "sendMessage", body);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
