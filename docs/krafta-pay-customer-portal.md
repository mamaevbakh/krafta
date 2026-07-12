# Krafta Pay — Hosted Customer Portal ("Manage Billing")

> **Status:** **Redesign implemented + live-verified on dev (2026-07-12).** Backend + wiring were already shipped; the hosted page has now been fully rewritten to the two-panel Stripe "Manage Billing" bar (RU-first, responsive, light/dark), wired to the existing action routes and rendering real `payments`-schema data. Verified end-to-end against a real dev session (desktop light/dark, mobile, working plan-change / cancel forms). Remaining follow-ups are the Phase-2 items in §9.
> **Owner surface:** `apps/krafta-pay` (hosted) + `apps/krafta` (entrypoint).
> **Reference:** Stripe Customer Portal ("Manage Billing"). See screenshot annotation below.
> **Mockup:** [`krafta-pay-customer-portal.mockup.html`](./krafta-pay-customer-portal.mockup.html) — the redesign, rendered (RU, responsive, light/dark, theme toggle). Open it in a browser to eyeball §5.
> **Related:** [`krafta-pay-platform-reference.md`](./krafta-pay-platform-reference.md), [`../DESIGN.md`](../DESIGN.md), Krafta Pay Stripe-redesign initiative.

---

## 1. What this feature is

A **hosted, tenant-branded billing portal** — the exact analogue of Stripe's "Manage Billing" page. A subscriber clicks **Manage Billing** inside the Krafta app, is redirected to a short-lived signed URL on Krafta Pay, and lands on a page where they can:

- see their **current subscription** (plan, price, renewal date, status),
- **manage the payment method** (view / add / change / remove, set default),
- review **billing information**,
- browse **invoice history** (date, amount, status, download),
- **cancel** or **change plan**,
- **return to the app** via a branded back-link.

This is the *manage-an-existing-subscription* surface. Choosing/upgrading a tier (Free / Pro / Business) stays in the main app's billing page (`PlansBrowser` → `startUpgradeAction`). Portal = manage; app = pick plan. Same split Stripe uses.

### Product model (who is who)

Krafta Pay is a **Stripe-like platform with bring-your-own-acquirer (BYOA)**. For today's flow:

| Stripe concept | Krafta Pay today |
|---|---|
| Stripe (the platform) | **Krafta Pay** (`apps/krafta-pay`) |
| Merchant (Higgsfield Inc.) | **Payee org** — today `Krafta.Studio`, billing merchants for their Krafta subscription |
| Customer / cardholder | **The Krafta merchant** paying for Pro/Business |
| "powered by Stripe" | **"Обработка платежей проводится Krafta Pay"** |

**Key consequence: the portal must be white-label / tenant-branded.** The left panel's brand, logo, brand color, and "Return to X" link are driven by the **payee org**, not hardcoded to Krafta — because other platform merchants will eventually run their own subscribers through this same portal (exactly as Stripe does).

---

## 2. The reference (Stripe "Manage Billing"), annotated

The screenshot the user shared (Higgsfield Inc., RU locale). What makes it good, section by section:

```
┌───────────────────────────┬─────────────────────────────────────────────┐
│  DARK LEFT RAIL           │  LIGHT CONTENT COLUMN                        │
│                           │                                             │
│  [logo]                   │  ТЕКУЩАЯ ПОДПИСКА                            │
│                           │  Higgsfield Pro                             │
│  "Higgsfield Inc.         │  29,00 $ в месяц                            │
│   сотрудничает с          │  ▸ Показать подробности                     │
│   Stripe для упрощения    │  ⇄ Списание средств в UZS                    │
│   выставления счетов."    │  Следующая дата: 19 июля 2026 г.            │
│                           │  [VISA] Visa •••• 1002   ✎                   │
│  ← Вернуться на сайт      │                                             │
│    Higgsfield Inc.        │  СПОСОБ ОПЛАТЫ                               │
│                           │  [VISA] Visa •••• 1002   [По умолчанию]  ✕   │
│                           │  Срок действия истекает 04/2030             │
│                           │  + Добавить способ оплаты                    │
│                           │                                             │
│                           │  СВЕДЕНИЯ О ВЫСТАВЛЕНИИ СЧЕТОВ               │
│                           │  Адрес для выставления счетов        UZ     │
│                           │  ✎ Обновить информацию                      │
│                           │                                             │
│                           │  ИСТОРИЯ СЧЕТОВ                              │
│  Обработка платежей       │  19 июн. 2026   364 426,38 UZS  [Оплачено]  │
│  проводится Stripe        │                 ⇄ 29,00 $       Higgsfield  │
│  Условия · Конфиденц.     │                                    Pro       │
└───────────────────────────┴─────────────────────────────────────────────┘
```

