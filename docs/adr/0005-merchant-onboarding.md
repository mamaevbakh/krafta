# ADR 0005 — Merchant onboarding flow

- **Status:** Accepted — eng review 2026-06-10 (23 decisions integrated below; report at end). Implementation delegated; KRA-42 unblocked.
- **Date:** 2026-06-10 (amended same day per eng review)
- **Issue:** KRA-16 (epic) · KRA-40 (this research + ADR) · KRA-42 (wizard) · KRA-43/46 (register) · KRA-41 (anon auth, shipped) · KRA-35 (Library Canvas, the Studio surface)
- **Related:** KRA-6 (order modes), KRA-28/29 (theme), KRA-30 (languages), KRA-14 (landing), KRA-25 (TMA), KRA-66 (order notifications, shipped)

## Context

Today a first-time merchant taps "Create your shop" on the homepage and is **immediately dropped into a blank dashboard** with dummy `My shop` / `My catalog` / `My venue` defaults. There is no wizard, no input capture, no prefilled catalog, no register step. The whole onboarding UX is missing — but the *infrastructure* underneath it is already built:

- **Anon auth (KRA-41, shipped):** first CTA calls `signInAnonymously()` and the `create_draft_shop` SECURITY-DEFINER RPC atomically creates `organizations` + `organization_members(role=owner)` + `catalogs` + `venues(status=paused)`.
- **Register methods (shipped):** email OTP, email magic-link, Google OAuth (`lib/auth/actions.ts`). Telegram login is the one gap (KRA-46 — see §4: custom bridge, fast-follow).
- **The Studio surface (KRA-35):** the **Library Canvas** — the same customer card markup the customer sees, edited through the unified `EditorSheet` + `InlineText`/`InlineCurrency` primitives (the originally-planned `EditableItemCard` merged into these). The canvas is default-locale-only since KRA-94; per-locale editing lives in the `/translations` workbench. KRA-45's separate side-by-side preview is **superseded** (design doc 2026-05-20, P1). The Library Canvas already expects onboarding to pre-fill a "vertical-tuned starter set".

The goal: a merchant gets a **working, populated, branded shop and is ready to take orders**, balancing speed-to-wow against guidance.

### What the rival research found (KRA-40)

We studied Square, Toast, Yandex Eda/Market, Shopify, Stripe, Firebase Studio, Linear/Vercel/Supabase, and the Telegram-native store-builder genre (full teardown in the KRA-40 thread). Three findings dominate:

1. **Every rival registers at the *start* and gates first-value behind KYC / legal-entity / moderation.** No one delivers a "wow" before identity. Krafta's *build-first, register-to-publish* model is the single biggest structural UX advantage on the board — and **cash-only v1 is the enabling constraint**. Protect it: no phone / legal-status / KYC ask may leak earlier than the Publish step.
2. **The only designed "wow" anywhere is a *pre-populated* state, never an empty canvas.** Krafta's vertical-prefilled Library Canvas is the right instinct — make it the aha.
3. **The risk is screen *count*, not screen *type*.** Stripe reaches "wow" in ~1 step; Shopify caps onboarding at ≤5 steps. Vertical + shop-name are load-bearing (they drive the prefill and the storefront identity); **languages / modes / theme are better as inline, editable settings in the Studio than as gating screens.**

## Decision

### §1 — The wedge (locked): anonymous-first, register-at-end — **enforced at the DB**

Keep and protect the model KRA-41 already enables. The anonymous Supabase session is Krafta's "test mode": a fully functional build with **zero identity captured**. The register modal at **Publish** is "activation": the *only* thing it gates is going live.

Going live is a **dual gate**: `catalogs.status` `draft→published` *and* `venues.status` `paused→active` (storefront RLS requires both — `venues_select_anon` checks `status='active' AND catalog_is_public(catalog_id)`; `catalog_is_public` requires `status='published'`). Flipping the catalog early would leak draft menu data (locale/category policies key off `catalog_is_public` alone), so **both flip together, atomically, at Publish** via a `publish_shop` RPC.

The invariant "register gates going live" is **DB-enforced, not a UI convention**: `publish_shop` rejects anonymous JWTs, and `BEFORE UPDATE` trigger guards on `venues.status→active` and `catalogs.status→published` reject callers with the `is_anonymous` claim on *every* path (settings UI, raw PostgREST, future code). Registered merchants' pause/unpause from settings (KRA-34) is untouched.

### §2 — Flow shape: "**guided seeding — 7 + Studio**" *(amended 2026-06-10, wizard v2)*

