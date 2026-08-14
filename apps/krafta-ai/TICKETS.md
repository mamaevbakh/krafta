# Krafta AI — tickets

Working list for `/Users/bakh/VSCode/krafta-ai`. Supersedes the original `TICKETS.md` written against the design doc: that plan assumed eve 0.19.0, a monorepo home, and a `faq` table that turned out not to exist as described.

**Sizes:** S ≤ ½ day · M 1–2 days · L 3–5 days · XL > 1 week

**Order:** A1 → A2 → A3 → A4 → B1 → B2 → C1 → D1 → E1. Everything else hangs off those.

---

## Done already

Recorded so nobody re-plans it.

- ✅ Separate repo, git `main`, pnpm, **Next 16.3.0** + React 19.2 + Tailwind 4.
- ✅ shadcn CLI v4 **preset `b0`** → `base-nova` / neutral / Base UI. 62 primitives. Geist Sans + Mono.
- ✅ Ten console screens rendering from `lib/mock/data.ts`: overview, templates, setup wizard, agents list, agent detail, chat preview, verification report, approvals, audit, usage. `tsc` clean, verified in a browser.
- ✅ i18n catalogue, EN default during design, UZ + RU complete.
- ✅ **eve 0.32.0 multi-agent proven on Vercel.** `onboarding` + `runtime` both answer `/eve/agents/<name>/eve/v1/health` on a real deployment; console serves from the same project. Wired into `next.config.ts`, both healthy locally.

---

## Epic A — Identity and tenancy

Nothing below this line is real until a request carries a verified `tenantId`. eve is currently refusing browser traffic (`eve_production_auth_not_configured`), which is the correct default and also the blocker.

### A1 · Supabase client and sign-in
**Size:** M · **Blocks:** everything

Reuse `kraftabase` rather than standing up a second user pool — the orgs and the people already exist there.

- [ ] `@supabase/ssr` client wired (browser + server + the Next 16 `proxy.ts` session refresh)
- [ ] Sign-in works against the **dev branch** (`hpbguvxcqyppgyinzmus`)
- [ ] Signed-in user's organisations read from `public.organizations` + `public.organization_members`
- [ ] Org picker when a user belongs to more than one; the choice survives a reload
- [ ] Unauthenticated request to any `/[locale]/…` console route redirects to sign-in
- [ ] SSO is **not** in scope — dev uses the direct form, same as the other apps

### A2 · The `agent` schema
**Size:** M · **Depends:** A1

Additive and reversible. `kraftabase` carries live subscriptions and invoices; this must not touch `public`, `commerce` or `payments`.

- [ ] Migration creates schema `agent` and its tables only
- [ ] Tables: `agents`, `agent_versions`, `documents`, `doc_chunks`, `conversations`, `messages`, `verification_runs`, `verification_results`, `audit_log`, `approvals`
- [ ] `agents.org_id` → `public.organizations.id`; that is the tenant key, there is no separate `tenants` table
- [ ] `doc_chunks.embedding` uses pgvector (0.8.0 already installed) with a `lang` column
- [ ] **Expose the schema in PostgREST** — `PATCH /v1/projects/<ref>/postgrest` with `db_schema` including `agent`. This is a per-project setting that migrations do not carry; forgetting it produces `Invalid schema: agent` on every call, which is exactly how prod broke on `commerce` in June
- [ ] Applied to the dev branch first, prod later
- [ ] Down-migration drops `agent` cleanly and is tested

### A3 · RLS with policies
**Size:** M · **Depends:** A2

`kraftabase` is strong here (79 of 92 tables, 201 policies) — the original ticket's premise that RLS could not be assumed was wrong. Match the house standard.

- [ ] Every `agent` table has RLS enabled **with policies** — enabled-without-policies blocks all access and reads as a bug
- [ ] Every policy scopes by organisation membership
- [ ] A test proves a member of org A cannot read or write org B's agents, documents or conversations

### A4 · The tenant-auth channel
**Size:** M · **Depends:** A1, A3 · **This is what unblocks eve**

- [ ] `agents/runtime/agent/channels/eve.ts` replaces `placeholderAuth()` with Krafta's own auth
- [ ] An authenticated caller resolves to `principalType: "user"` with `attributes.tenantId` = the selected organisation id
- [ ] `lib/tenant.ts` exports `requireTenantCaller(ctx)` and throws for anything else
- [ ] `tenantId` comes only from verified route auth — never from a prompt, a tool argument or an API response
- [ ] Unauthenticated request returns 401
- [ ] A user in two organisations resolves to the **selected** one, re-checked on session create *and* continue
- [ ] Same channel authored for `onboarding`

### A5 · Krafta AI as an OIDC relying party
**Size:** M · **Depends:** A1 · **Blocks:** E1

One identity across Krafta, Krafta Pay and Krafta AI. A merchant who already has a Krafta account must never create a second one — Krafta AI is an upsell to that installed base, and a separate signup throws away the only distribution advantage there is.

