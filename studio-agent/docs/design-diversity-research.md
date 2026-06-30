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
  brief (palette, type, aesthetic) *before* code — *"If you generate a design
  brief, you MUST follow it."*
- **Orchids** emits a `<design_system_reference>` (or clones a real site's tokens
  via screenshots) and injects it into a separate coding agent.
- **Lovable** — *"the design system is everything… edit `index.css` and
  `tailwind.config.ts` as often as necessary to avoid boring designs."*

Shared move: **keep the component library for structure; regenerate the *theme
layer* (tokens) from scratch per project.** Plus hard **negative constraints**
(v0 literally bans default indigo/blue/violet, caps 3–5 colors and 2 fonts, bans
gradients-by-default and decorative-blob filler and emoji-as-icons), and
**multi-variant** generation for variety-on-demand (Replit Agent 4's canvas; the
`/design-shotgun` skill in this repo).

## The WebGL question

WebGL / three.js / R3F / canvas are **pure-client, browser-native** — no native
build step, no server, no database. Bolt (the "install anything" builder) treats
WebGL as a *sweet spot*, and Bolt is actually *more* constrained than Krafta (it
runs in a browser WASM sandbox that can't do native binaries; Krafta builds
server-side on Vercel). "Add a WebGL hero" = `npm i three @react-three/fiber` +
one client component. The only blockers were soft: the old "keep the stack fixed"
framing and the preview symlinking the template's `node_modules`. Fix = v0's
**install-before-import** contract for the *visual* layer + Orchids' rule of
**walling the backbone** (commerce stays the one untouchable path).

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

## Not yet done (follow-ups)

- A real `generate_design_brief` **eve tool** (separate model call) instead of the
  instruction-only two-phase — closer to v0/Orchids.
- A **named-aesthetic preset library** + merchant "pick a look" UX (design-shotgun).
- **Deterministic post-fixers** (validate imports, complete `package.json`, repair
  JSX) for higher first-render success, like v0's autofixers.
- A **two-tier model** strategy (cheap default for edits, escalate for big builds).
- Finish the cut-off research: Lovable deep-dive + the adversarial verification
  pass (workflow hit a session limit mid-run).
