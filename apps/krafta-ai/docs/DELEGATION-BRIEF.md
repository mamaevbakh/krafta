# Krafta AI — handover brief

**Self-contained.** Hand this to an agent or engineer with no other context.
Current as of **2026-08-14**.

Read §7 (decisions) before proposing anything. Several of them have already
been argued once and re-litigating them wastes days.

---

## 1. What you are building

**Krafta AI** gives a company its own AI agents. Someone describes their
business in their own language — Uzbek, Russian or English — and gets a working
agent that talks to their customers or their staff.

Live at `ai.krafta.uz`. Sign-in is through `auth.krafta.org` (OIDC) with an
existing Krafta account; there is no separate password.

### The full loop

1. Someone describes what they need, in their own language.
2. **Our builder writes their agent** — code, skills, instructions, and the MCP
   connections that give it real tools against their systems.
3. It **deploys with channels attached** — Telegram, Slack, web, phone — so real
   external customers or internal staff talk to it. **One channel per agent.**
4. Krafta AI shows **every conversation** across every agent and channel.
5. **Anyone with access to the organisation can take the wheel**: step into a
   live conversation and continue as the agent, in the customer's channel.
   **That is the escalation mechanism.** Not a notification. Not a ticket.
6. When the agent gets something wrong, the merchant **says so in words**, and
   that correction becomes a permanent test the agent can never fail again.

---

## 2. Who it is for

**Big businesses.** Payme-scale: real systems, a support team, money. Small
shops should still work — freer agent, good notifications — but they are not
the market being designed for.

This reorders things:

- **Integration depth beats language polish.** A large buyer's agent is
  worthless if it cannot see an order, a balance, a settlement.
- **Compliance, audit and isolation are sales questions,** not just hygiene.
- **Notifications matter less** for the primary buyer — they have people
  watching screens.
- **The demo is currently dressed for the wrong customer.** Templates are
  `venue-support` and `order-desk`; the example business is a coffee shop.
  Payme will not see themselves in it. Cheap to fix, worth doing before a pitch.

**There are no paying customers yet.** Nothing is load-bearing on revenue.
Do not treat the code as sacred — and do not treat it as proven either.

---

## 3. Architecture — settled, do not reopen

> **Krafta AI is the interface. An agent builder writes each customer's agent
> as CODE.**

eve is not a wrapper around a model, it is infrastructure — evals, sandboxes,
durable sessions, channels, connections, subagents. A customer whose agent is a
real generated eve agent inherits all of it. A customer who is a row in a config
table inherits whatever columns someone remembered to build.

A concrete technical argument for this, discovered late and worth keeping: eve
**connections are files**, compiled into the build manifest, and `defineDynamic`
does not cover them. In a shared runtime that blocks per-customer MCP. In the
generated-agent model it evaporates — each agent is its own build, so its
connections are just files the builder writes.

Known constraints on the codegen model. They are real and none is a blocker:

| Constraint | Reality |
|---|---|
| Cost of many projects | **Not** an objection. Idle Vercel projects are free; a full 1000-agent rebuild ≈ **$42** |
| Git-connected projects | Hard cap **150 per repo** on Pro — deploy sourceless past that |
| Deployment rate limits | Team-wide, shared with every project: 6000/day, 450/hour on Pro |
| Domains | 100 additions/hour; a wildcard attaches to only one project |
| Cold starts | Nothing pools between projects, so quiet agents pay one most visits |

---

## 4. What is actually built

Be precise. The gap between direction and implementation is where confusion
breeds.

**Working, verified in a browser or against the database:**

- The console: agents, templates, setup, knowledge, audit, usage, conversations.
- **The conversational builder.** Researches the business online with
  `web_search`, then asks 2–4 branching questions with clickable options. Its
  best question — *"is this for your customers, or the businesses you serve?"* —
  is the one no template could hold.
