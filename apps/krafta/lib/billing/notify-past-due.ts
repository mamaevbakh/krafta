import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { escapeHtml, sendTelegramMessage } from "@/lib/telegram/bot-api";
import { getVenueTelegramTargetForDispatch } from "@/lib/telegram/settings";

/**
 * Billing-failure notifications for Krafta subscriptions, sent over the
 * merchant's already-connected Telegram bot. Runs on Krafta's own cron, NOT
 * inside Krafta Pay: the payments engine stays a generic multi-tenant platform
 * with no notion of any one client's notification channel.
 *
 * Two sweeps, both idempotent via commerce.subscription_payment_notifications
 * (one row per (subscription_id, event_type) ever sent):
 *
 *  1. past_due — the renewal charge failed and dunning is exhausted; access is
 *     already lost. Scoped to `past_due` only (a fresh `incomplete` signup
 *     almost certainly hasn't connected Telegram yet — the in-app banner owns
 *     that case).
 *
 *  2. card_expiring — PROACTIVE: an active subscription's saved card expires
 *     this month or next (or is already past). Warn before the next renewal
 *     charge fails, so the merchant can update the card ahead of time. Keyed
 *     per card-expiry month, so replacing the card (new expiry) ends the
 *     warnings and never re-warns for the same doomed card.
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

type Client = SupabaseClient<Database>;

const PAST_DUE_EVENT = "past_due";
const MAX_PER_RUN = 200;

export type NotifyResult = {
  scanned: number;
  notified: number;
  skippedNoTelegram: number;
};

const EMPTY: NotifyResult = { scanned: 0, notified: 0, skippedNoTelegram: 0 };

// ── shared helpers ──────────────────────────────────────────────────────────

/** Has this (subscription, event_type) notification already gone out? */
async function alreadyNotified(
  supabase: Client,
  subscriptionId: string,
  eventType: string,
): Promise<boolean> {
  const { data } = await supabase
    .schema("commerce")
    .from("subscription_payment_notifications")
    .select("subscription_id")
    .eq("subscription_id", subscriptionId)
    .eq("event_type", eventType)
    .maybeSingle();
  return Boolean(data);
}

async function markNotified(
  supabase: Client,
  subscriptionId: string,
  eventType: string,
): Promise<void> {
  await supabase
    .schema("commerce")
    .from("subscription_payment_notifications")
    .insert({ subscription_id: subscriptionId, event_type: eventType });
}

/**
 * Send `text` to the org's connected Telegram (first venue with a working
 * bot wins). Returns whether it actually reached a chat — false means the org
 * has no Telegram connected, which is not an error.
 */
async function sendToOrgTelegram(
  supabase: Client,
  orgId: string,
  text: string,
): Promise<boolean> {
  const { data: venues } = await supabase
    .from("venues")
    .select("id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  for (const venue of venues ?? []) {
    const target = await getVenueTelegramTargetForDispatch(venue.id);
    if (!target) continue;
    const res = await sendTelegramMessage(target.botToken, {
      chatId: target.chatId,
      text,
    });
    if (res.ok) return true;
  }
  return false;
}

// ── orchestrator ────────────────────────────────────────────────────────────

/** Run both billing-notification sweeps. Called by the notify cron. */
export async function runBillingNotifications(): Promise<{
  pastDue: NotifyResult;
  cardExpiring: NotifyResult;
}> {
  const supabase = getAdminClient();
  if (!supabase) return { pastDue: EMPTY, cardExpiring: EMPTY };
  const pastDue = await notifyPastDueSubscriptions(supabase);
  const cardExpiring = await notifyExpiringCards(supabase);
  return { pastDue, cardExpiring };
}

// ── sweep 1: past_due ───────────────────────────────────────────────────────

export async function notifyPastDueSubscriptions(
  client?: Client,
): Promise<NotifyResult> {
  const supabase = client ?? getAdminClient();
  if (!supabase) return EMPTY;

  const { data: subs, error } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("id, customers!inner(customer_org_id)")
    .eq("status", "past_due")
    .limit(MAX_PER_RUN);
  if (error || !subs || subs.length === 0) return EMPTY;

  let notified = 0;
  let skippedNoTelegram = 0;

  for (const sub of subs as Array<{
    id: string;
    customers: { customer_org_id: string | null } | null;
  }>) {
    const orgId = sub.customers?.customer_org_id;
    if (!orgId) continue;
    if (await alreadyNotified(supabase, sub.id, PAST_DUE_EVENT)) continue;

    const sent = await sendToOrgTelegram(supabase, orgId, buildPastDueMessage());
    // Mark notified either way — a merchant with no Telegram won't get one by
    // re-checking every tick; the billing-page banner is the durable fallback.
    await markNotified(supabase, sub.id, PAST_DUE_EVENT);
    if (sent) notified++;
    else skippedNoTelegram++;
  }

  return { scanned: subs.length, notified, skippedNoTelegram };
}