Design lessons to carry over:

1. **Two-panel split.** Dark, quiet brand rail on the left; white, dense content on the right. Instantly reads as "official hosted billing," not an app screen.
2. **Tenant brand, not processor brand.** The big name is the *merchant's* ("Higgsfield Inc."); the processor ("Stripe") is a small footer line. Trust flows from the merchant; the processor is plumbing.
3. **Money is legible.** Tabular numerals, comma separators, dual-currency shown honestly (nominal `$` + actual `UZS` charge with a swap glyph).
4. **Card brand iconography.** Real Visa/Mastercard marks + masked last-4 + expiry. Feels like a real card-on-file, not a token string.
5. **Status as a calm pill.** "Оплачено" is a small green badge, not a colored word.
6. **Progressive disclosure.** "Показать подробности" hides line-item detail until asked.
7. **One obvious exit.** "← Вернуться на сайт …" is the only navigation.

---

## 3. What Krafta already has (do NOT rebuild)

The entire pipe is built and working. This is a **design** task, not a from-scratch feature.

### 3.1 End-to-end flow

```
[apps/krafta] billing page
   └─ <form POST /api/billing/customer-portal>  "Manage Billing" button
        └─ route: auth + org-membership check, builds returnUrl
             └─ createKraftaPayCustomerPortalSession()   (lib/billing/pay-client.ts)
                  └─ POST {KRAFTA_PAY_URL}/api/v1/customer_portal/sessions  (Bearer API key)
                       └─ [apps/krafta-pay] mints opaque token, stores SHA-256 hash,
                          returns { url: {PAY_BASE_URL}/portal/<rawToken>, expiresAt }
        └─ 303 redirect browser → hosted portal
[apps/krafta-pay] GET /portal/<token>  ← THE PAGE TO REDESIGN
   └─ in-portal actions POST back to sibling routes, 303 redirect ?success=…
   └─ "Return to App" → origin-allowlisted return_url
```

### 3.2 Files

| Path | Role |
|---|---|
| `apps/krafta/app/dashboard/[orgSlug]/[catalogSlug]/billing/page.tsx` | "Manage Billing" button (`canOpenBillingPortal` gate) |
| `apps/krafta/app/api/billing/customer-portal/route.ts` | Auth + membership, mints session, 303 redirect |
| `apps/krafta/lib/billing/pay-client.ts` | `createKraftaPayCustomerPortalSession()` server-to-server client |
| `apps/krafta-pay/app/api/v1/customer_portal/sessions/route.ts` | Session mint API (Bearer key, resolves customer, `flow_type` deep-link) |
| **`apps/krafta-pay/app/portal/[session_token]/page.tsx`** | **The hosted page — redesign target** |
| `apps/krafta-pay/app/portal/[session_token]/subscriptions/[subscription_id]/cancel/route.ts` | Cancel-at-period-end |
| `apps/krafta-pay/app/portal/[session_token]/subscriptions/[subscription_id]/update/route.ts` | Plan change (immediate or deferred) |
| `apps/krafta-pay/app/portal/[session_token]/payment-methods/uzum/update/route.ts` | Card bind flow (provider-specific — see §6) |
| `apps/krafta-pay/src/lib/customer-portal.ts` | Token gen/hash, TTL, return-URL allowlist, audit events |

### 3.3 Session security (already solid — keep as-is)

- Opaque token: `crypto.randomBytes(24).toString("base64url")`, in the URL path only.
- Only the **salted SHA-256 hash** (`token_hash`) is stored — never the raw token.
- TTL: **5 min** unused → extended to **30 min** on first open (`resolveActiveCustomerPortalSession`).
- Return-URL **origin allowlist** (`normalizeCustomerPortalReturnUrl`) against `KRAFTA_APP_URL(S)` / `PAY_BASE_URL`.
- Audit trail: `payments.customer_portal_events` + `payments.logs` (`customer_portal / session.created`).
- **Deep-link flows:** session carries `flow_type ∈ { payment_method_update, subscription_cancel, subscription_update }` + `flow_data.subscriptionId` so the app can open the portal focused on one action (the page already highlights `flow_data.subscriptionId`).

### 3.4 Data model available to the page