> **Amendment (2026-06-10):** the original "2 + Studio" shape shipped, then was
> superseded the same day by product direction: the merchant should *walk
> through* shop creation, not inherit a demo to edit. The research constraint
> survives in two guarantees: **every screen is one tap if defaults are
> trusted** (suggestions arrive pre-checked from `vertical_templates`), and
> **nothing is created until the final submit** (abandoning mid-wizard leaves
> zero rows — which also shrank the orphan-shop problem). A menu the merchant
> assembled — even from suggestions — is a menu they'll publish.

```
①  Type        cafe / restaurant / retail              (loads the suggestions)
②  Name        shop name — no slug UI here             (storefront identity)
③  Sections    vertical's categories PRE-CHECKED       (toggle · add your own)
④  Items       suggestions PRE-CHECKED, names + prices (edit inline · add your own;
               editable inline                          untouched = keeps template
                                                        sizes/translations + demo marker)
⑤  Modes       vertical defaults; dine-in adds a       (table count → paired table
               table-count stepper                      QR codes via lib/tables)
⑥  Languages   RU default · UZ/EN pre-checked          (suggested items ship translated)
⑦  Contacts    phone + city — SKIPPABLE                (stored in venue address)
──▶ submit: bare create_draft_shop + curated create_wizard_menu (SECURITY INVOKER,
    atomic, every row authorized by owner RLS — D7's "definer never takes client
    payloads" still holds) ──▶ STUDIO with THEIR menu · checklist takes over
⑧  Publish modal:  slug confirm (transliterated suggestion, frozen on publish)
                    → demo-data nudge (untouched suggestions: remove / publish anyway)
                    → Register (Google / email OTP / Telegram)
                    → publish_shop  ──▶  "Your shop is live" + link/QR  ──▶  "Get order alerts in Telegram" (KRA-66)
```

Kept OUT of the wizard (checklist territory): photos (upload friction is the
classic abandon point), business hours, theme, Telegram alerts (celebration).

- **Slug lives at Publish, not at ②** (it's pure publish-time information — the moment it matters is the moment it's frozen onto printed QRs). Creation keeps today's random base36 slug internally; `publish_shop(p_final_slug)` updates org/catalog/venue slugs and flips both statuses in one transaction. Suggestion = RU/UZ Cyrillic→Latin transliteration of the shop name, numeric suffix on collision, random fallback for untransliterable input. **Frozen after publish** (QR permanence; renames are a non-goal).
- **Resume / wizard entry:** an anon session that already owns a shop skips the wizard entirely and lands in the Studio. Enforced by RPC-level idempotency (§6), not just routing.

**Alternatives considered:** B — full 8-screen wizard (top drop-off risk; depends on unbuilt theme/language UIs). C — hybrid 3–4 screens (order-modes gating screen). **Decision: A**, as above.

### §3 — The Studio landing = Library Canvas + activation checklist

Step ③ lands the merchant in the **Library Canvas** (KRA-35). The vertical-prefilled catalog renders with the same markup the customer sees; editing happens through the `EditorSheet` and inline primitives. Over the canvas, a dismissible **activation checklist** surfaces deferred config as actions: *rename/edit items · add a real photo · set languages (→ `/translations` workbench — the canvas is default-locale-only) · set order modes · pick a theme · set hours · connect Telegram notifications*. Each item is optional and never blocks.

- **Progress is derived from shop state** (items edited vs seed, media rows, `catalog_locales`, `venues.modes_enabled`, `settings_branding`, hours, `venue_telegram_settings`) — no `onboarding_state` column. Dismissal is a localStorage bit (per-device, acceptable v1).
- **Performance budget:** derivation reuses the canvas page's existing fetch; **at most one additional query**. The Studio keeps its KRA-35 1.5s/mobile-4G budget.

### §4 — Register at the end

At **Publish**, the register step inside the publish modal. Methods at launch:

- **Google OAuth** — `linkIdentity()` (anon → permanent, same `auth.uid`). Requires the **manual-linking flag** enabled on the Supabase project.
- **Email OTP / magic-link** — `updateUser({ email })` + `verifyOtp` (the anon→email conversion API; `linkIdentity` does not do email).
- **Telegram — fast-follow, off the critical path (KRA-46).** Supabase has no Telegram provider; `linkIdentity()` cannot link it. KRA-46 is a custom identity bridge (Login-Widget HMAC verification → attach to the *current* anon `auth.users` row / mint a real GoTrue user) and gets its own design doc. The shipped TMA rail does not help here: it mints **customer-grade** sessions (synthetic `uuidv5("tg:<id>")` sub, no `auth.users` row, no refresh token) and cannot carry merchant auth.

**Identity collision (designed, not discovered):** if the chosen identity already belongs to another user (returning merchant registering with their usual Google/email), conversion fails by design. The modal offers **"Sign in to your existing account and claim this draft"** → after sign-in, a `claim_draft_shop` SECURITY-DEFINER RPC re-points org ownership from the anon uid to the signed-in uid. The draft survives the funnel's worst case.