// ── sweep 2: card expiring (proactive) ──────────────────────────────────────

type ExpiringSub = {
  id: string;
  default_payment_method_id: string | null;
  customers: { customer_org_id: string | null } | null;
};

/**
 * Warn active subscriptions whose default card expires this month, next month,
 * or is already past — before the renewal charge fails. `now` is injectable for
 * deterministic tests.
 */
export async function notifyExpiringCards(
  client?: Client,
  now: Date = new Date(),
): Promise<NotifyResult> {
  const supabase = client ?? getAdminClient();
  if (!supabase) return EMPTY;

  const { data: subs, error } = await supabase
    .schema("payments")
    .from("subscriptions")
    .select("id, default_payment_method_id, customers!inner(customer_org_id)")
    .eq("status", "active")
    .not("default_payment_method_id", "is", null)
    .limit(MAX_PER_RUN);
  if (error || !subs || subs.length === 0) return EMPTY;

  // Warn when the card's last valid month is <= one month ahead of now.
  const threshold = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;

  let scanned = 0;
  let notified = 0;
  let skippedNoTelegram = 0;

  for (const sub of subs as ExpiringSub[]) {
    const orgId = sub.customers?.customer_org_id;
    if (!orgId || !sub.default_payment_method_id) continue;

    const { data: pm } = await supabase
      .schema("payments")
      .from("payment_methods")
      .select("brand, last4, exp_month, exp_year")
      .eq("id", sub.default_payment_method_id)
      .maybeSingle();
    if (!pm || pm.exp_month == null || pm.exp_year == null) continue;

    // exp_month is 1-12 → month index (exp_month - 1). A card is valid through
    // the END of exp_month, so compare that month against the lookahead threshold.
    const cardMonth = pm.exp_year * 12 + (pm.exp_month - 1);
    if (cardMonth > threshold) continue; // not expiring soon

    scanned++;
    // Key per specific expiry month → replacing the card (new expiry) ends the
    // warnings; never re-warns for the same doomed card.
    const eventType = `card_expiring:${pm.exp_year}-${String(pm.exp_month).padStart(2, "0")}`;
    if (await alreadyNotified(supabase, sub.id, eventType)) continue;

    const sent = await sendToOrgTelegram(
      supabase,
      orgId,
      buildCardExpiringMessage(pm.brand, pm.last4, pm.exp_month, pm.exp_year),
    );
    await markNotified(supabase, sub.id, eventType);
    if (sent) notified++;
    else skippedNoTelegram++;
  }

  return { scanned, notified, skippedNoTelegram };
}

// ── messages (RU) ───────────────────────────────────────────────────────────

function buildPastDueMessage(): string {
  return [
    "⚠️ <b>Не удалось продлить тариф Krafta</b>",
    "Оплата картой не прошла, доступ к платным функциям приостановлен.",
    `Зайдите в раздел ${escapeHtml("«Оплата»")} в панели Krafta, чтобы повторить платёж или обновить карту.`,
  ].join("\n");
}

function buildCardExpiringMessage(
  brand: string | null,
  last4: string | null,
  expMonth: number,
  expYear: number,
): string {
  const cardLabel = [brand, last4 ? `•••• ${last4}` : null].filter(Boolean).join(" ");
  const mmYY = `${String(expMonth).padStart(2, "0")}/${String(expYear).slice(-2)}`;
  return [
    "💳 <b>Срок действия карты истекает</b>",
    cardLabel
      ? `Карта ${escapeHtml(cardLabel)} действует до ${escapeHtml(mmYY)}.`
      : `Срок действия вашей карты истекает ${escapeHtml(mmYY)}.`,
    `Обновите карту в разделе ${escapeHtml("«Оплата»")}, чтобы продление тарифа Krafta прошло без сбоев.`,
  ].join("\n");
}