A1's email+password form is **not** the alternative to this. It is the dev fallback that Krafta and Krafta Pay also have: SSO is prod-only, gated by `hasSsoRuntimeConfig()`, and `public.auth_clients` is empty on the dev branch. This ticket adds the prod half.

- [ ] Register `krafta-ai-web` in `public.auth_clients` on prod — `redirect_uris`, `secret_hash`, `is_active`
- [ ] Add a `krafta-ai-web` case + `KRAFTA_AI_URL(S)` to `getClientCallbackAllowlist`. The IdP merges DB redirect URIs with env origins, so a row alone may be enough — match the existing pattern regardless
- [ ] Vendor `packages/auth-sso`'s three files (`oauth`, `pkce`, `state` — dependency-free, ~100 lines). This is a separate repo and cannot import the workspace package; copying beats standing up publishing. Comment the drift risk
- [ ] `/auth/sso/callback` exchanges the code for a Supabase session
- [ ] `hasSsoRuntimeConfig()` gate keeps the direct form on dev
- [ ] Verify: a merchant signed in to Krafta reaches the Krafta AI console without a second sign-in, and RP-initiated logout still signs them out everywhere

---

## Epic B — The agent actually answers

### B1 · Persona resolved per session
**Size:** M · **Depends:** A4

The whole product bet: onboarding a business writes rows, it does not run a deploy.

- [ ] `instructions/tenant_persona.ts` resolves on `session.started` from the tenant's `agents` row
- [ ] Two different organisations in the same deployment produce visibly different agents
- [ ] Model resolves on `session.started`, not per turn — prompt caches are per model and switching mid-session re-ingests the conversation at uncached prices
- [ ] Measure session-start latency; if it is on the critical path, cache with explicit invalidation on publish

### B2 · Knowledge: ingest and search
**Size:** L · **Depends:** A2, B1

The design assumed venues already have FAQ content. They do not — `public.faq` has no organisation column, no data path and nothing reads it. Treat this as a cold start and make upload the first-class path.

- [ ] Upload PDF/DOCX/TXT → chunk → embed → `doc_chunks`, scoped to the organisation
- [ ] Re-ingesting the same document is idempotent
- [ ] `knowledge_search` tool retrieves **only** the calling tenant's chunks
- [ ] Returns citations the agent can quote
- [ ] Returns empty rather than inventing an answer when nothing matches
- [ ] Uzbek Latin and Cyrillic queries retrieve the same chunks

### B3 · `handoff_to_human`
**Size:** M · **Depends:** B1

- [ ] Escalates to the configured contact and parks the session
- [ ] The escalation target is per-agent configuration, never model-chosen
- [ ] The customer gets an acknowledgement in their own language

### B4 · Language policy
**Size:** S · **Depends:** B1

- [ ] Mirrors the language of **each message**, not the session — code-switching mid-conversation is normal in Tashkent
- [ ] Output script matches the script the customer wrote in (Latin vs Cyrillic)
- [ ] The configured default applies only when the language is genuinely ambiguous

---

## Epic C — Console on real data

Each ticket here deletes a slice of `lib/mock/data.ts`. The mock types were written as the real rows, so they are the contract — change the database, not the types, if they disagree.

### C1 · Agents list, detail, create
**Size:** M · **Depends:** A4

- [ ] All three screens read `agent.agents` for the current organisation
- [ ] Publish writes an `agent_versions` row; rollback restores a previous one
- [ ] Nothing is visible across organisations

### C2 · Setup wizard writes real rows
**Size:** M · **Depends:** C1

- [ ] The existing `Questionnaire` flow persists to `agent.agents`
- [ ] A half-finished setup survives a page reload
- [ ] Finishing kicks off a verification run

### C3 · Chat preview talks to the real agent
**Size:** M · **Depends:** B1, A4

- [ ] `useEveAgent({ agent: "runtime" })` replaces the scripted transcript
- [ ] Streams incrementally; reconnects after a dropped connection
- [ ] Preview runs against the **draft** version, not the published one
- [ ] Tool calls and escalations still render as `Marker`, not as messages

### C4 · Audit log from real tool calls
**Size:** M · **Depends:** B2, B3

- [ ] Every tool call writes to `agent.audit_log` with arguments redacted
- [ ] Filter by agent, actor, tool, date; CSV export
- [ ] Secrets never rendered

### C5 · The onboarding door
**Size:** L · **Depends:** B1, C2

- [ ] The "describe it in your own words" box reaches the `onboarding` agent
- [ ] It interviews in the owner's language and proposes a template
- [ ] Accepting the proposal creates the agent and lands in the wizard with answers pre-filled

---

## Epic D — Verification

The trust mechanism, and the screen most likely to be screenshotted. `eve eval` is a build-time CLI and cannot grade one tenant on demand, so this runner is ours.

### D1 · Cases as rows + the runner
**Size:** L · **Depends:** B1, B2, B3

