import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { normalizeCurrencySettings } from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { escapeHtml, sendTelegramMessage } from "@/lib/telegram/bot-api";
import { getVenueTelegramTargetForDispatch } from "@/lib/telegram/settings";

import type {
  DeliveryFields,
  DineInFields,
  PickupFields,
} from "./checkout";

/**
 * order-notification.ts — fire a Telegram alert to the merchant when a
 * customer places an order.
 *
 * Called from placeOrderAction via Next's `after()`, so it runs AFTER the
 * customer's "Order placed" screen renders. It must never throw and never
 * block — a Telegram failure can't affect a placed order. Mirrors the
 * fire-and-forget pattern in app/q/[code]/route.ts (qr_scans logging).
 *
 * Recipient resolution is per-merchant: the venue's connected bot + chat
 * come from commerce.venue_telegram_settings (the merchant connects them
 * in Settings › Notifications). When a venue hasn't connected a bot, this
 * is a clean no-op.
 *
 * Reads order/catalog/line data with a service-role client (the cookie
 * client is unreliable inside `after()`); the read is trusted server work.
 */

type NotifyInput =
  | {
      orderId: string;
      venueId: string;
      mode: "dine_in";
      fields: DineInFields;
      tipCents?: number;
    }
  | {
      orderId: string;
      venueId: string;
      mode: "pickup";
      fields: PickupFields;
      tipCents?: number;
    }
  | {
      orderId: string;
      venueId: string;
      mode: "delivery";
      fields: DeliveryFields;
      tipCents?: number;
    };

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

export async function notifyMerchantOfOrder(input: NotifyInput): Promise<void> {
  try {
    // Who receives it — the venue's connected bot + chat. No connection → no-op.
    const target = await getVenueTelegramTargetForDispatch(input.venueId);
    if (!target) return;

    const supabase = getAdminClient();
    if (!supabase) return;

    const { data: order } = await supabase
      .schema("commerce")
      .from("orders")
      .select("id, reference_id, catalog_id")
      .eq("id", input.orderId)
      .maybeSingle();
    if (!order) return;

    const { data: catalog } = await supabase
      .from("catalogs")
      .select("settings_currency, name")
      .eq("id", order.catalog_id)
      .maybeSingle();

    const currency = normalizeCurrencySettings(
      (catalog?.settings_currency ?? {}) as Record<string, unknown>,
    );

    const { data: lines } = await supabase
      .schema("commerce")
      .from("order_line_items")
      .select("name, quantity, total_price_cents")
      .eq("order_id", input.orderId)
      .order("created_at", { ascending: true });

    const items = lines ?? [];
    const subtotalCents = items.reduce(
      (sum, l) => sum + (l.total_price_cents ?? 0),
      0,
    );
    const tipCents = input.tipCents ?? 0;
    const totalCents = subtotalCents + tipCents;

    const reference = order.reference_id
      ? `#${order.reference_id}`
      : `#${input.orderId.slice(0, 8)}`;

    const text = buildMessage({
      reference,
      mode: input.mode,
      fields: input.fields,
      items: items.map((l) => ({
        name: l.name,
        quantity: Number(l.quantity),
        totalPriceCents: l.total_price_cents ?? 0,
      })),
      tipCents,
      totalCents,
      currency,
    });

    const res = await sendTelegramMessage(target.botToken, {
      chatId: target.chatId,
      text,
    });
    if (!res.ok) {
      console.error("[order-notification] send failed", {
        venueId: input.venueId,
        orderId: input.orderId,
        error: res.error,
      });
    }
  } catch (err) {
    // Swallow — a notification failure must never surface to the customer
    // or roll back the order. Log for diagnosis.
    console.error("[order-notification] notify failed", {
      orderId: input.orderId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── message formatting (RU primary) ─────────────────────────────────────────

type CurrencyArg = Parameters<typeof formatPriceCents>[1];

function buildMessage(args: {
  reference: string;
  mode: NotifyInput["mode"];
  fields: DineInFields | PickupFields | DeliveryFields;
  items: Array<{ name: string; quantity: number; totalPriceCents: number }>;
  tipCents: number;
  totalCents: number;
  currency: CurrencyArg;
}): string {
  const money = (cents: number) => formatPriceCents(cents, args.currency);

  const header = `🛎 <b>Новый заказ</b> ${escapeHtml(args.reference)}`;
  const modeLine = buildModeLine(args.mode, args.fields);

  const itemLines = args.items
    .map(
      (i) =>
        `${i.quantity} × ${escapeHtml(i.name)} — ${money(i.totalPriceCents)}`,
    )
    .join("\n");

  const totals: string[] = [];
  if (args.tipCents > 0) totals.push(`Чаевые: ${money(args.tipCents)}`);
  totals.push(`<b>Итого: ${money(args.totalCents)}</b>`);

  const contact = buildContactBlock(args.mode, args.fields);

  return [
    header,
    modeLine,
    "",
    itemLines,
    "",
    totals.join("\n"),
    contact ? "\n" + contact : "",
  ]
    .join("\n")
    .trim();
}

function buildModeLine(
  mode: NotifyInput["mode"],
  fields: DineInFields | PickupFields | DeliveryFields,
): string {
  if (mode === "dine_in") {
    const f = fields as DineInFields;
    return `🍽 Зал · Столик ${escapeHtml(f.tableLabel)}`;
  }
  if (mode === "pickup") {
    const f = fields as PickupFields;
    const when =
      f.scheduleType === "scheduled" && f.pickupAt
        ? `К ${escapeHtml(formatScheduledTime(f.pickupAt))}`
        : "Как можно скорее";
    return `🥡 Самовывоз · ${when}`;
  }
  const f = fields as DeliveryFields;
  const when = f.scheduledFor
    ? `К ${escapeHtml(formatScheduledTime(f.scheduledFor))}`
    : "Как можно скорее";
  return `🚗 Доставка · ${when}`;
}

function buildContactBlock(
  mode: NotifyInput["mode"],
  fields: DineInFields | PickupFields | DeliveryFields,
): string | null {
  const rows: string[] = [];
  if (mode === "pickup") {
    const f = fields as PickupFields;
    if (f.recipientName) rows.push(`👤 ${escapeHtml(f.recipientName)}`);
    if (f.recipientPhone) rows.push(`📞 ${formatPhone(f.recipientPhone)}`);
    if (f.note) rows.push(`💬 ${escapeHtml(f.note)}`);
  } else if (mode === "delivery") {
    const f = fields as DeliveryFields;
    rows.push(`📍 ${escapeHtml(f.address)}`);
    rows.push(`👤 ${escapeHtml(f.recipientName)}`);
    rows.push(`📞 ${formatPhone(f.recipientPhone)}`);
    if (f.note) rows.push(`💬 ${escapeHtml(f.note)}`);
  }
  // dine_in: the table is already in the mode line — no extra contact block.
  return rows.length > 0 ? rows.join("\n") : null;
}

function formatPhone(raw: string): string {
  const trimmed = raw.trim();
  if (/^\+/.test(trimmed)) return escapeHtml(trimmed);
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 9) return `+998 ${digits}`;
  if (digits.startsWith("998")) return `+${digits}`;
  return escapeHtml(trimmed);
}

function formatScheduledTime(isoLocal: string): string {
  const [date, time] = isoLocal.split("T");
  if (!date || !time) return isoLocal;
  return `${date} ${time}`;
}
