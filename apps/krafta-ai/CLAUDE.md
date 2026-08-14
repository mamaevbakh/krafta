# CLAUDE.md

Guidance for Claude Code working in this repository.

# What this is

**Krafta AI** — every company in Uzbekistan gets its own AI agents. The owner
describes their business in their own language and gets a working agent.

## The intended architecture — read this before proposing anything

**Krafta AI is the interface. An agent builder writes the customer's agent as
CODE.**

That is the founder's stated direction and it has been re-argued more than
once, so it is written here to stop that happening again. The reasoning: eve is
not a wrapper around a model, it is infrastructure — evals, sandboxes, durable
sessions, channels, connections, subagents. If a customer's agent is a real
generated eve agent, that customer inherits all of it. If it is a row in a
config table, they inherit whatever we remembered to build a column for.

**Do not "correct" this to a shared multi-tenant runtime.** That argument has
been had, with research. The strongest points against codegen are worth knowing
but are not blockers: Vercel projects connected to one git repo cap at **150**
on Pro, team-wide deployment rate limits are shared across every project, and
low-traffic merchants pay a cold start on nearly every visit because nothing
pools between projects. Idle projects are free and a full 1000-agent rebuild
costs roughly **$42** — cost is not the objection anyone thought it was.

## The full loop

1. Owner describes what they need, in their own language.
2. **Our builder writes their agent** — code, skills, instructions, and the MCP
   connections that give it real tools against their systems.
3. It **deploys with channels attached** (Telegram, Slack, web, phone) so real
   external customers or internal staff talk to it.
4. Krafta AI shows **every conversation** across every agent and channel.
5. **Anyone with access to the organisation can take the wheel** — step into a
   live conversation and continue as the agent, through the customer's channel.
   **That is the escalation mechanism.** Not a notification. Not a ticket.

Today step 5 is a dead end: the agent says "I've passed this to Dilnoza" and
Dilnoza receives nothing. See ticket J1.

**Hard interlock when it is built: the moment a human takes over, the agent
goes silent.** Two voices contradicting each other in front of a customer
destroys the merchant's trust permanently. Enforce it in the channel before a
turn starts, never by asking the model to stay quiet.

## Who this is for — decided 2026-08-14

**Big businesses are the audience.** Payme-scale: a company with real systems, a
support team, and money. Small shops are not realistically the market, though
they should still be able to use it with a freer agent and good notifications.

This reorders things, so do not assume otherwise:

- **Integration depth beats Uzbek-language polish.** A big buyer's agent is
  worthless if it cannot see an order, a balance, a settlement. That is why the
  builder generates MCP connections (K2) rather than offering a settings form.
- **Notifications matter less** than they would for a shop owner — these buyers
  have people watching a screen. Still needed for the small-business case (J1a).
- **Compliance, audit and isolation matter more.** Every guarantee in the
  security section is now a sales question, not just hygiene.
- **The demo is dressed for the wrong customer.** Templates are `venue-support`
  and `order-desk`; the example business is a coffee shop. Payme does not see
  itself in any of that. Fixing the surface is cheap and worth doing before any
  serious pitch.

Pricing will be **token-based**. Deliberately not designed yet — do not build
billing UI or plan tiers until the founder says so. What this does mean: usage
metering is the business model, not bookkeeping, and the ~15,600-token system
prompt on every turn is a direct margin lever (prompt caching).

Routing is settled: **each agent gets its own channel.** A business wanting a
sales agent and a support agent runs two bots. No routing layer needed.

## What is actually built today (as of 2026-08-14)

Be precise about this — the gap between the direction and the implementation is
where confusion breeds.

Built and working: a conversational builder that researches a business online
and interviews it; agents stored as ROWS and composed per session from the
caller's verified organisation; knowledge search; escalation to a named person;
a verification runner that grades an agent before it may be published; spend
caps; conversation transcripts; SSO through `auth.krafta.org`.

**Not built:** anything that generates code. The builder that does that lives
in a separate lab (below) and has produced nothing yet.

So the current implementation IS the row-configured shared runtime. That is the
starting point, not the destination, and saying otherwise in either direction
is wrong.

## The lab

`/Users/bakh/VSCode/krafta-ai-lab` — `@evex/eve-agent-builder`, an eve agent
that writes and deploys eve agents. Isolated on purpose: its own Vercel
project, empty environment, port 3015.

