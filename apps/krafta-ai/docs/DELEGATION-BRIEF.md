# Krafta AI — delegation brief

Self-contained. Hand this to an agent or an engineer with no other context.

---

## 1. What you are building

**Krafta AI** gives every company in Uzbekistan its own AI agents. The owner
describes their business in their own language — Uzbek, Russian or English —
and gets a working agent that talks to their customers.

Live at `ai.krafta.uz`. Merchants sign in with their existing Krafta account
through `auth.krafta.org` (OIDC); there is no separate password.

Market reality, because it changes design decisions: the users are Uzbek small
and medium businesses. Many are on a phone. Telegram is not a marketing channel
there — for a lot of shops it *is* the storefront. Default language is Uzbek;
English is currently the interface default only because the work is being
reviewed in it, and that flips before launch.

**There are no paying customers yet.** Nothing here is load-bearing on revenue.
Do not treat existing code as sacred, and do not treat it as proven either.

---

## 2. The architecture — this is not up for debate

> **Krafta AI is the interface. An agent builder writes each customer's agent
> as CODE.**

The reasoning: [eve](https://eve.dev) is not a wrapper around a model, it is
infrastructure — evals, sandboxes, durable sessions, channels, connections,
subagents. If a customer's agent is a real generated eve agent, that customer
inherits all of it. If it is a row in a config table, they inherit only the
columns somebody remembered to build.

**Do not propose replacing this with a shared multi-tenant runtime.** That
argument has been had, with research. Know the real constraints so you do not
rediscover them:

| Constraint | Reality |
|---|---|
| Cost of many projects | **Not** an objection. Idle Vercel projects are free; a full 1000-agent rebuild is ≈ **$42** |
| Git-connected projects | Hard cap **150 per repository** on Pro — deploy sourceless past that |
| Deployment rate limits | Team-wide, shared with every other project: 6000/day, 450/hour on Pro |
| Domains | 100 additions/hour; a wildcard domain can attach to only one project |
| Cold starts | Nothing pools between projects, so low-traffic merchants pay one on nearly every visit |

---

## 3. Does this need rebuilding? No.

This is the question that prompted the brief, so answer it honestly before
planning anything.

The existing code was built against a shared-runtime reading of the
architecture. Most of it is unaffected, because most of it is either **the
interface** (which is exactly what Krafta AI is meant to be) or **plumbing you
need under either model**.

### Survives unchanged

- The entire console UI — agents, templates, setup, knowledge, audit, usage,
  conversations. This *is* the product surface.
- **The conversational builder.** A merchant describes their business, the
  agent researches the company online, then asks two to four branching
  questions with clickable options. Its most valuable question — *"is this for
  your customers, or the businesses you serve?"* — matters more in the codegen
  model, not less. Only its output target changes: today it writes a proposal
  that becomes rows; it should write a spec that becomes code.
- Auth, SSO, org membership, tenant isolation.
- Knowledge ingestion and search.
- Conversation transcripts and the merchant's inbox.
- Spend caps and rate limiting.
- **The verification runner and publish gate.** These become *more* important:
  they are the acceptance test for generated code — the compiler that the
  previous codegen attempt (Krafta Studio) never had.

### Changes

- `agents/runtime/` is currently one shared agent resolving persona, knowledge
  and tools per session from the caller's org. In the new model it stops being
  *the* agent and becomes **the reference implementation the builder generates
  variants of**. Very little of it is wasted; its instructions, tools and
  channel are the template.
- Agent config rows stop being the whole definition and become the **spec** the
  generator consumes, plus the record of what was generated.

### Honest estimate

Roughly **15–20%** of the code is affected, and most of that is repurposed
rather than deleted. Anyone who tells you to start over has not read it.

---

## 4. Where things are

| Path | What |
|---|---|
| `/Users/bakh/VSCode/krafta-ai` | Working copy. **This is what deploys to `ai.krafta.uz`.** |
| `krafta/apps/krafta-ai` | Monorepo copy, version-controlled, not yet wired to build. Keep in sync. |
| `/Users/bakh/VSCode/krafta-ai-lab` | The agent builder (`@evex/eve-agent-builder`), isolated. Port 3015. |

Stack: Next.js 16.3 (App Router, `proxy.ts` not `middleware.ts`), React 19,
Tailwind 4, TypeScript strict, eve 0.32.0, shadcn preset `b0` → **Base UI, never
Radix**. Supabase (`agent` schema) shared with the main Krafta product.

Read `CLAUDE.md` in the repo root first. It is current and it is honest about
the gap between the direction and the implementation.

---

## 5. The work

Phases in dependency order. Each has an acceptance test that a person could
run — not "it compiles".

### Phase 1 — Customers can reach an agent (highest value)

Right now an agent only exists in a preview box inside the merchant's own
dashboard. No customer can talk to one. This is the single line between demo
and product.

**Per-merchant Telegram bots.** Each business connects its own bot, so
customers message `@navvat_bot`, not a shared Krafta bot.

Verified architecture — do not re-derive:

- eve's built-in `telegramChannel` is single-tenant: one token, one webhook
  path, fixed at deploy. Its `botToken` option accepts a resolver, but the
  resolver takes **no arguments**, so it cannot know which merchant is calling.
  Dead end.
- The route that works: a **custom channel** via `defineChannel`. Custom channel
  routes support path parameters — `POST("/tg/:connectionId", handler)` with
  `params`, `requestIp` and session ops. Each merchant registers a unique opaque
  webhook URL with BotFather (eve deliberately never calls `setWebhook`).
- Verify `X-Telegram-Bot-Api-Secret-Token` against *that merchant's* secret,
  then dispatch with an auth context carrying their `tenantId`.
- Cost of going custom: reimplement inline-keyboard HITL, attachment fetch via
  `getFile`, and splitting replies over Telegram's 4096-character cap.

**Bot tokens are credentials.** Copy the brokering pattern from the lab:
the sandbox never receives the real token, it gets a placeholder, and the real
`Bearer` header is substituted at egress. The model must never see it; it must
not appear in a tool argument, a tool result, an error, or a log line. A
prompt-injected message that exfiltrates a merchant's bot token hands over
their entire customer channel.

*Acceptance:* a real Uzbek merchant's own bot answers a real customer in
Telegram, and that conversation appears in their inbox in the console.

### Phase 2 — The generator

Point the lab's builder at producing agents from the interview's output.

**Start by hand-writing three, before generating anything.** You cannot
generate a good agent until you know what one looks like, and these three are
the specification for the generator. Krafta owns both sides of all three APIs:
Krafta catalogue, Telegram order desk, Krafta Pay payment status.

Hard rules for anything generated, all learned from Krafta Studio's failure:

- **Credentials never in generated code** — injected at call time from
  encrypted storage.
- **Egress allowlisted** to one host.
- **Read-only by default**; any write is a separate tool with an explicit
  approval policy.
- **Nothing publishes until the verification runner passes it.** This is
  non-negotiable and it is the thing Studio lacked. Its worst failure mode was
  an agent confidently reporting work it had not done, and only a human in a
  browser ever caught it.

*Acceptance:* a generated agent passes its verification gates and answers a
real question correctly, with no human editing the generated code.

### Phase 3 — More channels, then the public front door

Slack, web widget, and phone/SMS via Twilio, in that order — eve ships channels
for all of them. Then the landing-page builder ("describe your business, watch
an agent get built, claim it by signing in").

The public door needs its own budget: cheapest model, no tools, a hard ceiling
of a few turns per visitor, tight per-address limits. Every spend cap built so
far is keyed to a business, and an anonymous visitor has none.

---

## 6. Traps that have already cost hours

All the same shape: **something reports success while doing nothing.** A green
build, a healthy endpoint and a clean typecheck are not evidence the product
works.

- **A Vercel project created by CLI has no framework preset.** It then builds
  Next with `@vercel/static-build`: `next build` runs, prints its routes, the
  deploy goes READY — and every page returns Vercel's platform 404 while the
  eve agents answer normally, because eve merges its routes separately. Check
  `x-vercel-error: NOT_FOUND`. Set `framework: "nextjs"` on every new project.
- **eve agent files do not hot-reload.** Editing anything under
  `agents/*/agent/` needs a dev server restart. This has masked a working fix
  more than once.
- **eve hooks are observe-only.** They cannot refuse a turn; a throw surfaces as
  `turn.failed` *after* the model has been paid for. The channel's `AuthFn` is
  the only place a request can be refused, which is why spend caps and session
  authorisation both live there.
- **eve authenticates the caller, never the session.** There is no
  session-forbidden error anywhere in its compiled output. Session ownership is
  enforced by `agent.agent_sessions` plus a check in `channels/eve.ts`. Do not
  remove it.
- **An explicit NULL overrides a column default** — it does not fall back to it.
- **Never swallow errors silently in a best-effort path.** A bare `catch {}`
  written for a good reason (never break a live conversation to write history)
  hid two bugs completely. Log on failure, still never throw.
- **Port 3004 is usually krafta-pay, not Krafta AI.** Symptom: pages 404 and
  agent health returns HTML. Use the `krafta-ai-alt` entry on 3014.
- **Base UI is not Radix.** A component that type-checks is not a component that
  runs; these compound parts talk through React context that `tsc` cannot see.
  Open every menu, dialog and select you write.

---

## 7. Security invariants — do not regress these

- Membership is re-checked on **every** agent request, read as the user so RLS
  scopes it. A bug fails closed.
- An organisation or conversation the caller cannot reach returns **404, never
  403**. A 403 confirms existence and is an enumeration oracle.
- `lib/conversations.ts` reads with the service key because generated types only
  cover `public`. **RLS is not protecting those reads** — every query filters
  `org_id` explicitly, from the session, never from an argument.
- Verification runs are `sandboxed`: no audit rows, no real escalations, never
  billable. Only `origin = 'customer'` is countable.
- Publishing is gated on a verification run whose `graded_digest` matches the
  agent's current config digest, so a pass cannot authorise shipping something
  it never graded. `settings` is inside that digest — put new
  behaviour-affecting fields there, or they escape the gate.

---

## 8. How to verify — never trust green

Three rules, each written after being burned:

1. **Load the actual page.** A screenshot or rendered HTML, not "the route
   compiles". Both times something looked finished and was not, only opening it
   found out.
2. **Prove the negative case.** For anything about isolation, try it as the
   wrong tenant and confirm the refusal. "The guard exists" is not "the guard
   works".
3. **Say plainly what you did not verify.** A partial result reported as
   complete costs more than an honest gap.

Write eve evals rather than clicking (`defineEval`, then `t.send(...)` and
assert on behaviour). The repo has none, which is why every check so far has
needed a human with a mouse.

---

## 9. House style

- **Comments explain why a decision was made and what breaks otherwise**, at
  length where the logic is load-bearing. Do not narrate the obvious.
- **Commits are conventional and outcome-framed**: what changed for the user,
  not the mechanism.
- **Every user-facing string goes in all three locales** (`lib/i18n/`) — Uzbek
  Latin, Russian, English. Never hardcode English in a component. UZ Cyrillic
  is deliberately not supported.
- **Read `DESIGN.md`** before any visual change. No purple gradients, no
  icon-circle grids, no decorative cards, no `font-extrabold`, no emoji as
  iconography. Reference bar is Square and Stripe: dense, calm,
  information-first.
- **Speak product to the founder.** Say what happens to a merchant or their
  customer and what it costs in money, trust or time. Lead with the outcome,
  the cause second, file paths only if asked. Money in money terms.

---

## 10. Founder-owned, not yours

- A hard monthly spend cap on the **OpenAI account** — per-business caps exist,
  the account ceiling does not.
- Vercel access tokens. `vercel tokens add` returns 403 for any session made
  through Sign in with Vercel, including `vercel login`'s device flow.
- Anything that publishes, deploys to production, or spends money without an
  explicit instruction.
