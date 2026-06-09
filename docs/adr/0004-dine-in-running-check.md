# ADR 0004 — Dine-in running check, "ask for the bill", and table settle

- **Date:** 2026-06-10
- **Status:** Proposed
- **Owner:** @bakh
- **Linear:** [KRA-67](https://linear.app/krafta/issue/KRA-67) (dine-in table grouping / settle) · relates [KRA-64](https://linear.app/krafta/issue/KRA-64) (order-more, done), [KRA-74](https://linear.app/krafta/issue/KRA-74) (bar mode), [KRA-32](https://linear.app/krafta/issue/KRA-32) (order dashboard)
- **Extends:** [ADR 0001](./0001-orders-catalog-schema-v1.md) §3.3 (fulfillments + dine-in sessions), §7 Q7 (one order row per round)

## 1. Context

Dine-in is the flagship flow. The real-world scenario:

> A customer sits down → orders → some time later orders more → and more → eventually pays and leaves.

Two holes in today's customer experience:

1. **You lose sight of the running check.** After placing a round, the cart resets to empty. While you browse to order more, there is no view of *what you've already ordered at this table* or the running total. (The merchant complaint: "I cannot see what is already ordered for this table while I reorder.")
2. **There is no clean "end".** Nothing lets the table say "we're done, bring the bill," and the merchant has no one-tap way to close the whole table.

The good news, confirmed against the schema + `lib/cart/checkout.ts`: **the data model already supports this correctly.** This ADR is about the missing *affordances* (a customer-facing running check, "ask for the bill", and a table-level settle), not a schema redesign.

## 2. What already exists (do not rebuild)

```
table_session  ── the shared CHECK for a table
   │              (commerce.table_sessions: venue_id, table_label, status open|closed,
   │               opened_at, closed_at, qr_code_id, metadata)
   │              find-or-create: a partial UNIQUE INDEX on (venue_id, table_label)
   │              WHERE status='open' guarantees ONE open session per table — so
   │              everyone who scans Table 5 joins the SAME session.
   ├─ order #1  ── round 1   (commerce.orders.state: draft → open → completed | canceled)
   ├─ order #2  ── round 2   ← "Order more" (KRA-64, shipped) reuses the session
   └─ order #3  ── round 3
        each order also carries guest_session_id — which device/guest placed it.
```

- A **`table_session` is the running check** (the "tab"); each **`order` under it is a round** (the "suborder" we were reaching for). No new entity is needed.
- `lib/cart/checkout.ts` already does find-or-create of the open session per `(venue, table_label)` and attaches every round to it.
- [KRA-64](https://linear.app/krafta/issue/KRA-64) (shipped) persists the `table_session` so "Order more" re-uses it instead of asking for the table number again.

What is **missing** is purely surface: the customer can't *see* the accumulated check, can't *ask for the bill*, and the merchant can't *settle the table* in one action.

## 3. Decision

### 3.1 Keep the check primitive as-is

No change to `table_sessions` ↔ `orders`. The session is the check; orders are rounds. This already satisfies ADR 0001 §7 Q7.

### 3.2 Customer running check is scoped to the guest's own rounds (v1)

The session is *shared*, so in principle every round on Table 5 is joinable. **For v1 the customer-facing running check shows only the current guest's own rounds + their own running total**, not other guests' orders.

Rationale:

- **Privacy + RLS.** Showing a guest other people's orders means reading across `guest_session_id` / customers under the same table — and anyone who scans the table QR could then peek at the table's activity. Per-guest scope keeps orders RLS unchanged (a guest reads only their own orders).
- **It matches the common case.** In casual UZ dine-in, one person usually orders for the table, so "my rounds" ≈ "the table's rounds".
- **The merchant still sees the whole table.** The full shared-table view (all guests grouped under one `table_session`, aggregated total) is the *merchant's* surface — [KRA-67](https://linear.app/krafta/issue/KRA-67).

> Deferred: a shared "everyone at this table" customer view for groups splitting a check. Revisit post-launch; it needs an explicit table-join/consent model, not just an RLS relaxation.

### 3.3 Running-check UI: "cart = current round, table tab = placed rounds"

The fix for "I lose sight of what's ordered" is to make the placed rounds a **first-class, always-visible surface**, distinct from the cart (which stays "the round I'm building now").

- **Persistent table-tab bar.** In an active dine-in session with ≥1 placed round, a slim bar sits just above the storefront dock:
  `🧾 Стол 5 · 3 заказа · 240 000 so'm  ›`
  Always visible while browsing → the running total is never lost. Tap → the Table Check sheet.
- **Table Check sheet** (a bottom drawer, sibling to the cart drawer):
  - header: table label + running total;
  - rounds list — each round shows its items, a **live status pill** (Принят / Готовится / Подан, driven by `order.state` + `order_events`, realtime), and the round subtotal;
  - footer actions: **"Заказать ещё"** (close → back to the menu) and **"Попросить счёт"** (§3.4).
- **Cart drawer unchanged** — it is only the round being built. Placing it appends a round to the check and clears for the next.
- The **placed-step becomes this same Table Check view** (right after placing, you see the whole table so far), and a small **"Стол 5" chip in the header** signals you're seated (with a "leave / wrong table" affordance).

Rejected alternative: folding placed rounds *into* the cart drawer (cart shows "already ordered" + "current round"). Simpler surface, but it muddies the cart's meaning (placed vs unplaced) — keeping the tab separate is clearer.

> The exact chrome (bar vs dock-integrated, sheet transitions) goes through `/design-review`; this ADR fixes the model + information architecture, not the pixels.

### 3.4 "Ask for the bill"

A customer action in the Table Check sheet. Cash-only, so it is a **signal, not a payment**:

1. Server action verifies the guest has an active order in an open `table_session`, then sets `table_sessions.bill_requested_at = now()` (idempotent).
2. Fire a **dedicated `bill_requested` notification type** — a first-class event, not a one-off message piggybacking the order ping — delivered to the merchant's bound Telegram chat, mirroring the order-ping path: `🧾 Стол 5 просит счёт · итого 240 000 so'm`. A dedicated type keeps the copy/handling distinct and leaves room for additional channels (in-app, etc.) later; Telegram is the v1 delivery (the mirror).
3. The merchant order dashboard ([KRA-67](https://linear.app/krafta/issue/KRA-67) surface) flags the table as "bill requested".
4. Merchant brings the bill, takes cash, settles the table (§3.5).

It closes nothing on its own — the merchant stays in control of the close.

### 3.5 Settle (the "end") — merchant-side, [KRA-67](https://linear.app/krafta/issue/KRA-67)

- Dashboard groups open orders by `table_session_id` into one collapsible row (table label + aggregated total + per-round pills).
- **"Settle whole table"** closes all open orders for the session (`state='completed'`) and stamps `table_sessions.status='closed'`, `closed_at`.
- The customer's running check then reads as closed; the next QR scan opens a *fresh* session (the unique index allows a new open session once the prior is closed).
- **No automatic close in v1 — merchant-only.** Abandoned / never-settled sessions stay open until the merchant settles them; a timeout-based auto-close is a deferred followup (§8), not launch behavior.

## 4. Schema changes

Minimal — one nullable column (dev-branch migration, per the standing rule):

```sql
alter table commerce.table_sessions
  add column bill_requested_at timestamptz;   -- set by "ask for the bill", cleared on close
-- optional, for a dashboard "tables awaiting a bill" view:
create index table_sessions_bill_requested_idx
  on commerce.table_sessions (venue_id)
  where bill_requested_at is not null and status = 'open';
```

Everything else (orders as rounds, the session lifecycle) already exists.

## 5. RLS

- **Reads (per-guest scope, §3.2):** orders RLS is unchanged — a guest reads their own orders; the running check is "my rounds in this session".
- **`bill_requested_at` write:** via a server action that verifies the caller has an active (`state='open'`) order whose fulfillment points at the target `table_session`, then writes the flag with the service client (the column is not directly guest-writable). Avoids a broad table-update policy.
- **Settle writes** are merchant-scoped (dashboard, existing org RLS).

## 6. Patterns explicitly rejected (v1)

- **Shared "whole table" customer view** — privacy + needs a table-join/consent model. Merchant gets the shared view; customer gets their own tab.
- **Per-item bill splitting / "pay your share"** — out of scope for cash-only v1; the schema (orders + guest_session_id) does not preclude it later.
- **In-app payment at settle** — cash-only (ADR 0001 / KRA-24). The `order_payments` seat exists for v2 (Uzum) and bar pre-auth ([KRA-74](https://linear.app/krafta/issue/KRA-74)).

## 7. Consequences

**Enables**
- The customer never loses the running check (the explicit complaint), and gets a clear "we're done" action.
- The merchant closes a table in one tap and sees who's waiting on a bill.
- Bar mode ([KRA-74](https://linear.app/krafta/issue/KRA-74): open tabs + card pre-auth) is a thin extension of this — same session-as-tab primitive, plus auth/capture.

**Constrains**
- Per-guest v1 scope means a true split-the-table-bill customer flow is a later, deliberate addition.
- "Ask for the bill" leans on the existing notification binding being set up for the venue.

**Risks**
- Stale open sessions (table never settled) accumulate, since v1 is merchant-only close (no auto-close, §3.5). Acceptable for launch; a timeout-based auto-close is a deferred followup if it bites in practice.
- Realtime status pills add a subscription on the storefront; must be cheap (scope to the guest's own orders in the session).

## 8. Resolved + open questions

- **Resolved — notification type:** a **dedicated `bill_requested` type**, delivered to the merchant's bound Telegram chat (mirrors the order-ping). Not a one-off message on the order path. (§3.4)
- **Resolved — auto-close:** **merchant-only** in v1. No timeout-based auto-close; abandoned sessions wait for the merchant to settle. A timeout sweep is a possible later followup. (§3.5)
- **Open:** does "Заказать ещё" from the check pre-select dine-in + table, or rely on the persisted session? (Lean: persisted session, per [KRA-64](https://linear.app/krafta/issue/KRA-64).)

## 9. Followups

- File the (currently untracked) **customer running-check** issue — the v1 build of §3.3 + §3.4.
- [KRA-67](https://linear.app/krafta/issue/KRA-67) becomes the paired merchant settle + table-grouping work.
- Migration §4 (dev branch).

## 10. References

- [ADR 0001](./0001-orders-catalog-schema-v1.md) §3.3, §7 Q7 — fulfillments, dine-in sessions, one-order-per-round.
- [KRA-67](https://linear.app/krafta/issue/KRA-67), [KRA-64](https://linear.app/krafta/issue/KRA-64), [KRA-74](https://linear.app/krafta/issue/KRA-74), [KRA-32](https://linear.app/krafta/issue/KRA-32).
- Square Full Service / table checks; Square "Bar" mode (open tabs).
