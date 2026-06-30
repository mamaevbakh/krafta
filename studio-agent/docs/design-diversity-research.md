# Why Krafta Studio shops converge — and the fix

Research memo behind the `instructions.md` rewrite (2026-06-30). Sources: leaked
v0 / Bolt / Lovable / Orchids / Replit system prompts (jujumilk3, x1xhlol,
elder-plinius collections), Vercel / StackBlitz / Replit engineering blogs, and
two papers — Verbalized Sampling ([arXiv:2510.01171](https://arxiv.org/html/2510.01171v1))
and The Price of Format ([arXiv:2505.18949](https://arxiv.org/html/2505.18949v1)).

## The problem

Every AI-built shop drifts to the same look: slate/zinc neutrals, Inter, ~8px
radius, a blue/indigo/violet accent, soft-rounded cards — the "shadcn
fingerprint." Three compounding causes:

1. **Training-data gravity** — shadcn/Tailwind is the statistically most-likely
   answer, so the model defaults to the average of its training set.
2. **RLHF typicality bias** — preference training mathematically rewards familiar
   outputs (α≈0.57, p<1e-14), sharpening toward the stereotype *independent of
   temperature*. You can't fix this by "asking for creativity."
3. **Format collapse** — strict JSON/template structure suppresses early-token
   entropy and locks the model into narrow paths even at high temperature.

Krafta added three accelerants of its own:

- **Reskins one fixed template** (`templates/krafta-shop`); the agent edits in
  place rather than composing a new layout.
- **Instructions said "recolor first"** — the old `instructions.md` opened design
  guidance with *"Restyle by editing `theme.css` first."* That's a recipe for
  "same shop, new palette."
- **No design-brief phase, no variants, no art direction** — straight from prompt
  to code, with nothing deciding what the shop should *feel* like.

## How the leaders escape it

One pattern dominates: **decouple design from code into two phases.**

- **v0** runs a separate `GenerateDesignInspiration` call that emits a written
  brief (palette, type, aesthetic) *before* code — its prompt says *"Utilize the
  GenerateDesignInspiration tool before any design work."* (The "must follow the
  brief" behavior is modeled in v0's few-shot examples, not a verbatim rule —
  verification pass, 2026-06-30.)
- **Orchids** emits a `<design_system_reference>` (or clones a real site's tokens
  via screenshots) and injects it into a separate coding agent.
- **Lovable** — *"the design system is everything… edit `index.css` and
  `tailwind.config.ts` as often as necessary to avoid boring designs."*

Shared move: **keep the component library for structure; regenerate the *theme
layer* (tokens) from scratch per project.** Plus hard **negative constraints**
(v0 bans default indigo/blue/violet, caps 3–5 colors and 2 fonts, discourages
gradients *by default* — a soft ban, permitted as subtle analogous accents — and
bans decorative-blob filler and emoji-as-icons), and **multi-variant** generation
for variety-on-demand (Replit Agent 4's canvas; the `/design-shotgun` skill in
this repo).

## The WebGL question

WebGL / three.js / R3F / canvas are **pure-client, browser-native** — no native
build step, no server, no database. They render in the *visitor's* browser against
their GPU; the only thing the build needs is `npm install three @react-three/fiber`
+ a client component, which any Node bundler clears (even Bolt's far-more-constrained
in-browser WebContainer runs three.js fine). So "Add a WebGL hero" is **table
stakes, not a moonshot** — and this is a *client-side* capability, so it's not
about Krafta's server build being more powerful (an earlier over-statement; dropped).
The only blockers were soft: the old "keep the stack fixed" framing and the preview
symlinking the template's `node_modules`. Fix = v0's **install-before-import**
contract for the *visual* layer + Orchids' rule of **walling the backbone**
(commerce stays the one untouchable path).

## What changed in `instructions.md`

- **Design-brief-first**: decide identity (aesthetic, palette, 2 fonts, radius,
  motion, one signature detail) *before* code; build to it.
- **Flipped** "recolor `theme.css` first" → "decide the aesthetic, regenerate all
  tokens, compose the layout."
- **Named aesthetics** (warm editorial / sharp retail / soft luxe / brutalist /
  playful) to seed divergence; **offer 2–3 directions** when the merchant is vague.
- **Anti-generic guardrails** (3–5 colors, ≤2 fonts, no default blue/violet, no
  gradient-by-default, intentional radius, real imagery, no emoji icons).
- **Open the visual stack**: explicit permission to add client-side libs
  (framer-motion, three.js/R3F, GSAP, canvas, charts) — install before import,
  pin known-good versions, never for commerce/auth/data.
- **Hardened the commerce wall**: the engine is the *only* boundary; everything
  else is the agent's to invent.
- **Verify-in-browser** before "done" (catalog renders, Add-to-cart wired).

## Verification + Lovable delta (2026-06-30)

The load-bearing claims above were re-checked against the primary leaked-prompt
files + both papers: **all confirmed; shipped direction validated.** (Corrections
already applied above: the v0 "must follow the brief" line was a paraphrase, not a
verbatim quote; gradients are a *soft* ban; the WebGL win is client-side, not a
server-power advantage.)

**Lovable is the highest-transfer competitor (also Supabase-backed) — but inverted.**
Lovable's *app* owns its database, so it auto-generates schema/RLS/edge functions
(and ships ~1 critical + 5–10 high security findings on first scan, ~half missing
RLS). **Krafta's engine owns the DB**; shop code only ever reaches it through
`@krafta/commerce` over a publishable key. So Lovable's RLS/migration machinery
does **not** transfer — and that's a strength: Krafta eliminated Lovable's worst
failure mode (agent-authored, frequently-wrong RLS) *by construction*. A point in
favor of keeping the commerce box locked, exactly as shipped.

## Follow-ups (prioritized)

1. **Pre-publish security scan, hard-gating `publish_shop`** (NEW, top priority —
   Lovable's `run_security_scan` analogue for Krafta's *client-side trust seam*):
   block the deploy if the built shop contains (a) any key other than the
   publishable key, (b) `process.env` reads outside `NEXT_PUBLIC_KRAFTA_*`, (c) a
   non-`@krafta/commerce` network/DB/auth dependency, or (d) a hardcoded price/total.
2. **Make the commerce wall structural, not prose** (NEW): a reserved-env guard +
   lint so generated code physically can't read anything but `NEXT_PUBLIC_KRAFTA_*`
   (mirrors Lovable reserving `SUPABASE_*`/`LOVABLE_*` and banning `VITE_*` frontend env).
3. A real **`generate_design_brief` tool** — frame it as the *Plan* half of a
   Plan/Build split (a no-mutation reasoning turn the merchant approves before any
   live-shop change): diversity rationale **+** safety rationale.
4. **Named-aesthetic preset library** + merchant "pick a look" UX (design-shotgun).
5. **Deterministic post-fixers** (validate imports, complete `package.json`, repair
   JSX) + a **two-tier model** (cheap router + powerful generator). Lovable's own
   engineers converged here after **abandoning multi-agent orchestration** — so do
   NOT build a multi-agent pipeline; lean on deterministic verification.
6. Wire the Next devtools MCP `get_errors` as the agent's verify signal — Lovable's
   "let errors bubble, don't try/catch" reliability loop.
7. Lift verbatim into the reskin path: **customize shadcn via `cva` variants, never
   inline overrides** (Lovable / Same.dev) — stops the kit from looking like the kit.
