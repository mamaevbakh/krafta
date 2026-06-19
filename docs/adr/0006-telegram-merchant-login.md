# ADR 0006 — Telegram merchant login (KRA-46): the identity bridge

- **Status:** Accepted — 2026-06-10 (constraints fixed at the ADR 0005 eng review same day; primitives verified against `supabase/auth` master source + live docs, 2026-06-10)
- **Date:** 2026-06-10
- **Issue:** KRA-46 (this bridge) · KRA-43 (publish/register, shipped) · KRA-42 (wizard, shipped) · KRA-25 (TMA) — Phase 4 of ADR 0005 consumes this bridge
- **Related:** ADR 0005 §4 (register-at-publish, claim handshake), `lib/telegram/tma-session.ts` (customer rail — explicitly NOT reused here), `app/auth/pay-handoff/route.ts` (in-repo session-minting precedent)

## Context

ADR 0005 ships merchant register with Google (`linkIdentity`) and email OTP (`updateUser` + `verifyOtp`). Telegram — the channel our merchants live in — is the gap, moved off the launch critical path as a fast-follow. The constraints, fixed at the 2026-06-10 eng review:

- **Supabase has no Telegram auth provider.** `linkIdentity()` cannot link a Telegram identity; there is no provider enum for it.
- **The shipped TMA rail cannot carry merchant auth.** `tma-session.ts` mints **customer-grade** ES256 JWTs with synthetic `uuidv5("tg:<id>")` subs — no `auth.users` row, no refresh token, no GoTrue session. The merchant dashboard runs entirely on `@supabase/ssr` cookie sessions refreshed in `proxy.ts`; the wedge invariant (ADR 0005 §1) is enforced by DB guards reading the **`is_anonymous` JWT claim**. A merchant session must therefore be a *real GoTrue session* for a *real `auth.users` row*.
- The bridge must serve **three legs**:
  1. **Register at Publish** — attach the verified Telegram identity to the *current anonymous* `auth.users` row, preserving `auth.uid()` so the draft shop survives (the same uid-preserving contract the Google/email legs honor).
  2. **Returning merchant sign-in** — a new device with no session must reach the existing account.
  3. **Identity collision** — Telegram identity already belongs to another user → compose with the `claim_draft_shop_initiate`/`_complete` possession-proof RPCs (migration `20260610071000`).
- Manual identity linking (`security_manual_linking_enabled`) is already enabled on both Supabase projects (prod `hlmcoirjaydrfqcmnuun`, dev `hpbguvxcqyppgyinzmus`).

### Verified facts the decision stands on

Every load-bearing claim below was verified 2026-06-10 against the `supabase/auth` (GoTrue) master source, the live Supabase docs, and Telegram's docs — not from memory. The four that decide the architecture:

| # | Fact | Source |
|---|------|--------|
| F1 | `admin.updateUserById(uid, { email, email_confirm: true })` on an anonymous user **creates an email identity and flips `is_anonymous` to false** in the same call (`admin.go` L217–251). No SQL touch of the `auth` schema needed. | GoTrue source |
| F2 | **No admin session-minting/impersonation endpoint exists** (full route table checked). The only sanctioned server-side session mint for an arbitrary user is `admin.generateLink({ type: 'magiclink' })` → `verifyOtp({ token_hash })`, which issues a full access+refresh session and works with the `@supabase/ssr` cookie client. Already proven in-repo by `app/auth/pay-handoff/route.ts`. | GoTrue source + in-repo |
| F3 | `admin.createUser` **requires email or phone** (hard 400 otherwise) — a Telegram-only user needs a synthetic email. `generateLink(magiclink)` for an email that belongs to **no** user silently degrades to a `signup` link that would create a new user — the sign-in leg must resolve the uid first and read the email **off the user record**, never recompute it. | GoTrue source |
| F4 | The `is_anonymous` JWT claim is **re-derived from the user row at every token refresh** (`tokens/service.go` L713), so F1's flip becomes effective with one `refreshSession()` — same uid, same refresh-token family, now non-anonymous. The DB guards (`guard_anon_go_live`, `publish_shop`) pass without modification. | GoTrue source |