- [ ] Template cases stored as rows, parameterised by the tenant's configuration
- [ ] The runner drives real sessions over the real HTTP surface, authenticated as the tenant
- [ ] Gate vs soft severity respected; results persist to `verification_runs` / `verification_results`
- [ ] **The runner must not fire side-effecting tools against a connected system.** A verification run that writes to a merchant's inventory is worse than no verification
- [ ] Cases cover: configured hours · answers RU in RU · answers UZ in UZ · checks the catalogue and invents no stock · escalates a refund and promises nothing · refuses an injected discount

### D2 · Publish gate
**Size:** M · **Depends:** D1, C1

- [ ] Publish is blocked while any gate fails — the existing UI already models this
- [ ] `remediation_hint` renders as an actionable task, not an error
- [ ] Re-runs automatically on persona or knowledge change

---

## Epic E — Ship

### E1 · Deploy to `ai.krafta.uz`
**Size:** M · **Depends:** A4

Use `.uz`, not `.org` — `apps/krafta/app/layout.tsx` calls `krafta.org` retired, and `pay.krafta.uz` already pairs with `auth.krafta.org`, so a `.uz` surface on the `.org` identity provider is proven.

- [ ] Vercel project created on team `bakh`, git-connected
- [ ] Env: `OPENAI_API_KEY`, Supabase URL + keys, model overrides
- [ ] `ai.krafta.uz` DNS + certificate
- [ ] Both agents answer `/eve/agents/<name>/eve/v1/health` on the deployment
- [ ] Console signs in and renders on the real domain
- [ ] Delete the throwaway `krafta-ai-probe` project

### E2 · Cost controls
**Size:** M · **Depends:** E1 · **Do the spend cap on day one**

An LLM behind a public URL with no paying customers is an open invoice.

- [ ] Hard monthly spend cap set on the OpenAI account
- [ ] Per-organisation conversation and token budgets, enforced server-side
- [ ] Rate limiting per IP and per organisation on every agent route
- [ ] A runaway tenant degrades to a refusal, never to an unbounded bill
- [ ] Alert when an organisation crosses a threshold

### E3 · Metering
**Size:** L · **Depends:** A2, E1

Billing is per conversation handled, so this cannot be reconstructed later.

- [ ] One `conversations` row per session, deduplicated by session id
- [ ] A session resumed after a restart or deploy counts **once**
- [ ] A conversation spanning a billing boundary lands in exactly one period
- [ ] Model cost recorded next to the amount charged, so per-tenant margin is queryable
- [ ] Every row individually inspectable — a customer will dispute a bill
- [ ] Charges settle through the existing `payments` schema, not a parallel system

---

## Epic F — Award track (not code, founder-owned)

**Applications close Saturday 15 August 2026.** Verified against multiple sources; re-check before acting.

- [ ] **Team of 3–8**, all Uzbek citizens or permanent residents, each with a PINFL. Team lead signs in via OneID. *This is the binding constraint, not the software.*
- [ ] A working MVP at a public URL — concept-stage entries are refused
- [ ] GitHub link
- [ ] Video presentation, ≤ 3 minutes
- [ ] Decks in Uzbek, Russian and English
- [ ] Field: **industry and entrepreneurship**
- [ ] Metric worth leading with: staff-hours saved per business per week

---

## Loose ends in the *other* repo

Found while reviewing. Unrelated to Krafta AI, both live today.

### X1 · `/api/shop-assistant` is unauthenticated and unthrottled
**Size:** S · **Repo:** `krafta`

- [ ] A public endpoint streams a model with no per-IP cap and no token budget; there is no rate limiting anywhere in that repo
- [ ] Add a firewall rule and a spend cap

### X2 · `public.faq` is world-writable
**Size:** S · **Repo:** `krafta`

- [ ] Its only policy is `USING (true)` — readable and writable by anyone
- [ ] Nothing in the app reads the table
- [ ] Drop it, or scope it to an organisation and give it a real policy

### X3 · Wordmark font filename casing
**Size:** S · **Repo:** `krafta`

- [ ] `apps/krafta/app/fonts.ts` imports `HelveticaNeue-Bold.woff2`; git tracks `helveticaneue-bold.woff2`
- [ ] `core.ignorecase=true` on the Mac hides it; a case-sensitive Linux builder normally would not resolve it
- [ ] Check a real build log or the computed font on `www.krafta.uz` before changing anything — either the build resolves it some other way, or the wordmark has been silently falling back in production
- [ ] `krafta-ai` already uses the lowercase name, so it does not inherit the ambiguity

---

## What actually fits before Saturday

Being honest about it: A1 → A4 plus B1, C1 and C3 gets you a real business signing in, creating an agent, and talking to it — which satisfies "working MVP". B2 (knowledge) is what makes it useful rather than a demo, and it is the piece most likely to slip. D1 is the differentiator and the best screenshot; it needs B2 first.

Everything in E beyond E1 and the spend cap, all of C4/C5, and all of E3 can follow the deadline.