On success: `publish_shop` flips both gates + final slug (§1, §2), then the **celebration reveal** — the live storefront link + QR — followed by a second beat: **"Get order alerts in Telegram"** via the shipped KRA-66 connect-code flow (skippable; also stays on the checklist). The first *order*, not the first publish, is the retention moment — the celebration sells the thing that delivers it.

### §5 — Vertical-tuned starter catalogs (3 verticals in v1)

Each vertical seeds a small, believable, **locally-flavored** set (≈5–8 items across 2–3 categories):

| Vertical | Categories | Sample items |
|---|---|---|
| **Cafe** | Coffee · Pastries | Cappuccino, Latte, Espresso, Croissant, Cheesecake |
| **Restaurant** | Starters · Mains · Drinks | Achichuk salad, **Plov**, **Lagman**, **Samsa**, Non, Chai |
| **Retail** | Apparel · Accessories | T-shirt, Hoodie, Tote bag, Mug |

- **Services is cut from v1** (eng review D18): `fulfillment_type` has no booking/appointment/time-slot support, so a services shop's first real order would arrive as a timeless pickup — broken at the moment of highest trust. It returns when a booking flow is scoped (non-goal below). Re-adding it later is one template row + one wizard option.
- **Templates are data, single-sourced:** a `vertical_templates` lookup table (vertical key + template jsonb: categories, items, variations, and **translations for all three locales** — RU/UZ/EN ship in the template so no MT machinery fires per seed). The seed RPC validates `p_vertical` against this table and reads templates from it; the wizard derives the key list from generated DB types plus a small TS map for labels/icons. No client-supplied seed payloads ever reach the SECURITY-DEFINER function.

UZ-local restaurant items (plov, lagman, samsa, non) double as a market-fit signal in demos.

### §6 — Data & state (reuse, don't rebuild)

- **Seed on capture.** `create_draft_shop` v2 accepts `p_vertical` (allowlist-validated against `vertical_templates`) and `p_name` (length/charset-bounded — definer functions validate everything, same rigor as the existing slug check). One atomic transaction inserts: org + owner membership + catalog + paused venue + `catalog_locales` rows (**RU default, UZ/EN enabled** — the storefront locale-resolution chain reads this table; seeding items without it leaves language surfaces unconfigured) + the vertical's categories/items/variations/translations. Writes **`catalogs.vertical`** (persisted for Phase 3 behavior + funnel analytics). Creation slug stays random base36 (final slug at Publish, §2). Smart defaults: order modes vertical-appropriate, theme = one good default.
- **Search sync is trigger-owned.** Item/translation/category inserts fire `trg_catalog_search_sync_*` per row *inside the one transaction* — safe by construction. The implementation must **not** add app-level sync calls afterward (the KRA-88 double-sync lesson).
- **Seeded marker.** Seed rows carry a marker (e.g. `items.seeded_at` / template id) so "untouched demo item" is queryable — powers the publish-time nudge (§2) and funnel analytics (which seeds get kept/edited/deleted).
- **Idempotency lives in the RPC.** `create_draft_shop` v2 first checks for an existing owned org and returns it (seeding skipped) — double-tap, wizard resubmit, and back-button replay are safe at the transaction layer. The app-level check in `merchant-shop.ts` becomes a fast-path optimization.
- **Resume.** The anon session persists per Supabase refresh-token config. A returning anon merchant lands back in the Studio with the checklist showing what's left; the venue stays `paused` and the catalog stays `draft` (never public) until Publish.
- **Lifecycle (policy now, job later).** Unpublished anon-owned shops **expire after 90 days of inactivity** (guard: no non-anonymous member, venue never activated, no writes since TTL). The cleanup job ships post-launch once real abandonment data exists (TODOS.md). A lost anon session (cleared cookies, new device) = unrecoverable draft — **accepted v1 tradeoff**, stated here so support expectations are set.

### §7 — Bot / TMA stays out of onboarding

Telegram requires a bot for a Mini App to open, but onboarding must **never** make the merchant touch BotFather. v1: onboarding is bot-free; the storefront is web-first. Enabling the **TMA** (KRA-25, per-venue `tma_enabled`) is an optional post-Publish upgrade on the checklist. **Order notifications** (KRA-66, shipped) are surfaced at the celebration reveal (§4) and remain on the checklist — still optional, never a gate.

### §8 — Open questions, resolved

- **Welcome screen:** one line merged into screen ①; the real "welcome" is the post-register celebration reveal (§4).
- **Skip-all:** unnecessary at 2 gating screens; smart-default everything and put "do it later" on every checklist item. Vertical is the one required pick.
- **TMA vs web:** *corrected by eng review (D3).* TMA register is **not** implicit on the current rail — the TMA session is customer-grade (synthetic sub, no `auth.users` row). Merchant onboarding inside Telegram requires the KRA-46 bridge minting real GoTrue users. Phase 4 stays gated on KRA-46; until then, onboarding-in-Telegram opens the web flow.
- **Resume:** §6 — anon session + paused venue + draft catalog + checklist.