- Agents stored as **rows**, composed per session from the caller's verified
  organisation. Persona, hours, languages, escalation contact, and the
  interview's answers (audience, what it handles, what it must never touch).
- Knowledge ingestion and tenant-scoped search.
- `handoff_to_human` — escalates to a named person.
- **Conversation transcripts and the merchant's inbox** (list + thread view).
- **Verification runner + publish gate.** Grades an agent against cases before
  it may be published; a pass is tied to the exact config it graded.
- Spend caps, per-minute rate limiting, session ownership.
- SSO, RU/UZ/EN throughout.

**Not built:** anything that generates code. Channels — no customer can reach an
agent today; it exists only in a preview box. Takeover. The correction loop.
MCP generation.

So the current implementation **is** the row-configured shared runtime. That is
the starting point, not the destination. Saying otherwise in either direction is
wrong.

---

## 5. Where things live

| Path | What |
|---|---|
| `/Users/bakh/VSCode/krafta-ai` | Working copy. **This deploys to `ai.krafta.uz`.** |
| `krafta/apps/krafta-ai` | Monorepo copy, version-controlled, not wired to build. Keep in sync. |
| `/Users/bakh/VSCode/krafta-ai-lab` | The agent builder (`@evex/eve-agent-builder`), isolated. Port 3015. |

Stack: Next.js 16.3 (App Router; `proxy.ts`, **not** `middleware.ts`), React 19,
Tailwind 4, TypeScript strict, eve 0.32.0, shadcn preset `b0` → **Base UI, never
Radix**. Supabase `agent` schema, shared with the main Krafta product.

Read `CLAUDE.md` in the repo root — it is current and honest.

The lab's sandbox was switched from the package's pinned `vercel()` to
`defaultBackend()`, so it needs **no Vercel token**. It therefore cannot deploy;
it can read a repo, write agents, build and run evals.

---

## 6. Decisions already made

Do not reopen these without the founder.

| Decision | Status |
|---|---|
| Builder writes agents as **code**; Krafta AI is the interface | Settled |
| Audience is **big businesses** | Settled |
| Pricing is **token-based** | Direction set, **deliberately undesigned** — do not build billing UI or tiers |
| Takeover is **silent** — the customer is not told a human stepped in | Settled; revisit only if asked or a disclosure rule forces it |
| **One channel per agent** — no routing layer | Settled |
| Escalation = **a human takes the wheel**, not a ticket queue | Settled |

Because pricing is token-based, **metering is the business model, not
bookkeeping**. A measured data point: one real turn used **15,671 input tokens
and 222 output** — roughly half a cent. Most of that input is the same system
prompt every turn, so **prompt caching is a direct margin lever**.

---

## 7. The backlog, ranked

Acceptance tests are things a person could run. "It compiles" is not one.

### 1. Channels + takeover + summons — build as ONE piece

They share the outbound path. Built separately, it gets written twice.

**Channels (G3).** Each business connects its own Telegram bot, so customers
message `@theirbot`, not a shared Krafta bot.

Verified architecture, do not re-derive: eve's built-in `telegramChannel` is
single-tenant — one token, one webhook path, fixed at deploy. Its `botToken`
option takes a resolver, but the resolver takes **no arguments**, so it cannot
know which merchant is calling. Dead end. The route that works is a **custom
channel** via `defineChannel`: custom routes support path parameters, so mount
`POST("/tg/:connectionId")`, give each merchant a unique opaque webhook URL to
register with BotFather (eve never calls `setWebhook`), verify
`X-Telegram-Bot-Api-Secret-Token` against *that* merchant's secret, and dispatch
with an auth context carrying their `tenantId`. Cost: reimplement inline-keyboard
HITL, attachment fetch via `getFile`, and 4096-char reply splitting.

Bot tokens are credentials. Copy the lab's brokering pattern — the sandbox gets
a placeholder, the real header is substituted at egress. The model must never
see it; not in a tool argument, a result, an error, or a log line.