| Table (`payments` schema) | Fields the page reads |
|---|---|
| `customers` | `id, email, phone, customer_org_id, customer_user_ref` |
| `subscriptions` | `id, status, plan_id, cancel_at_period_end, current_period_start, current_period_end, default_payment_method_id, metadata.pending_plan_change` |
| `payment_methods` | `id, provider_id, provider_token, status, is_default, created_at` |
| `plans` | `id, name, code, amount_minor, currency, interval_count, is_active` |
| `invoices` | `id, subscription_id, status, amount_due_minor, currency, attempt_count, due_at, paid_at, billing_period_start, billing_period_end, created_at` |

---

## 4. Why the current page is bad (gap analysis)

Concrete regressions in `portal/[session_token]/page.tsx` today:

1. **Reads like an admin/debug view.** Raw UUIDs printed in mono to the end user: `customer_id`, `customer_org_id`, `customer_user_ref`, full `subscription.id`. A cardholder must never see these.
2. **Internal copy leaks.** Body text literally says *"MVP: status visibility"*, *"Stripe-like portal parity"*, *"Proration invoices are not created yet in Krafta Pay."* Ships engineering notes to customers.
3. **No brand, no shell.** No two-panel layout, no logo/wordmark, no "powered by Krafta Pay" footer, no return-to-site framing. Just a `max-w-5xl` stack of cards.
4. **DESIGN.md color violations.** Hardcoded `emerald-*` / `amber-* `/ `rose-*` Tailwind for status and banners. DESIGN.md §Color forbids ad-hoc status colors ("must be discussed and added to the table before use") and mandates semantic tokens.
5. **Hand-rolled controls.** Buttons are raw `<button className="inline-flex h-9 …border">` and native `<select>` instead of shadcn `<Button>` / `<Select>` — violates DESIGN.md §Components ("check `components/ui/` first, no exceptions").
6. **Raw `<table>` for invoices.** No shadcn `<Table>`, no status badge, no amount alignment, no download.
7. **English-only.** Violates DESIGN.md §i18n (RU default, RU/UZ/EN). Portal has no locale plumbing.
8. **Money rendering.** Uses `Intl.NumberFormat` currency style, not `font-mono tabular-nums` per DESIGN.md; no dual-currency treatment.
9. **Provider-coupled.** Payment-method section is hardcoded to "Uzum card," but subscriptions are moving to **Atmos** inline-card (see §6).
10. **Card-on-file is a token string.** Shows a masked `provider_token` (`abcd...wxyz`), not brand + last-4 + expiry.

---

## 5. Target design

The redesign matches the Stripe reference **through the Krafta lens** — i.e. Stripe's *information architecture and polish*, rendered in Krafta's brutally-minimal token system, RU-first, shadcn-only.

### 5.1 Layout — two-panel shell

```
┌──────────────────────┬──────────────────────────────────────┐
│  BrandRail (sticky)   │  <main> max-w-[560px], py-12, gap-10 │
│  bg = inverted surf.  │  ┌────────────────────────────────┐  │
│  ~360px, full height  │  │ Section: Текущая подписка       │  │
│                       │  ├────────────────────────────────┤  │
│  • payee logo/wordmark│  │ Section: Способ оплаты          │  │
│  • trust line         │  ├────────────────────────────────┤  │
│  • ← return link      │  │ Section: Сведения о выставлении │  │
│                       │  ├────────────────────────────────┤  │
│  • footer:            │  │ Section: История счетов         │  │
│    powered by Krafta  │  └────────────────────────────────┘  │
│    Pay · Условия      │                                      │
└──────────────────────┴──────────────────────────────────────┘
Desktop ≥1024px: side-by-side. <1024px: rail collapses to a
top bar (logo + return link); content stacks full-width, mobile-first (375px).
```