Its sandbox backend was changed from the package's pinned `vercel()` to
`defaultBackend()`, so it needs **no Vercel token** — `vercel tokens add`
returns 403 for any session made through Sign in with Vercel, which includes
`vercel login`'s device flow. It therefore cannot deploy; it can read a repo,
write agents, build and run evals, which is the question worth answering first.

## Where the code lives

Two copies, deliberately, until the deployment is cut over:

- `/Users/bakh/VSCode/krafta-ai` — the working copy. **This is what deploys to
  `ai.krafta.uz`.**
- `krafta/apps/krafta-ai` — in the monorepo, version-controlled, not yet wired
  to build. Keep it in sync when committing.

Domain is `ai.krafta.uz`. Locale is a path segment, hence `app/[locale]/…`.

# Commands

```bash
pnpm build
pnpm exec tsc --noEmit
pnpm lint
```

**Never start a dev server with Bash.** Use `preview_start`.

**Port 3004 is usually occupied by krafta-pay**, not this app. Symptom: pages
404 and `/eve/agents/*/health` returns HTML — that is krafta-pay's 404 page,
not a broken agent. Use the `krafta-ai-alt` launch entry on **3014** instead.
Cookies are not port-scoped, so a session established on one port works on the
other.

# Design system

shadcn CLI v4, **preset `b0`** → style **`base-nova`**, base colour **neutral**, engine **Base UI** (`@base-ui/react`). Fonts are **Geist Sans** (body) and **Geist Mono** (money, counts, IDs, timestamps).

All 62 primitives are installed under `components/ui/`. Rules:

- **Compose what is there. Do not write custom primitives.** If a screen seems to need something new, it is almost always a composition of existing parts.
- **Never import `@radix-ui/*`.** It is not a dependency. Base UI part names differ: Dialog's overlay is `Backdrop`, polymorphism is `render` / `useRender`, not `asChild` + Slot.
- **Read the component file before using it.** base-nova's API differs from Radix-era shadcn in ways that will not surface until runtime.
- Install new primitives with the CLI from this directory so `components.json` picks the Base UI variant: `pnpm dlx shadcn@latest add <name>`. Never hand-paste primitive code.
- Switching the whole preset is one command and it reconfigures every installed component: `pnpm dlx shadcn@latest init --preset <code> -y -f --reinstall`. It resets fonts, so re-apply Geist afterwards with `pnpm dlx shadcn@latest add @shadcn/font-geist @shadcn/font-heading-geist`.

## The AI-agent primitives

shadcn ships a chat/agent kit — **use it instead of hand-rolling a transcript**:

| Primitive | Use for |
|---|---|
| `message` | the turn: `Message align="start"\|"end"`, avatar, content, header, footer |
| `bubble` | the speech bubble inside a turn, with reactions |
| `message-scroller` | scroll anchoring and jump-to-latest over a transcript |
| `marker` | **tool calls, escalations and status breaks in a conversation** — not messages |
| `attachment` | uploaded documents and inbound media |
| `questionnaire` | **guided setup wizards** — progress, choices, validation, prev/skip/next/submit |
| `input-group` | the composer: `InputGroupTextarea` + addons |
| `empty`, `spinner`, `item` | empty states, pending states, list rows |

## Gotchas that cost real time

All three are the same failure: a Radix-era shadcn habit that compiles fine and breaks at runtime.

- Base UI's `Button` asserts a native `<button>`. Anything that navigates must use `ButtonLink` (`components/console/button-link.tsx`), which passes `nativeButton={false}`. `<Button render={<Link/>}>` logs an accessibility warning on every render.
- `CardHeader` is a CSS grid that switches to two columns only when it contains a `CardAction`. Right-align a header action with `<CardAction>`, never with a flex override.
- **`DropdownMenuLabel` is Base UI's `Menu.GroupLabel` and must sit inside a `DropdownMenuGroup`.** Outside one it throws `MenuGroupContext is missing` at runtime — TypeScript will not catch it. Radix's `Label` is standalone, so this breaks on every copied menu.

The general rule: **a component that type-checks is not a component that runs.** Base UI leans on React context between compound parts far more than Radix did, and those contracts are invisible to `tsc`. Open any menu, dialog or select you have just written.

# Runtime traps that each cost hours

The same shape every time: **something reports success while doing nothing.**
A green build, a healthy endpoint and a clean typecheck are not evidence the
product works.