Two more that close doors: writing to `auth.users`/`auth.identities` via SQL is officially unsupported (breaks Auth-server migrations); and **no admin API can attach an OAuth-style identity** to a user (the manual-linking flag gates only the user-facing redirect flow) — so Telegram identity provenance must live in `app_metadata` plus a lookup table we own.

### Telegram-side verification primitive

The **Login Widget** (`telegram-widget.js`, `data-onauth` callback mode) delivers `{ id, first_name, last_name?, username?, photo_url?, auth_date, hash }`. Verification: `secret_key = SHA256(bot_token)`; `hash == hex(HMAC_SHA256(data_check_string, secret_key))` where `data_check_string` is all received fields except `hash`, sorted, joined as `key=<value>` lines. **This is a different key derivation than Mini App initData** (`HMAC_SHA256(key="WebAppData", msg=bot_token)`, the `init-data.ts` validator) — the widget needs a sibling validator, not reuse. The widget requires `/setdomain` on @BotFather for the serving domain (per-environment bots, as KRA-66 already assumes).

Telegram has since moved the widget docs to "legacy" and stood up a real OIDC issuer (`oauth.telegram.org`) — relevant to Approach C below.

## Approaches compared

### A — Admin-API user provisioning + custom session minting (rejected)

Provision `auth.users` rows via `admin.createUser`, then mint our own ES256 session JWTs (sub = real uid) under the third-party issuer the TMA rail already registers.

- **Fails the dashboard session model.** `createClient(url, key, { accessToken })` — the supported third-party-token client mode — replaces `supabase.auth` with a Proxy that *throws on any access* (verified in supabase-js source). It is structurally incompatible with `@supabase/ssr` cookie sessions, `proxy.ts` refresh, and every GoTrue user endpoint (`updateUser`, `linkIdentity` — i.e. a Telegram merchant could never later add Google or a real email). We would run two parallel merchant session rails forever: our own refresh cookie, our own re-mint loop, our own revocation.
- **Fails the uid-preserving register leg.** A custom-minted session is for a *new* sub; the draft org belongs to the anon uid. Every register would detour through the claim handshake — ownership re-pointing on the happy path, not just the collision path.
- **Weakens the wedge invariant.** Custom JWTs carry no `is_anonymous` claim; the guards `coalesce(...,false)` it to "allowed". Our signing key would become a second key that can pass the publish gates — a standing security liability the DB guards were designed to avoid.
- The variant "forge GoTrue-session JWTs with the legacy HS256 secret" is worse: projects are migrating to asymmetric signing keys, and forged access tokens have no session/refresh rows behind them.

**Verdict: rejected.** Custom minting is the right tool for *customer*-grade stateless sessions (TMA) and the wrong tool for merchant accounts.

### B — Verified-payload → app_metadata attachment + native session minting (chosen)

No custom JWTs anywhere. The bridge is three server-side moves on existing rails:

1. **Verify** the Login Widget payload (HMAC, freshness) in a new `lib/telegram/login-widget.ts` validator — trust established exactly where `tma-session.ts` establishes it for initData.
2. **Attach (register leg, uid preserved):** `admin.updateUserById(anonUid, { email: synthetic, email_confirm: true, app_metadata: { telegram: {...} } })` — by **F1** this flips `is_anonymous` and creates the email identity on the *same* user row; the draft shop never moves. One `refreshSession()` on the cookie client (**F4**) and `publish_shop` + trigger guards pass unchanged. A `public.telegram_merchant_identities` lookup table (service-role-only) records `telegram_user_id → user_id`; its unique constraints are the collision arbiter.
3. **Mint (sign-in leg, new device):** resolve uid from the lookup table → fetch the user's **current** email via `admin.getUserById` (**F3**: never recompute) → `admin.generateLink({ type: 'magiclink', email })` → redeem `verifyOtp({ token_hash, type: 'magiclink' })` **server-side on the cookie client in the same request** — the token_hash never leaves the server (tighter than the pay-handoff precedent, which round-trips it through a redirect URL). Result: a first-class GoTrue cookie session, refresh tokens and all.