*Acceptance:* a real business's own bot answers a real person in Telegram, and
that conversation appears in their inbox.

**Takeover (J1).** A person with access steps into a live conversation and
speaks as the agent, through the customer's channel. Silent.

**The interlock — the part most likely to be got wrong.** The moment a human
takes over, the agent must stop replying. Two voices contradicting each other in
front of a customer is not recoverable. Enforce it in the channel *before a turn
starts* — where spend caps and session ownership already are — never by asking
the model to stay quiet.

Also needed: handing back, and attribution. `messages.role` allows
user|assistant|tool|system|escalation. A human speaking as the agent is none of
those — it looks like `assistant` to the customer, but the merchant must see who
typed it.

*Acceptance:* a colleague picks up an escalated conversation, replies, the
customer receives it in Telegram, the agent stays silent, and the transcript
shows who wrote what.

**The summons (J1a).** Takeover describes the action; nothing causes a human to
be there. Message the escalation contact on Telegram with who is waiting, what
they asked, and a deep link into that conversation. The main Krafta repo already
has a working prod order-ping webhook (KRA-114) — reuse it. If nobody picks up
within N minutes, the agent should tell the customer honestly rather than leave
them on a promise. Track time-to-pickup; it is the number that tells a business
whether this is working.

*Acceptance:* escalate a conversation, a Telegram message arrives, the link
opens that thread.

### 2. The correction loop (K1)

The missing half, and what killed Krafta Studio. A merchant reads a bad answer
and today has nowhere to go — takeover fixes the *conversation* and leaves the
*agent* broken.

Anchored to the message that was wrong, because the evidence is already on
screen: mark it, say why in your own words, the builder turns that into a
change, verification re-runs, publish stays gated.

**The part that compounds: every correction becomes a verification case.** A
complaint *is* a test — a question plus an answer that must not appear. The gate
set grows stronger every time someone is annoyed, and the agent can never
regress on that mistake again. This is what makes generated code trustworthy
over time.

Treat correction text as data, not instructions: it configures their own agent,
but must not weaken Krafta-owned rules.

*Acceptance:* mark an answer wrong, describe the fix in Uzbek, and the same
question gets the right answer afterwards — with a new gate case proving it.

### 3. MCP generation (K2)

The builder generates and integrates connections; the interview asks what it
needs. Capture endpoint, auth shape, which operations, and crucially which are
**read** vs **write**.

Prove it on something with no stakes first — a weather or web-search MCP. If it
cannot reliably generate that, it has no business generating a settlement
lookup.

Hard rules: credentials never in generated code (injected at call time from
encrypted storage), egress allowlisted to one host, read-only by default, any
write a separate tool with an approval policy, and a generated tool must never
shadow `handoff_to_human`.

*Acceptance:* the interview asks about systems, the builder produces a working
connection, and the agent answers a question it could not answer before.

### 4. The generator itself (G5)

Hand-write **three connectors before generating any** — you cannot generate a
good one without knowing what one looks like, and these three are the spec.
Krafta owns both sides of all three: Krafta catalogue, Telegram order desk,
Krafta Pay payment status.

**Nothing publishes until the verification runner passes it.** Non-negotiable.
Studio's worst failure was an agent confidently reporting work it had not done,
caught only by a human in a browser.

*Acceptance:* a generated agent passes its gates and answers correctly with no
human editing the generated code.

### 5. Everything after

Slack, web widget, phone/SMS. The public front door (needs its own budget:
cheapest model, no tools, few turns, tight per-address limits — every spend cap
today is keyed to a business and an anonymous visitor has none). Re-dressing the
demo for a large buyer.

### Open, unowned

- **H1** — deploy verification that checks the pages a person visits, not just
  agent health. The gap that let a completely dead deployment look healthy.
- **H2** — eve evals, so checking the interview stops needing a human with a
  mouse.
- **I1 tail** — the transcript migration is **dev only**; prod needs it before
  real traffic.