- **A Vercel project created by CLI has no framework preset.** It then builds
  Next with `@vercel/static-build`: `next build` runs, prints its route table,
  the deploy goes READY — and every page returns Vercel's platform 404 while
  the eve agents answer normally, because eve merges its routes separately.
  Check `x-vercel-error: NOT_FOUND`, which distinguishes "route absent from the
  build output" from the app's own 404 page. Set `framework: "nextjs"` on any
  new project.
- **eve agent files do not hot-reload.** Editing anything under `agents/*/agent/`
  requires a dev server restart. This has masked a working fix more than once.
- **eve hooks are observe-only.** They cannot refuse a turn — a throw surfaces
  as `turn.failed` after the event is durably recorded, i.e. after the model has
  been paid for. The channel's `AuthFn` is the ONLY place a request can be
  refused, which is why spend caps and session authorisation both live there.
- **eve authenticates the caller, never the session.** There is no
  session-forbidden error anywhere in its compiled output. Session ownership is
  ours to enforce: `agent.agent_sessions` plus the check in `channels/eve.ts`.
  Do not remove it.
- **Passing an explicit NULL overrides a column default.** It does not fall back
  to it. Two transcript bugs came from exactly this.
- **Never swallow an error silently in a best-effort path.** The transcript
  recorder was written with a bare `catch {}` for the right reason — never break
  a live conversation to write history — and the wrong consequence: total
  silence while nothing was recorded. Log on failure, still never throw. Adding
  that one line found two bugs in a single run.
- **Check the port before believing a 404.** See the note above about
  krafta-pay on 3004.

# Security invariants — do not regress these

- Membership is re-checked on every agent request, read AS THE USER so RLS
  scopes it. A bug fails closed.
- An organisation or a conversation the caller cannot reach returns **404, never
  403**. A 403 confirms existence and is an enumeration oracle.
- `lib/conversations.ts` reads with the service key because the generated types
  only cover `public`. **RLS is therefore not protecting those reads** — every
  query filters `org_id` explicitly, from the session, never from an argument.
- Verification runs are `sandboxed`: no audit rows, no real escalations, never
  billable. Only `origin = 'customer'` is countable.
- Publishing is gated on a verification run whose `graded_digest` matches the
  agent's current config digest, so a pass cannot authorise shipping something
  it never graded. `settings` is in that digest — put new behaviour-affecting
  fields there rather than in new columns, or they escape the gate.

## Anti-slop

No purple gradients, no icon-circle grids, no decorative cards, no `font-extrabold`, no emoji as iconography. Neutral tokens only. Reference bar is Square and Stripe: dense, calm, information-first.

# Internationalization

Default locale is **Uzbek** — this product is pitched as the platform that speaks the language, so the untranslated state must be Uzbek, not English. Supported: UZ (Latin), RU, EN. UZ Cyrillic is not supported.

One hand-rolled catalogue at `lib/i18n/index.ts`: bounded key set, server-safe, no ICU. `Dict` is `typeof uz` **without `as const`** — the shape is the contract, the strings are not; adding `as const` turns every Uzbek value into a literal type and the other two catalogues stop typechecking.

- `getDict(locale)` for strings, `fill(template, values)` for `{placeholder}` interpolation.
- **Never hardcode a user-facing string in a component.** Adding a string means adding it to all three locales.
- Mock records carry their own `Record<"uz"|"ru"|"en", string>` fields — index them with `locale`.

# Conventions

- Money is UZS in **tiyin** (major unit × 100), matching the rest of Krafta. Render with `formatUzs()` and `font-mono tabular-nums`. Never show decimals on UZS.
- Params are async: `{ params }: { params: Promise<{ locale: Locale }> }`.
- Server Components by default. `"use client"` goes on the specific component holding state, never on a whole page.
- Page chrome is `PageHeader` + `PageBody` from `components/console/page-header.tsx`.
- Comments explain *why a decision was made and what breaks otherwise*. Don't narrate the obvious.
- Commits are conventional and outcome-framed: `feat(console): let the owner see which check is blocking publish`.

# Talking to the founder

Speak product and money, not engineering. Say what happens to a **merchant** or their **customer** and what it costs in trust, time or money. Lead with the outcome, cause second, file path only if it is the point. No `file:line` dumps. Recommend one option rather than surveying three. Say plainly when something is not done, not verified, or not safe.
