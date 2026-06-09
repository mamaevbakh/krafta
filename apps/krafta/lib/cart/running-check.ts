import "server-only";

import { createClient as createServiceClient } from "@supabase/supabase-js";

import { ensureCartIdentity } from "./identity";

/**
 * running-check.ts — the customer's dine-in "running check" (ADR 0004).
 *
 * A table_session is the shared check for a table; each placed order under it is
 * a round. This returns the CALLER'S OWN placed rounds in the current open
 * session for a table, plus the running total and the session's bill / close
 * state — so the storefront can show "your table so far" while the guest
 * re-orders, and the "ask for the bill" affordance.
 *
 * Per-guest scope (ADR §3.2): only the caller's own orders are ever returned.
 * We read with the service client (the open session + sibling rows aren't
 * anon-RLS-readable, and `bill_requested_at` is a freshly-added column we don't
 * want to regenerate types for), but EVERY order row is filtered to the
 * caller's `customer_id`, resolved from the trusted session — so nothing leaks.
 */

function serviceClient() {
  const url =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  // Intentionally untyped: reads `table_sessions.bill_requested_at` (added in
  // 20260609211418, not yet in generated types) and we map results by hand.
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

export type RunningCheckItem = {
  name: string;
  quantity: number;
  totalCents: number;
};

export type RunningCheckRound = {
  orderId: string;
  placedAt: string;
  /** "open" = sent to the kitchen; "completed" = served/closed by the merchant. */
  state: "open" | "completed";
  items: RunningCheckItem[];
  subtotalCents: number;
};

export type RunningCheck = {
  /** True when there's an open session with ≥1 of the caller's placed rounds. */
  active: boolean;
  sessionId: string | null;
  tableLabel: string;
  status: "open" | "closed" | null;
  billRequestedAt: string | null;
  rounds: RunningCheckRound[];
  runningTotalCents: number;
};

function empty(tableLabel: string): RunningCheck {
  return {
    active: false,
    sessionId: null,
    tableLabel,
    status: null,
    billRequestedAt: null,
    rounds: [],
    runningTotalCents: 0,
  };
}

export async function getDineInRunningCheck(input: {
  orgId: string;
  venueId: string;
  tableLabel: string;
}): Promise<RunningCheck> {
  const tableLabel = (input.tableLabel ?? "").trim();
  if (!tableLabel) return empty(tableLabel);

  const svc = serviceClient();
  if (!svc) return empty(tableLabel);

  const { customerId } = await ensureCartIdentity(input.orgId);

  // The current open check for this table.
  const { data: session } = await svc
    .schema("commerce")
    .from("table_sessions")
    .select("id, status, bill_requested_at")
    .eq("venue_id", input.venueId)
    .eq("table_label", tableLabel)
    .eq("status", "open")
    .maybeSingle();
  if (!session) return empty(tableLabel);

  const base: RunningCheck = {
    ...empty(tableLabel),
    sessionId: session.id as string,
    status: session.status as "open" | "closed",
    billRequestedAt: (session.bill_requested_at as string | null) ?? null,
  };

  // The caller's OWN placed rounds in this session — exclude the live draft
  // (current cart) and canceled rounds.
  const { data: orders } = await svc
    .schema("commerce")
    .from("orders")
    .select("id, state, created_at")
    .eq("customer_id", customerId)
    .eq("table_session_id", session.id)
    .in("state", ["open", "completed"])
    .order("created_at", { ascending: true });

  const orderRows = (orders ?? []) as {
    id: string;
    state: "open" | "completed";
    created_at: string;
  }[];
  if (orderRows.length === 0) return base;

  const orderIds = orderRows.map((o) => o.id);
  const { data: lines } = await svc
    .schema("commerce")
    .from("order_line_items")
    .select("order_id, name, quantity, total_price_cents")
    .in("order_id", orderIds);

  const itemsByOrder = new Map<string, RunningCheckItem[]>();
  for (const l of (lines ?? []) as {
    order_id: string;
    name: string;
    quantity: number;
    total_price_cents: number;
  }[]) {
    const list = itemsByOrder.get(l.order_id) ?? [];
    list.push({
      name: l.name,
      quantity: l.quantity,
      totalCents: l.total_price_cents,
    });
    itemsByOrder.set(l.order_id, list);
  }

  const rounds: RunningCheckRound[] = orderRows.map((o) => {
    const items = itemsByOrder.get(o.id) ?? [];
    return {
      orderId: o.id,
      placedAt: o.created_at,
      state: o.state,
      items,
      subtotalCents: items.reduce((s, i) => s + i.totalCents, 0),
    };
  });

  return {
    ...base,
    active: true,
    rounds,
    runningTotalCents: rounds.reduce((s, r) => s + r.subtotalCents, 0),
  };
}

/**
 * Flag the caller's open table_session as "bill requested" (ADR §3.4). Verifies
 * the caller actually has placed rounds in the session first (so a stray QR
 * scan can't flag someone's table). Returns the session + total for the
 * merchant ping; the caller fires the notification via `after()`.
 */
export async function markBillRequested(input: {
  orgId: string;
  venueId: string;
  tableLabel: string;
}): Promise<{ ok: boolean; sessionId?: string; totalCents?: number }> {
  const check = await getDineInRunningCheck(input);
  if (!check.active || !check.sessionId) return { ok: false };

  const svc = serviceClient();
  if (!svc) return { ok: false };

  await svc
    .schema("commerce")
    .from("table_sessions")
    .update({ bill_requested_at: new Date().toISOString() })
    .eq("id", check.sessionId)
    .eq("status", "open");

  return {
    ok: true,
    sessionId: check.sessionId,
    totalCents: check.runningTotalCents,
  };
}