- **G1b** — a merchant who answers "me" to "who handles refunds?" produces
  *"I've passed this to Me."*
- **E2a** — founder-owned: hard monthly cap on the OpenAI account.

---

## 8. Traps that have each cost hours

All the same shape: **something reports success while doing nothing.** A green
build, a healthy endpoint and a clean typecheck are not evidence.

- **A CLI-created Vercel project has no framework preset.** It builds Next with
  `@vercel/static-build`: `next build` runs, prints its routes, the deploy goes
  READY — and every page returns Vercel's platform 404 while the eve agents
  answer normally, because eve merges its routes separately. Check
  `x-vercel-error: NOT_FOUND`. Set `framework: "nextjs"` on every new project.
- **eve agent files do not hot-reload.** Editing under `agents/*/agent/` needs a
  dev server restart. This has masked a working fix more than once.
- **eve hooks are observe-only.** They cannot refuse a turn; a throw surfaces as
  `turn.failed` *after* the model has been paid for. The channel's `AuthFn` is
  the only place to refuse a request.
- **eve authenticates the caller, never the session.** No session-forbidden
  error exists anywhere in its compiled output. Ownership is enforced by
  `agent.agent_sessions` + a check in `channels/eve.ts`. Do not remove it.
- **An explicit NULL overrides a column default** — it does not fall back to it.
- **Never swallow errors in a best-effort path.** A bare `catch {}` written for a
  good reason hid two bugs entirely. Log on failure, still never throw.
- **Port 3004 is usually krafta-pay.** Symptom: pages 404 and agent health
  returns HTML. Use the `krafta-ai-alt` entry on 3014.
- **Base UI is not Radix.** A component that type-checks is not one that runs;
  compound parts talk through context `tsc` cannot see.

---

## 9. Security invariants — do not regress

- Membership re-checked on **every** agent request, read as the user so RLS
  scopes it. A bug fails closed.
- An org or conversation the caller cannot reach returns **404, never 403**.
  A 403 confirms existence and is an enumeration oracle.
- `lib/conversations.ts` reads with the service key because generated types only
  cover `public`. **RLS is not protecting those reads** — every query filters
  `org_id` explicitly, from the session, never from an argument.
- Verification runs are `sandboxed`: no audit rows, no real escalations, never
  billable. Only `origin = 'customer'` is countable.
- Publishing is gated on a run whose `graded_digest` matches the agent's current
  config digest. `settings` is inside that digest — put new behaviour-affecting
  fields there or they escape the gate.

---

## 10. How to verify

1. **Load the actual page.** A screenshot or rendered HTML, not "the route
   compiles". Both times something looked finished and was not, only opening it
   found out.
2. **Prove the negative case.** For anything about isolation, try it as the
   wrong tenant and confirm the refusal. "The guard exists" is not "the guard
   works".
3. **Say plainly what you did not verify.** A partial result reported as
   complete costs more than an honest gap.

---

## 11. House style

- **Comments explain why a decision was made and what breaks otherwise.** Do not
  narrate the obvious.
- **Commits are conventional and outcome-framed** — what changed for the user.
- **Every user-facing string in all three locales** (`lib/i18n/`): Uzbek Latin,
  Russian, English. UZ Cyrillic is deliberately unsupported.
- **Read `DESIGN.md`** before any visual change. No purple gradients, no
  icon-circle grids, no decorative cards, no `font-extrabold`, no emoji as
  iconography. Reference bar is Square and Stripe.
- **Speak product to the founder.** What happens to a business or their
  customer, and what it costs in money, trust or time. Outcome first, cause
  second, file paths only if asked.

---

## 12. Founder-owned — not yours

- Hard monthly spend cap on the **OpenAI account**.
- Vercel tokens. `vercel tokens add` returns 403 for any session made through
  Sign in with Vercel, including `vercel login`'s device flow — it must come
  from the dashboard, and only with project scope.
- Anything that publishes, deploys to production, or spends money without an
  explicit instruction.