- **Left rail is NOT a DESIGN.md violation.** It's a *solid* inverted surface (Krafta's existing dark tokens: `bg-foreground text-background` in light mode, i.e. the near-black `oklch(0.141 …)` already defined in `packages/theme`). No gradient, no blob, no shadow — token-compliant. Frame it as "the dark surface the system already ships," not a new invention.
- Content column is narrow and centered-in-its-column (Stripe's ~560px reading measure), **not** `text-center` — copy stays left-aligned per DESIGN.md anti-slop rule #10.
- Sections are separated by whitespace + a light `border-b border-border`, **not** boxed cards (Stripe uses section rules, not card chrome; DESIGN.md anti-slop rule #4 "cards earn their existence" — here flat sections are cleaner).

### 5.2 Section-by-section spec

**A — Текущая подписка (Current subscription)**
- Eyebrow: `text-xs tracking-wide uppercase text-muted-foreground` → "Текущая подписка".
- Plan name `text-lg font-semibold` (`plans.name`).
- Price: `font-mono tabular-nums text-2xl` + interval — `29 000 UZS / мес` (or `29,00 $ / мес` if plan currency is USD). Format via the same currency helpers the app uses; comma/space thousands, no decimals for UZS.
- Dual-currency line (only if plan is USD-nominal, FX-settled): `⇄ Списание в UZS` with the settled sum.
- Next renewal: `Следующее списание: 19 июля 2026 г.` (`current_period_end`).
- Status pill (see §5.3). If `cancel_at_period_end`: amber "Отменяется 19 июля".
- If `metadata.pending_plan_change`: inline note "Запланирован переход на {plan} с {date}".
- `▸ Показать подробности` — shadcn `<Collapsible>` revealing plan line items / tax.
- Actions row: `<Button variant="outline">Сменить план</Button>` `<Button variant="ghost" className="text-destructive">Отменить подписку</Button>` (these post to the existing `update` / `cancel` routes).

**B — Способ оплаты (Payment method)**
- Card row: **brand icon** (Visa/Mastercard SVG) + `•••• {last4}` + `Срок действия {mm/yy}` + `[По умолчанию]` badge + `✕` remove (ghost icon button).
- `+ Добавить способ оплаты` → provider bind flow (Atmos inline card; see §6).
- ⚠️ Requires storing card brand/last4/expiry — see §6 backend gap.

**C — Сведения о выставлении счетов (Billing information)**
- Label/value rows (name, email, billing country). `✎ Обновить информацию`.
- ⚠️ No billing-address model today — Phase 2 (see §7). MVP: show `customers.email` + country only.

**D — История счетов (Invoice history)**
- shadcn `<Table>`: `Дата · Сумма (font-mono tabular-nums, right-aligned) · Статус (pill) · [Скачать]`.
- Row = one `invoices` record. "Оплачено" when `status = paid`.
- Empty state: quiet "Счетов пока нет.", not a debug line.

### 5.3 Tokens & type (bind implementers to DESIGN.md)

| Element | Spec |
|---|---|
| Left rail bg / text | inverted surface tokens (`bg-foreground` / `text-background`) — solid, no gradient |
| Content bg | `bg-background` |
| Section eyebrow | `text-xs uppercase tracking-wide text-muted-foreground` |
| Money | `font-mono tabular-nums`, comma/space thousands, UZS = 0 decimals |
| Borders/dividers | `border-border` only |
| Buttons | shadcn `<Button>` variants (`default` / `outline` / `ghost` / destructive via `text-destructive`) |
| Select / Collapsible / Table / Badge | shadcn `components/ui/*` — never hand-rolled |
| Icons | `lucide-react` (`Pencil`, `X`, `Plus`, `ChevronRight`, `ArrowLeft`); card brands are the only non-lucide SVGs (brand marks) |
| Radius | `rounded-md` controls, `rounded-lg` any grouped surface |
| Wordmark | `<BrandWordmark>` (`apps/krafta-pay/components/brand/brand-wordmark.tsx`) for the Krafta payee case |

**Status pills — needs a DESIGN.md decision.** Stripe uses green "Paid." DESIGN.md currently has **no success/warning tokens** and requires ratifying them first. Two options:
- **(Recommended)** Add `--success` / `--warning` semantic tokens (light+dark) to `packages/theme` and DESIGN.md §Color, then use them for `paid`/`active` (green) and `past_due`/`canceling` (amber). One-time, unblocks all of Krafta Pay's Stripe redesign.
- Interim: render status as a **neutral** pill (`bg-muted text-foreground`) with only `destructive` for failures — fully compliant today, less Stripe-faithful.

### 5.4 Localization

- Portal must render in the subscriber's locale (RU default). Thread locale via `flow_data.locale` (or `metadata.locale`) on session mint, or a `?lang=` on the return/portal URL, resolved server-side. Fall back to `ru`.
- Reuse the dashboard i18n pattern (`krafta_dash_locale` cookie + per-namespace catalog) — add a `billing_portal` namespace (RU/UZ/EN). No hardcoded English strings in the component.
- RU is native, not machine-translated (per DESIGN.md §i18n + Krafta design taste).

---

## 6. Provider correctness (Atmos, not Uzum)

The hosted page's card action is hardcoded to **Uzum** (`payment-methods/uzum/update`), but Krafta subscriptions are now **Atmos inline-card first** (Atmos is the first inline-card provider; subscription pay is Atmos-only on dev). The redesign should:

- Make the payment-method section **provider-aware** (`payment_methods.provider_id`), rendering the right bind flow per provider.
- For Atmos: inline card capture + save-card, returning card **brand / last4 / exp** — which must be **persisted** on `payment_methods` (new columns or a `card` JSON blob) so section B can show "Visa •••• 1002 · 04/2030" instead of a masked token. **This is the one real backend addition the redesign needs.**

---

## 7. Build plan — DONE (2026-07-12)

Implemented in the rewrite of `apps/krafta-pay/app/portal/[session_token]/page.tsx` (+ supporting files):

1. ✅ **Portal shell** — in-page two-panel BrandRail (persistent dark surface, no gradient) + content, "powered by Krafta Pay" footer, mobile top-bar collapse.
2. ✅ **Rewrite `page.tsx`** — section-by-section per §5, RU-first, tokens-only. Every raw UUID and "MVP/parity" string removed.
3. ✅ **Status tokens** — `--success` / `--warning` ratified into `apps/krafta-pay/app/globals.css` (+ DESIGN.md decisions log). packages/theme addition deferred until the main app needs them.
4. ✅ **Primitives** — status pills as token-driven spans; `Badge` extended with `success`/`warning`; progressive disclosure via native `<details>` (no client `Collapsible`); native styled `<select>` in the server-rendered plan form. **`buttonVariants` extracted to `components/ui/button-variants.ts`** so RSCs can style native `<button>`/`<summary>` (the "use client" `button.tsx` re-exports it — this was a required fix; calling a `"use client"` export from the server throws).
5. ✅ **Card metadata** — page now selects + renders real `payment_methods.brand`/`last4`/`exp_month`/`exp_year` (they already existed; the old page never read them) + Visa/Mastercard brand marks. Making the card-*update* flow provider-aware for Atmos is still §6 / Phase 2.
6. ✅ **i18n** — **RU + UZ (Latin) + EN** via `_strings.ts` (incl. UZ-Latin dates via `uz-Latn-UZ`), resolved from session `metadata.locale` or `?lang`. A shared `billing_portal` namespace (vs. the local dict) is still optional.
7. ◐ **White-label** — rail brand from `session.metadata.brand_name` (default "Krafta" `<BrandWordmark>`); return link from `session.return_url`. Full payee logo/brand-color plumbing is Phase 2.
9. ✅ **Atmos card update (§6)** — the card-update form now POSTs to `payment-methods/atmos/update`, which mints a zero-amount `card_update` setup session (`createCardSetupSession`, extended with a portal `customerId` path) and redirects to the hosted Atmos inline card form; the existing apply route binds the new card as the subscription's renewal default with no charge. Verified live to the card form + correct `card_update` intent; the OTP bind itself reuses the main app's already-live change-card path.
8. ✅ **Kept untouched:** session security, mint API, redirect route, cancel/update/card route handlers, entrypoint button.

New files: `_strings.ts`, `_theme-toggle.client.tsx`, `components/ui/button-variants.ts`. Verified live on dev against a real session (desktop light/dark, mobile, plan-change + cancel forms). `tsc --noEmit` clean.

---

## 8. Open decisions

| # | Question | Recommendation |
|---|---|---|
| 1 | Ratify `--success`/`--warning` tokens now, or ship neutral pills? | Ratify — unblocks the whole Krafta Pay Stripe redesign. |
| 2 | Dark left rail acceptable vs. DESIGN.md's light bias? | Yes — it's the existing dark surface tokens, solid, no gradient. Flag for /design-review sign-off. |
| 3 | White-label brand source — where do payee logo/color/site come from? | Add brand fields to the payee org (Krafta Pay merchant) settings; default to Krafta. |
| 4 | Billing address — build the model or defer? | Defer to Phase 2; MVP shows email + country. |
| 5 | Plan-change UX — inline `<select>` (today) or a proper "Сменить план" dialog listing tiers? | Dialog listing tiers (Stripe-like), reusing the app's plan metadata. |
| 6 | Invoice PDF/receipt download — in scope? | Phase 2 (needs invoice-render/store). MVP: row without download. |

---

## 9. Out of scope / phasing

- **Phase 1 (this doc):** two-panel branded shell, redesigned subscription + payment-method + invoice sections, tokens/i18n compliance, Atmos card metadata, remove all debug leakage.
- **Phase 2:** billing address model + edit, invoice PDF/receipt download, dunning/past-due recovery UI, full white-label theming for third-party platform merchants.
```