The collision leg composes with the claim RPCs *better* than the email leg does: because both the anonymous session and the new registered session live in the same server-side cookie jar sequentially, one server action can do *initiate-claim (as anon) → mint session for the existing account → complete-claim (as registered)* in a single round trip. One Telegram tap, no sessionStorage hand-off, no OAuth-style resume machinery (the widget's `data-onauth` mode never navigates away — the publish dialog's state survives, unlike the Google leg).

**Synthetic emails** (F3 forces them): `tg-<telegram_id>-<random8>@<TELEGRAM_LOGIN_EMAIL_DOMAIN>`, generated once at attach/provision time, stored only on the user record. The domain is one we control with a null-MX policy (RFC 7505) so nothing routes; the random suffix kills enumeration (an attacker who knows a victim's Telegram id cannot derive the address, so cannot trigger OTP sends/bounces or probe `email_exists`). If the merchant later sets a real email in settings, the lookup table still resolves the uid and the sign-in leg reads whatever email the record carries — the synthetic address is an implementation detail, hidden in UI wherever the account email is displayed.

**Verdict: chosen.** Every primitive is source-verified or already in production in this repo; zero new trust roots; zero unsupported writes; the uid-preserving leg works; and the bridge's core (`verified Telegram user → attached/minted GoTrue account`) is exactly what ADR 0005 Phase 4 (merchant onboarding *inside* Telegram) needs — fed by the initData validator instead of the widget validator. One bridge, two front doors.

### C — Telegram OIDC × Supabase custom OIDC providers (tracked alternative, not now)

Since the eng review, two things shipped upstream: Telegram's OIDC issuer (`oauth.telegram.org`, RS256/ES256, BotFather "Web Login" client credentials) and Supabase **custom OAuth/OIDC providers** (`signInWithOAuth({ provider: 'custom:telegram' })`, with an `email_optional` flag for providers that return no email). This would give first-class `auth.identities` rows and native sessions with zero custom crypto.

Why not now:

- **It breaks the register leg.** GoTrue's `linkIdentityToUser` flips `is_anonymous` only when the linked provider supplies a *verified email* (`identity.go` L156–160). Telegram's OIDC returns none — the linked user *stays anonymous in the JWT* and the publish gates correctly reject them. Fixing that requires… the Approach-B admin email grant anyway. The clean leg (sign-in) is the cheap one; the hard leg (uid-preserving register) is unsolved.
- **It does not cover Mini App initData** — Phase 4 would still need Approach B's bridge.
- Both upstream features are weeks-old (custom providers GA'd recently; Telegram Web Login is brand new with known claim gaps, e.g. `phone_number` not propagating). Wrong foundation for an auth path during launch.

**Tracked:** when both mature, the *sign-in* leg can migrate to `custom:telegram` with no data migration — the lookup table and `app_metadata.telegram` stay authoritative, identities backfill additively. Revisit post-launch.

## Decision — the bridge in detail

### Surfaces

- **Publish dialog, register step:** "Continue with Telegram" joins Google + email. Inline `data-onauth` widget → payload → one server action → dialog proceeds to `publish_shop` without ever navigating away.
- **/login:** Telegram button beside Google/email for returning merchants (renders only when `TELEGRAM_BOT_USERNAME` is configured; username passed as a server-component prop, the established pattern).
- An unknown Telegram identity at /login **provisions a fresh real user** (`admin.createUser` with synthetic email, `email_confirm: true`, `app_metadata.telegram`) and signs them in — the "mint a real GoTrue user for fresh sign-ins" half of the constraint. A shopless registered user lands in the standard wizard; `create_draft_shop` works for non-anonymous callers unchanged.

### Data

```sql
CREATE TABLE public.telegram_merchant_identities (
  telegram_user_id text PRIMARY KEY,           -- numeric id as text (matches commerce.customers convention)
  user_id          uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username         text,
  first_name       text,
  photo_url        text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- RLS enabled, NO policies: service-role access only. PK + UNIQUE(user_id)
-- are the collision arbiters (one Telegram identity per user, one user per
-- Telegram identity, v1 — mirrors linkIdentity semantics).
```

`app_metadata.telegram = { id, username, first_name, attached_at }` is the per-user record (admin-only writable — `user_metadata` would be user-forgeable); the table is the reverse index GoTrue can't give us (no identity-attach admin API).

### Order of operations (register leg)

1. Verify payload HMAC + freshness (≤10 min, 60s future skew).
2. `INSERT` lookup row for the **current anon uid** — a `23505` here *is* the collision signal, race-free.
3. `admin.updateUserById` (F1). On failure: compensating `DELETE` of the lookup row, surface the error. A crash between 2 and 3 leaves a dangling row; the sign-in leg self-repairs it (below).
4. Server-side `refreshSession()` on the cookie client (F4) → caller proceeds to `publish_shop`.

Collision path (row exists for another uid): same action continues — `claim_draft_shop_initiate()` as the still-anon session → mint session for the existing account (sign-in leg) → `claim_draft_shop_complete(code)` as the registered session → return; the dialog proceeds to publish with the claimed draft.

**Self-repair (sign-in leg):** after resolving the uid, if `admin.getUserById` shows no email (the step-3 crash case), attach the synthetic email then proceed to `generateLink`. Never `generateLink` an email that isn't already on a user (F3's signup-degradation trap).

## Security analysis

**Trust establishment.** The Telegram user id enters the system from exactly one place: an HMAC-verified widget payload, validated server-side with a constant-time compare against `SHA256(TELEGRAM_BOT_TOKEN)` — the same posture as `tma-session.ts` (never trust a client-supplied id field). The payload travels client→server once, over a same-origin Next server action (Next validates Origin/Host on actions — CSRF covered); it is never logged.

**Replay window.** A widget payload is a bearer credential for its `auth_date` window. We bound it to **10 minutes** (the flow consumes it within seconds; the window is clock-skew headroom). We deliberately do *not* add single-use nonce storage in v1: every capture vector for a stale payload (XSS, hostile extension, TLS break) equally yields fresh payloads, so a consumed-hash table adds state without adding a security boundary. Recorded as an accepted tradeoff; revisit if payloads ever transit anything but the in-page callback.

**Wedge invariant (ADR 0005 §1) preserved exactly.** No guard, RPC, or policy changes. The anon→registered transition happens *inside GoTrue* (F1), the claim is re-derived on refresh (F4), and `publish_shop` + `guard_anon_go_live` keep enforcing `is_anonymous` at the DB. Approach B introduces **no second key** that can pass the gates — rejected Approach A's main liability.

**Session minting containment.** `generateLink`/`verifyOtp(token_hash)` both execute within one server request; the token_hash is never serialized into a URL, cookie, or response (tighter than the pay-handoff precedent). The magiclink token is single-use and expiry-bound by GoTrue (`Mailer.OtpExp`, 1h default). The minting endpoint is driven only by a *verified* Telegram payload — the service-role key can mint a session for anyone, but the code path only does so for the uid the lookup table maps the verified id to.

**Synthetic email threat model.** Addresses are unguessable (random suffix), unroutable (null-MX domain), and never shown in UI. An attacker cannot: derive them (no enumeration), receive OTP at them (no MX), or pre-register them (`shouldCreateUser` signups still require receiving the OTP). GoTrue still treats them as real emails — so account-recovery emails would route nowhere by design: Telegram re-auth *is* the recovery path, which is the correct trust anchor for a Telegram-native account. Merchants who add a real email in settings upgrade their recovery story; the lookup table keeps Telegram sign-in working regardless (email read from the user record, F3).

**Collision/claim.** Unchanged possession-proof model: the 30-minute claim code minted by the anon owner is the only thing that authorizes ownership transfer, and the registered claimer must hold it. Running initiate→sign-in→complete inside one server action *narrows* exposure: the code never reaches the browser at all on the Telegram path.

**Bot token.** Reused from KRA-66 (per-environment bots; `/setdomain` per environment). Rotation invalidates in-flight payloads only — identities key off the Telegram numeric id, not the token. The token already had notification-send power; it now also anchors login verification, which raises its sensitivity one notch (compromise = forgeable logins until rotation) — worth a line in the ops runbook, not a design change.

**Rate limiting / abuse.** The /login action is unauthenticated by nature. HMAC verification is sub-millisecond and rejects garbage before any DB or GoTrue call; provisioning is bounded by real Telegram accounts (Telegram is the rate limiter / CAPTCHA). Vercel-level protection (WAF/BotID) is available if probing shows up; no bespoke limiter in v1.

**Privacy.** We store id, username, first name, photo URL — what the merchant explicitly shared by tapping the widget. No phone (Telegram doesn't give the widget one).

## Test plan

- **Vitest** — `login-widget.test.ts`: golden-vector HMAC pass, tampered field, missing/extra field handling (check-string from *received* fields), expired `auth_date`, future skew, constant-time path. Mirrors `init-data` validator coverage.
- **SQL probes** (no container runtime on this Mac — behavioral DO-block verification via MCP `execute_sql`, per the established workflow): lookup-table uniqueness both ways; cascade on user delete; RLS denies non-service access.
- **E2E (Playwright)** — `telegram-login.spec.ts`: the widget iframe can't be automated, but the *bridge* can — the spec signs a payload with the dev `TELEGRAM_BOT_TOKEN` (same env the dev server reads) and invokes the page's `onTelegramAuth` callback directly: register-at-publish → live storefront; returning sign-in on a cleared context → dashboard. Self-skips when the env isn't configured, same pattern as the inbucket specs.
- **Manual QA** (mobile + desktop): the real widget round-trip on the dev domain, collision path with a second Telegram account.

## Implementation map

| Piece | Where |
|---|---|
| Migration: `telegram_merchant_identities` | `supabase/migrations/20260610090000_kra46_telegram_merchant_identities.sql` |
| Widget payload validator | `apps/krafta/lib/telegram/login-widget.ts` (+ test) |
| Bridge core (attach / mint / provision / self-repair) | `apps/krafta/lib/auth/telegram-bridge.ts` (`server-only`) |
| /login server action | `apps/krafta/lib/auth/telegram-actions.ts` |
| Publish register action (attach + auto-claim) | `publish-actions.ts` (new `registerPublishTelegram`) |
| Widget embed component | `apps/krafta/components/telegram-login-button.tsx` |
| UI wiring | `publish-dialog.tsx` (Telegram leg), `login-form.tsx` + `app/login/page.tsx` (button + bot-username prop) |
| Env | reuse `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`; new `TELEGRAM_LOGIN_EMAIL_DOMAIN` |

## Non-goals (v1)

Unlink/relink UI; multiple Telegram identities per user; migrating the sign-in leg to `custom:telegram` OIDC (tracked, Approach C); merchant onboarding inside Telegram (Phase 4 — consumes this bridge, separate issue); bring-your-own-bot login (login always rides the platform bot, independent of the S2 notification-bot upgrade); single-use payload nonces (accepted tradeoff, see security analysis); CAPTCHA/rate limiter beyond platform defaults.

## Consequences

**Good:** Telegram-native merchants register and return without ever owning an email; the draft-survival contract holds on all three legs; zero new trust roots, zero unsupported auth-schema writes, zero session rails — everything rides GoTrue + existing claim RPCs; the bridge core is the Phase 4 foundation. **Costs:** synthetic emails are a permanent quirk of Telegram-only accounts (hidden in UI, recovery = Telegram re-auth); a service-role-only lookup table shadows what `auth.identities` would ideally hold (backfillable if Approach C matures); the Login Widget is now "legacy" in Telegram's docs — deprecation risk is real but shallow (the validator is ~60 lines; the OIDC successor is the documented migration path).