## Test plan (eng review D11/D12; regression mandatory)

- **pgTAP (`supabase test db`, new harness):** seed RPC — vertical allowlist + name bounds rejects, idempotent re-call returns existing org without reseeding, `catalog_locales` rows present, search-document count matches seeded items (trigger-driven), `catalogs.vertical` persisted; `publish_shop` — dual flip, final-slug update across org/catalog/venue, **anonymous caller rejected**, draft content invisible pre-publish; `claim_draft_shop` — ownership transfer, unauthenticated reject; trigger guards — anon direct `UPDATE` to active/published rejected.
- **Vitest (existing pattern):** transliteration (RU/UZ incl. ў қ ғ ҳ), slug suffixing, checklist derivation.
- **Playwright (new harness):** wow path — CTA → ① → ② → seeded Studio renders ≥5 items (doubles as the **mandatory regression test**: the CTA changes from create-now to wizard-first and must still end in an owned shop + Studio); publish path — Publish → email OTP (local inbucket) → venue active → storefront publicly reachable. Google leg: integration + manual (no real-OAuth E2E).

## Implementation phases

1. **Wow path (core):** `vertical_templates` + seed RPC v2 + pgTAP harness → wizard (① vertical ② name) + CTA rewire + resume redirect → land in Library Canvas. *(KRA-42 + seed migration; depends on KRA-35 canvas — shipped.)*
2. **Publish + register:** publish modal (slug confirm + demo nudge + register: Google/email) → collision claim flow → `publish_shop` + trigger guards → celebration reveal + notifications beat. *(KRA-43. Telegram login = KRA-46, fast-follow, off the critical path.)*
3. **Activation checklist + inline settings:** derived checklist (≤1 extra query), localStorage dismissal; languages/modes/theme/hours/notifications as non-blocking actions. *(Theme presets depend on KRA-28/29; ship a single default until then.)*
4. **TMA parity:** onboarding inside Telegram, gated on the KRA-46 bridge (real GoTrue users from verified Telegram identity). *(After KRA-25/46.)*

## Non-goals (v1)

Team invites & roles UI, any KYC, in-app payments (cash-only), custom bot / custom domain, theme-preset gallery if KRA-28/29 aren't built, per-item conditional modifiers, **services vertical until a booking flow exists**, **slug renames after publish**, **anon-shop cleanup automation** (policy set in §6; job deferred to TODOS.md), Telegram merchant login at launch (KRA-46 fast-follow). Marketplace/legal (KRA-5) stays launch+1.

## Consequences

**Good:** ships the only validated structural wedge (anon-first, pre-populated, register-to-publish) with the wedge now a **database guarantee**; reaches the Studio wow in 2 screens; reuses KRA-41 + KRA-35 + built auth + KRA-66; UZ-flavored seed catalogs read as market-fit; the funnel's worst cases (identity collision, dead-link publish, demo data going live, silent first orders) all have designed paths. **Costs:** the activation-checklist + publish-modal surface is net-new UI; the SQL surface grows by `vertical_templates`, seed v2, `publish_shop`, `claim_draft_shop`, and two trigger guards — all pgTAP-covered (new harness, one-time setup); Playwright is a new CI dependency; Telegram-first merchants register with Google/email until KRA-46 lands.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | stale (2026-05-22, via /autoplan, pre-dates this ADR) | 17 issues, 3 critical gaps (prior plan) |
| Outside Voice | `/codex consult` | Independent 2nd opinion | 1 | RAN (claude subagent, 2026-06-10) | 12 findings: 4 confirmed review, 6 new accepted, 1 tension resolved, 1 (prefill thesis) noted |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | **CLEAR (PLAN)** 2026-06-10 | 19 issues → 23 decisions (D1–D23), 0 unresolved, 0 open critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — (visual /design-review scheduled post-build, mobile + desktop) | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** outside voice agreed with review on Telegram scoping, collision handling, idempotency, lifecycle; new from outside voice: dual publish gate (D15), DB enforcement of the wedge (D16), demo-data-goes-live nudge (D19), services cut (D18), notifications-at-celebration (D20), vertical persistence (D21); tension on screen ② resolved as name-at-②/slug-at-Publish (D17).
- **UNRESOLVED:** 0 — all 23 decisions resolved (D1–D23; full decision log in session transcript, key outcomes integrated above).
- **VERDICT:** ENG CLEARED — ready to implement. Implementation delegated 2026-06-10.
