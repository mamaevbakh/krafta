# Design System — Krafta

This document is the source of truth for visual and UX decisions in Krafta. Always read it before making any UI change. Do not deviate without explicit user approval. In QA mode, flag any code that does not match.

This is a **reverse-engineered formalization** of the system that already ships in `packages/theme/`, `apps/krafta/app/globals.css`, `apps/krafta/app/fonts.ts`, and `apps/krafta/components/brand/`. New surfaces extend this system; they do not invent.

## Product Context

* **What this is:** Krafta is a Square-quality POS and ordering platform for cafes, restaurants, and retail in Uzbekistan. Merchants build a menu, take orders (dine-in / pickup / delivery), and accept payment in person (v1 cash-only) or via Krafta Pay (v2+). Customers order through a web catalog or Telegram Mini App.
* **Who it's for:** Solo and small-team cafe / restaurant operators in Tashkent and other Uzbek cities. They are mobile-first, multilingual (RU primary, UZ growing, EN for tourists), price-sensitive, and switching from spreadsheets, Telegram messages, or a half-set-up iiko/Poster system.
* **Space / industry:** POS + commerce + ordering. Reference quality bars: Square (POS), Stripe (primitives), Linear (editor craft), Notion (in-place authoring), Vercel (developer aesthetics).
* **Project type:** Hybrid. Marketing surface (homepage) + merchant dashboard + customer-facing catalog (web + Telegram Mini App).
* **Memorable thing:** *"Square-quality POS that respects how Tashkent cafes actually work."* Minimal chrome, real Uzbek text rendering, mobile-first for the merchant, no purple SaaS gradients. Every design choice serves this. If a choice feels like SaaS template-fill, reject it.

## Aesthetic Direction

* **Direction:** Brutally Minimal × Industrial Utilitarian. Linear / Vercel / Notion adjacency. Typography does the work; decoration earns its pixels.
* **Decoration level:** Minimal. No gradients, no decorative SVG blobs, no patterns, no shadows-as-decoration. Borders and weight do hierarchy.
* **Mood:** Calm, dense, confident. Looks expensive because it withholds, not because it adds. The Helvetica Neue Bold wordmark is the only loud element; everything else lets the data and the menu be the design.
* **Reference systems we honor:** shadcn/ui (component primitives), Geist (typography + numerals), Linear (editor density), Notion (in-place editing affordances).

## Components & Composition

* **Foundation:** **shadcn/ui (style: `new-york`, base color: `zinc`, RSC: true, icons: lucide)** is the only component library. Configured in `apps/krafta/components.json` (mirrored in `apps/krafta-auth/`, `apps/krafta-docs/`, `apps/krafta-pay/`). Do not introduce Material UI, Chakra, Mantine, Headless UI, Ariakit, NextUI, Park UI, or any other primitive library. If shadcn lacks a primitive we need, build it on top of Radix or `base-ui` (which shadcn already pulls in) — never alongside a competing system.
* **Use shadcn at 100%.** Before building any UI element, check `apps/krafta/components/ui/` first (37 primitives installed and counting). If the primitive exists, use it. If a variant is missing, extend the existing primitive's API or copy from the canonical shadcn registry. Do not duplicate primitives with subtly different APIs.
* **Install new primitives via shadcn CLI:** `pnpm dlx shadcn@latest add <name>` (or pull from one of the configured registries below). Never paste primitive code by hand — keep the upgrade path intact.

### Configured registries

`components.json` exposes three custom registries beyond the default shadcn one:

| Registry | URL pattern | Use for |
|---|---|---|
| `@shadcnblocks` | `https://shadcnblocks.com/r/{name}` (requires `SHADCNBLOCKS_API_KEY`) | Pre-composed marketing + dashboard blocks |
| `@shadcnio` | `https://shadcn.io/registry/{name}` | Community-contributed primitives |
| `@ai-elements` | `https://registry.ai-sdk.dev/{name}.json` | AI-SDK chat / prompt / streaming UI |

When adding LLM-facing UI (chat panels, prompt inputs, streaming responses, agent chrome), check `@ai-elements` before building. Krafta has `apps/krafta/components/ai-elements/` for these patterns.

### Composition over configuration (mandatory)

Krafta builds compound, composable APIs. Boolean-prop proliferation (`<Modal showHeader hasFooter dismissible withOverlay closable>`) is forbidden. Use the patterns shadcn ships:

* **Compound components.** Card is `<Card><CardHeader><CardTitle/><CardDescription/></CardHeader><CardContent/><CardFooter/></Card>`. Dialog is `<Dialog><DialogTrigger/><DialogContent><DialogHeader><DialogTitle/></DialogHeader>...</DialogContent></Dialog>`. Tabs is `<Tabs><TabsList><TabsTrigger/></TabsList><TabsContent/></Tabs>`. Sheet, Drawer, Popover, DropdownMenu, NavigationMenu, Sidebar, AlertDialog, Command, ContextMenu, HoverCard, Tooltip — all follow the same pattern. **Use the parts. Do not collapse them into monolithic props.**
* **`asChild` + Radix Slot.** Polymorphism is opt-in via `asChild`. To link a button: `<Button asChild><Link href="/...">Label</Link></Button>` — not a `<LinkButton>` wrapper duplicating button styles. Same pattern for `DialogTrigger`, `DropdownMenuItem`, `NavigationMenuLink`, etc. This is how we keep `<Link>` semantics + button styling without component proliferation.
* **Render props / function-as-children.** Use when the parent needs to expose computed state (e.g., `<Combobox>` exposing `selected` to its trigger). Do not invent render-prop APIs where compound components or context providers do the job.
* **Context providers for cross-cutting state.** `SidebarProvider`, `TooltipProvider`, `ItemSheetProvider` (Krafta-specific in `components/catalogs/items/item-detail-controller.tsx`), `ThemeProvider`. Provider lives once at the layout level; descendants consume via hooks. Do not pass shared state through prop drilling.
* **Variant + size via `class-variance-authority` (cva).** Already the shadcn pattern. New visual variants of a primitive extend its `cva` recipe rather than fork the component.
* **`cn()` for conditional classes.** From `@/lib/utils`. Always use it for conditional Tailwind class composition. Never use template strings with conditional concatenation that bypass deduplication.

### Composition patterns reference

The `vercel-composition-patterns` skill (in the available skills list) is the canonical reference for the React composition patterns Krafta uses: compound components, render props, context providers, React 19 API patterns. When refactoring a component that has grown a forest of boolean props, that skill is the right tool. Triggers: refactoring components with boolean prop proliferation, building flexible component libraries, designing reusable APIs.

### Extending shadcn (the only kind of new primitive allowed)

Krafta has custom primitives that extend the shadcn surface — never replace it. Examples that already ship or will ship:

* `<InlineText>`, `<InlineCurrency>` (KRA-35 PR 1, design doc §Next Steps) — focus-styled inputs that render as text when unfocused. Built on top of shadcn `<Input>`, not from scratch.
* `<BrandWordmark>` in `components/brand/brand-wordmark.tsx` — uses `font-brand` Tailwind class wired to the `--font-brand` CSS variable, plus theme-aware color. Not a "wrapped button" pattern; a brand element.
* `<ItemSheetProvider>` in `components/catalogs/items/item-detail-controller.tsx` — React Context for the customer-side item-detail sheet. Pairs with shadcn `<Drawer>` for the actual chrome.
* `<EditableItemCard>` (KRA-35 PR 1, planned) — mode-aware variant of `<CustomerItemCard>` (which extends shadcn primitives). Compound API: `<EditableItemCard><ItemCardPhoto/><ItemCardBody/><ItemCardPrice/></EditableItemCard>` rather than a 12-prop blob.

### Hard rules for components

1. **Check `components/ui/` first.** If the primitive exists, use it. No exceptions.
2. **No competing component libraries.** shadcn or extend-shadcn only.
3. **No boolean prop sprawl.** A component with 5+ boolean props is a smell. Refactor to compound or render-props.
4. **No paste-from-internet primitives.** Use the shadcn CLI or a configured registry so the upgrade path stays clean.
5. **No CSS-in-JS at runtime.** Tailwind utility classes + cva variants only. No emotion, no styled-components, no vanilla-extract.
6. **No duplicate primitives.** One `<Dialog>`, one `<Drawer>`, one `<Sheet>`. If two surfaces need slightly different chrome, extend with variants, do not fork.

## Typography

* **Brand wordmark:** **Helvetica Neue Bold** (self-hosted, `apps/krafta/public/fonts/helveticaneue-bold.woff2`). Used ONLY for the `<BrandWordmark>` component. Exposed as `--font-brand` / Tailwind `font-brand`. This is the brand's voice; do not use it for body, headings, or UI labels.
* **Display + Body + UI:** **Geist Sans** via `geist/font/sans`. Exposed as `--font-geist-sans` / Tailwind `font-sans`. Default for all headings, body text, buttons, form labels, and inline UI.
* **Data / Numerals / Code:** **Geist Mono** via `geist/font/mono`. Exposed as `--font-geist-mono` / Tailwind `font-mono`. Use for: tabular numerals (UZS prices, counts, percentages), code blocks, transaction IDs, schema field names.
* **No display serif. No accent typeface beyond the three above.** Brand wordmark is the only deliberate dissonance.

* **Numerals everywhere money is rendered:** `font-mono tabular-nums` for prices in UZS (which can be 6-7 digits long: 2,500,000 sums). Mono numerals keep columns aligned in tables and reduce visual jitter when prices update inline.

* **Type scale (Tailwind defaults, used consistently):**
  * `text-xs` (12px / 16) — secondary metadata, captions, muted hints
  * `text-sm` (14px / 20) — body default in dashboard chrome, form labels, table rows
  * `text-base` (16px / 24) — body default in marketing + customer catalog
  * `text-lg` (18px / 28) — small section headings inside cards
  * `text-xl` (20px / 28) — page subtitles
  * `text-2xl` (24px / 32) — sheet/dialog titles
  * `text-[32px]` (32px / tracking-tight) — dashboard H1 (used in `items/_components/items-panel.tsx:116`)
  * `clamp(6rem, 10vw, 12rem)` — landing-page hero wordmark only

* **Weight:** Default to `font-medium` (500) for labels and emphasis, `font-semibold` (600) for prices and action affordances, `font-bold` (700) only for the brand wordmark. Avoid `font-extrabold` and `font-black` everywhere.

* **Loading:** Geist comes via the `geist` npm package and loads at build time (no CDN). Helvetica Neue Bold is a self-hosted woff2 declared in `apps/krafta/app/fonts.ts`. No external font CDNs in production.

* **Font blacklist for this project (never use, even temporarily):** Inter, Roboto, Arial, Helvetica fallback (use Geist instead), Open Sans, Lato, Montserrat, Poppins, Space Grotesk, system-ui as primary, Comic Sans, Lobster, anything with the word "Display" in its name we did not pick.

## Color

* **Approach:** Restrained. Monochromatic primary palette with one functional accent (destructive red). Color is rare and meaningful, not decorative. Chart colors are saturated and reserved for data visualization only.

* **Color space:** All colors defined in **oklch** for perceptual uniformity and predictable dark-mode inversion. Do not introduce hex or rgb values to the theme. Inline brand decoration may use hex if absolutely required, but design tokens stay in oklch.

* **Source of truth:** `packages/theme/src/styles.css` defines all CSS variables. Tailwind references them via `@theme inline` mapping in the same file and in `apps/krafta/app/globals.css`. Component code uses semantic Tailwind classes (`bg-background`, `text-foreground`, `border-border`), never raw oklch literals.

### Light mode (canonical)

| Token | Value | Use |
|---|---|---|
| `--background` | `oklch(100% 0 271)` | App background |
| `--secondary-background` | `oklch(0.985 0 0)` | Layered surfaces (sidebars, sheets behind cards) |
| `--foreground` | `oklch(0.141 0.005 285.823)` | Body text (faint cool tint, ~285° hue) |
| `--card` | `oklch(1 0 0)` | Card surface (pure white) |
| `--card-foreground` | `oklch(0.141 0.005 285.823)` | Card text |
| `--popover` | `oklch(1 0 0)` | Popover / tooltip surface |
| `--primary` | `oklch(0.21 0.006 285.885)` | Primary button background (dark cool gray) |
| `--primary-foreground` | `oklch(0.985 0 0)` | Primary button text |
| `--secondary` | `oklch(0.967 0.001 286.375)` | Secondary button / muted surfaces |
| `--secondary-foreground` | `oklch(0.21 0.006 285.885)` | Secondary button text |
| `--muted` | `oklch(0.967 0.001 286.375)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.552 0.016 285.938)` | Muted text (descriptions, hints) |
| `--accent` | `oklch(0.967 0.001 286.375)` | Hover / focus accents |
| `--accent-foreground` | `oklch(0.21 0.006 285.885)` | Accent text |
| `--destructive` | `oklch(0.577 0.245 27.325)` | Destructive actions, errors |
| `--border` | `oklch(0.92 0.004 286.32)` | All borders, dividers |
| `--input` | `oklch(0.92 0.004 286.32)` | Input borders |
| `--ring` | `oklch(0.705 0.015 286.067)` | Focus ring |

### Dark mode

Defined in `packages/theme/src/styles.css` under `.dark`. Dark mode is **not** a saturation reduction — it is a full re-design of surfaces (near-black background, lighter borders at 10% opacity, primary inverts to near-white). Chart-1 in dark mode shifts to blue (`oklch(0.488 0.243 264.376)`) where light mode uses orange — colors are tuned per mode, not algorithmically derived. Do not add new theme tokens that only work in light mode without their dark counterpart.

### Chart palette (data visualization only)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--chart-1` | orange `oklch(0.646 0.222 41)` | blue `oklch(0.488 0.243 264)` | First series |
| `--chart-2` | teal `oklch(0.6 0.118 184)` | green `oklch(0.696 0.17 162)` | Second series |
| `--chart-3` | dark blue `oklch(0.398 0.07 227)` | mustard `oklch(0.769 0.188 70)` | Third series |
| `--chart-4` | yellow-green `oklch(0.828 0.189 84)` | magenta `oklch(0.627 0.265 303)` | Fourth series |
| `--chart-5` | mustard `oklch(0.769 0.188 70)` | red `oklch(0.645 0.246 16)` | Fifth series |

Chart colors are explicitly **not** for UI accents, badges, or marketing. If a UI element needs color emphasis, use `--primary` or `--destructive`. New "status" colors (warning, info, success) must be discussed and added to the table above before use.

### Selection (intentional bold choice)

Text selection is **pure black on white** in light mode and **pure white on black** in dark mode (`packages/theme/src/styles.css:139-158`). This is a deliberate minimalist statement — most products use a translucent accent. Do not change without explicit user approval.

### Hard color blacklist (never introduce)

* Purple / violet / indigo gradients of any kind
* Blue-to-purple or pink-to-orange brand gradients
* Decorative drop shadows (functional shadows on dialogs / popovers are fine)
* Soft pastels as functional UI color (sage green, blush pink, lavender — not Krafta's palette)
* Any green or red that competes with `--destructive` for action semantics

## Spacing

* **Base unit:** 4px (Tailwind default). All spacing is multiples of 4.
* **Density:** Comfortable for dashboard chrome (16px / `p-4` default card padding, `gap-3` between elements), tighter for data tables (`px-3 py-2` rows), generous for marketing surfaces (`py-16`+ on hero / sections).
* **Scale (use Tailwind tokens, do not invent):**
  * `space-0.5` (2) — internal type spacing only
  * `space-1` (4) — tight icon spacing
  * `space-2` (8) — between related controls
  * `space-3` (12) — default card internal padding
  * `space-4` (16) — between sections in a card
  * `space-6` (24) — between cards
  * `space-8` (32) — page-level vertical rhythm
  * `space-12` (48) — between major sections
  * `space-16` (64) — hero / page header breathing room
* **Max content width:** `1248px` (`max-w-[1248px]`) for dashboard pages with chrome (matches `apps/krafta/app/dashboard/[orgSlug]/[catalogSlug]/items/_components/items-panel.tsx:114`). Marketing / customer catalog can use wider hero sections.

## Layout

* **Approach:** Grid-disciplined for dashboard. Single-canvas (no side-by-side preview pane) for the Library editor — *the editor IS the customer view* per `~/.gstack/projects/mamaevbakh-krafta/bakh-dev-design-20260520-032237.md` P1.
* **Grid:** Tailwind responsive defaults. Dashboard pages use `mx-auto max-w-[1248px] px-6` outer wrap. Cards inside use flex layouts (`flex gap-3`) rather than CSS grid unless multi-column data demands it.
* **Border radius scale** (from `--radius: 0.625rem`):
  * `rounded-xs` (4px) — item cards in catalog (matches `card-default.tsx:11`)
  * `rounded-sm` (6px) — buttons (small), badges
  * `rounded-md` (8px) — buttons (default), inputs
  * `rounded-lg` (10px) — cards, dialogs, popovers
  * `rounded-xl` (14px) — large modal corners
  * `rounded-full` — avatars, pills, dot indicators
* **Mobile-first:** Every dashboard surface designs for 375px width first (the Tashkent iPhone SE / mid-range Android primary viewport). Desktop is a progressive enhancement, not the default.

## Navigation

The merchant dashboard chrome is a **left-side sidebar** built on shadcn `<Sidebar>` (`components/ui/sidebar.tsx`). Full IA spec lives in `docs/adr/0002-merchant-dashboard-navigation.md` (revised 2026-05-20). This section captures the visual + interaction rules.

* **Pattern source:** Square's dashboard sidebar. We adopt the chrome (workspace switcher + plan badge top, expandable sections, sticky primary CTA bottom, utility row) and adapt the items (sticky CTA is "Open shop" not "Take payment" because v1 is order-receiving).
* **Composition:** `<SidebarProvider><Sidebar><SidebarHeader/><SidebarContent/><SidebarFooter/></Sidebar></SidebarProvider>`. No custom sidebar primitive — extend shadcn's per the "Components & Composition" section above.
* **Desktop width:** ~240px expanded, ~64px icon-rail when collapsed (collapse state deferred per ADR §5).
* **Mobile (< 768px):** Sidebar collapses to a single hamburger button (top-left). Tapping opens the sidebar as an overlay (shadcn `<Sheet>` slot). One-tap access, zero permanent screen-space cost. Bottom-tab nav was considered and rejected (caps at 4-5 items, Krafta has 7 top-level sections).
* **Section expand/collapse state:** Persists per merchant in `localStorage`. Items section is expanded by default for v1.
* **Workspace switcher** at top: shows `Org · Catalog · Plan badge`. Plan badge is a real revenue surface — inline upgrade CTA routes to `/billing?upgrade=true`.
* **Search palette** below the workspace switcher. Cmd-K trigger. v1 scope: items only. Broader scope (orders, customers, all) deferred per ADR §5.
* **Sticky primary action** in `<SidebarFooter>`: "Open shop" — opens the customer-view of the catalog (`/[catalog-slug]`) in a new tab. Merchants use this constantly to verify the customer experience while editing. When merchant-side counter ordering ships (KRA-67 / KRA-74), this slot may flip to "+ New order".
* **Utility row** at the very bottom: small icon buttons for notifications, comments, help, future AI assistant. Touch target 44px.
* **View toggle inside a route:** Some routes host multiple views of the same data (e.g. Items › Library hosts Canvas + Table). The view toggle is a control inside the page (not a sidebar item). One sidebar entry, two visual modes. Linear's Board/List pattern. Toggle state persists per merchant.
* **Active route indicator:** subtle accent on the active sidebar item using `--accent` / `--accent-foreground` tokens. No bold colored left-border (that's in the AI Slop blacklist).

## Iconography

* **Source:** `lucide-react`. Always import from `lucide-react`, never inline SVG for icons that exist in lucide.
* **Sizing:** `size-4` (16px) inside buttons and inline with text. `size-5` (20px) for nav. `size-6` (24px) for prominent action triggers.
* **Color:** Inherit from text color (`currentColor`). Never give icons a brand-decoration color; if an icon needs to convey state, use `text-destructive`, `text-muted-foreground`, or theme-mapped tokens.
* **No emoji as design elements.** Emoji is OK in user-generated content (item names, descriptions). It is not OK in section headings, button labels, or design chrome.

## Motion

* **Approach:** Minimal-functional. Motion exists to support comprehension (state changes, sheet enter/exit, focus shifts) — never as decoration. `tw-animate-css` is imported but used sparingly.
* **Easing:**
  * Enter: `ease-out` (decelerate into rest)
  * Exit: `ease-in` (accelerate away)
  * Bidirectional / sustained: `ease-in-out`
* **Duration:**
  * Micro / state change: 100ms
  * Short / hover / focus: 150ms
  * Medium / sheet / popover enter: 200-250ms
  * Long / page transition: 350ms (use sparingly)
* **What we do not animate:** Scroll-linked parallax, decorative entrance choreography on marketing copy, anything autoplay-on-load that the user did not trigger.

## Forms

* Use the existing `components/ui/field.tsx`, `input.tsx`, `select.tsx`, `combobox.tsx`, `input-otp.tsx`, `switch.tsx`, `checkbox.tsx`. Do not introduce a new form primitive without checking these first.
* Labels are always visible (never placeholder-as-label). Placeholders provide examples, not field identity.
* Error messages are concrete and actionable. Generic "Invalid input" violates this system.
* Touch targets ≥ 44px on mobile.

## Internationalization (Krafta-specific)

* **Default locale:** Russian (`ru`). Active for most existing Uzbek merchants.
* **Supported locales:** RU, UZ (Latin), EN. UZ Cyrillic is **not** supported in v1.
* **All UI strings** route through the i18n system in `packages/theme` or app-level locale modules — never hardcode user-facing English in components.
* **Text rendering:** UZ text contains Latin extended characters (Oʻ, gʻ, sh, ch) that some fonts render poorly. Geist Sans handles them correctly — verify before substituting any font.
* **Per-field translation fallback:** When the active locale lacks a translation for a field, render the default-locale value in italics as a visible hint. Never silently fall back (per design doc P2 / ER5).
* **Currency:** UZS / Uzbek sum. Always rendered with comma thousands separator and no decimal places: `25,000`, `1,250,000`. Use `font-mono tabular-nums` for any context where multiple prices stack (tables, columns, item lists).

## Anti-Slop Guardrails (hard rules)

A design choice that violates any of these is a regression. Reject in code review or QA.

1. **No purple, violet, or indigo gradients anywhere.** Krafta's palette is neutral with one orange chart accent.
2. **No 3-column feature grid with icons-in-colored-circles.** The single most recognizable AI-generated SaaS pattern.
3. **No centered-everything layouts** in dashboard or customer catalog. (The marketing landing page hero is the lone exception and is intentional.)
4. **Cards earn their existence.** A card has a border AND contains an interaction or a logical unit of content. Decorative cards are forbidden.
5. **No decorative blobs, floating circles, wavy SVG dividers, gradient meshes.** If a section feels empty, the content is wrong — not the decoration.
6. **No `system-ui` or `-apple-system` as the primary font.** That is the "I gave up on typography" signal. Krafta uses Geist; use Geist.
7. **No emoji in chrome.** Item names and descriptions can contain emoji (user content). Section titles, button labels, nav items cannot.
8. **No `font-extrabold` or `font-black`.** The brand wordmark is the only display-weight thing; everything else tops out at `font-semibold`.
9. **No drop shadows as decoration.** Functional elevation on popovers / dialogs / dropdowns is fine; "elevated card" aesthetic is not.
10. **No `text-center` on body paragraphs.** Center-align headings sparingly; never center body copy.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-20 | Initial DESIGN.md created via /design-consultation | Reverse-engineered from existing `packages/theme/`, `apps/krafta/app/globals.css`, `app/fonts.ts`, `components/brand/`. Formalized so /plan-design-review and future surfaces calibrate against a stated system. |
| 2026-05-20 | Helvetica Neue Bold for brand wordmark only | Deliberate dissonance against Geist body. Brand has its own voice; functional UI does not. |
| 2026-05-20 | oklch as the only color space in tokens | Modern perceptual uniformity. Better dark-mode tuning than HSL. |
| 2026-05-20 | Pure black/white selection inversion | Bold minimalist choice. Most products use translucent accent. Krafta's selection is a statement. |
| 2026-05-20 | `font-mono tabular-nums` for all UZS prices | Tashkent prices reach millions of sums. Mono numerals prevent jitter in tables and align columns. |
| 2026-05-20 | shadcn/ui at 100%, composition over configuration | All UI primitives are shadcn (style `new-york`, base `zinc`, RSC, lucide icons). Compound APIs + `asChild` + cva variants over boolean prop sprawl. Custom primitives extend shadcn, never compete with it. |
| 2026-05-20 | Sidebar chrome over top-bar | Pivot from ADR 0002 original draft (top-bar) to sidebar (Square pattern). Workspace switcher + plan badge top, expandable sections, sticky "Open shop" CTA, utility row, Notion-style mobile overlay. Full IA in `docs/adr/0002-merchant-dashboard-navigation.md`. |
| 2026-05-20 | Items › Library hosts Canvas + Table via inline view toggle | KRA-35 ships the new visual editor as the Canvas view. Current DataTable UX preserved as Table view (sibling component, not retired). View toggle inside Library, persists per merchant in localStorage. Categories stays a sibling page, unchanged. |
| 2026-05-20 | KRA-35 Iter 2 pivot: inline-edit canvas → "compact list + fullscreen EditorSheet" | KRA-35 v1 ambition was "editor IS the customer view" (Notion-style inline editing on the actual cards). Merchant feedback after v1 shipped: inspector too cramped, inline-edit unnecessary friction. Iter 2 walks back to a more conventional Square-style pattern: compact 56px rows (no inline edit) + fullscreen right-side Sheet for editing. `InlineText` / `InlineCurrency` primitives kept for future settings surfaces but unused on the canvas. Validated via /plan-design-review (6/10 → 9/10, 6 decisions). |
| 2026-05-20 | Iter 2 D2C — explicit Save replaces autosave | POS/commerce surfaces favor an explicit Save button over autosave + per-field chips. Merchants expect to deliberately commit changes; autosave creates anxiety more than convenience. Save batches all dirty fields into one updateItem call. Closing the EditorSheet with dirty state triggers an AlertDialog confirmation. |
| 2026-05-20 | Iter 2 D5 — view toggle bottom-floating pill | Canvas/Table view toggle restyled as fixed-position floating pill at bottom-center (rounded-full, backdrop blur, functional shadow-sm). Removed the top strip from iter 1. Hidden on mobile (mobile is always Canvas). |
| 2026-05-20 | Iter 2 D4 + Pass 1 D1A — collapsible categories + subordinate-inset rail | Each CategorySection gets a chevron toggle; collapse state persists per (catalog, category) in localStorage. New CategoryRail (180px sticky list of category names, click to scroll) lives in the canvas page's left padding — no border-r, no separate surface color, so it reads as "document gutter" rather than competing with the dashboard sidebar. Hidden ≤ xl (1280px). |
| 2026-05-22 | Square POS dashboard adopted as canonical design reference | When designing merchant-facing catalog / POS / editor surfaces, look at Square's equivalent screen FIRST. Generic shadcn defaults are the floor; Square's patterns are the ceiling. Concrete patterns absorbed listed in the "Design references" section below. |
| 2026-06-09 | Telegram Mini App storefront chrome: progressive blur + frosted dock, no Liquid Glass | Customer storefront in the TMA gets an iOS-style **progressive (gradient) blur** behind the sticky category nav (`components/catalogs/progressive-blur.tsx` — stacked backdrop-filter layers masked to a top-down falloff; alpha falloff, not a color gradient) instead of a hard uniform `backdrop-blur` edge. The bottom dock becomes a clean **frosted** surface (border + strong blur, no decorative shadow). Deliberately did NOT chase iOS 26 "Liquid Glass": a Mini App is a webview (no native tabs possible) and a glossy translucent skin fights the "brutally minimal, withholding" system. Decided via /design-consultation. |

## Design references

When designing **merchant-facing catalog / POS surfaces** — item editor, modifiers,
variations, categories, table view, KDS, anywhere the merchant is configuring their
shop — **Square's POS dashboard is the canonical reference.** Beats generic shadcn
defaults across the board. When the user asks for a richer / better UI than what
you've proposed, the answer is usually "look at how Square does it."

### Patterns we've absorbed

These are the specific Square shapes already implemented in the codebase. Reach
for them by name before inventing new ones.

#### Row-based attachment editor (with overrides)

The `ModifierListsAttachment` pattern (`items/_components/modifier-lists-attachment.tsx`):

- Each attached entity = a **full row**, not a chip. Anatomy:
  `drag handle | name (bold) + subtitle preview (e.g. "Choco, Strawberry, Lemon") | right-aligned min/max chip ("1 min/10 max", "Optional", "Required") | gear icon (per-row overrides) | trash icon (detach)`
- **Header** carries an `Edit` button when populated, a small `Add` pill when empty.
- Per-row **gear popover** for overriding entity-level defaults on this row only.
  Each input shows the parent default ("default: N") so the merchant sees what
  they're overriding. A `Reset to default` clears all overrides at once.
- **Drag-reorder** via dnd-kit when an `ordinal` column exists on the join table.
  Persist on Save by recomputing ordinals from array index.
- **Customization signal**: when any override is set, the row shows a "Customized"
  or "Hidden from customers" badge. Subtle, not loud.

Use for: modifiers attached to items, variations attached to items, any
many-to-many editable join with per-row metadata.

#### Add-to-set Dialog (not popover combobox)

The `AddModifiersDialog` pattern (same file):

- Centered shadcn `Dialog`, not a Command popover. The popover-combobox is wrong
  for sets of >5 items — Square uses a full-bleed Dialog every time.
- **Top-left X** close (icon button, ghost), **top-right black "Done" pill**.
  `Done` commits the checkbox selection; X discards.
- Checkbox list with **bold name + truncated subtitle** ("Choco, Strawberry,
  Lemon"). Whole row is clickable (label wraps the checkbox).
- Empty state links to the management page where the merchant can create more.
- Use `modal` prop on `Popover` root when nested inside a vaul `Drawer` — without
  it the Drawer's focus trap eats scroll-wheel events.

#### Fullscreen editor Dialog

Override `DialogContent` to flip shadcn's centered `max-w-lg` default into a
viewport-filling editor:

```tsx
<DialogContent
  showCloseButton={false}
  className={cn(
    "top-0 left-0 translate-x-0 translate-y-0",
    "h-screen w-screen max-w-none sm:max-w-none",
    "rounded-none border-0 p-0 gap-0 flex flex-col",
  )}
>
```

Render a custom header with title + dirty-count badge + Save + custom X. Wire
the X through a dirty-state confirm. Live in
`translations/_components/translation-edit-dialog.tsx` and
`items/modifiers/_components/modifier-list-editor-dialog.tsx`.

#### Empty-state header pattern

When a section has no content yet (no modifiers, no variations):

```
┌──────────────────────────────────────────────────┐
│ Modifiers                                  [Add] │
│ Allow customizations such as add-ons or          │
│ special requests.                                │
└──────────────────────────────────────────────────┘
```

Title left, subtitle one line below in muted text, small `Add` pill (h-8,
rounded-full) top-right. No card border around the empty state itself.

#### Currency-aware price input

Wrap an `InputGroup` with `InputGroupInput` + `InputGroupAddon` showing the
currency label (`UZS` suffix for sum, `$` prefix for USD). Format with
`formatPriceInputValue` + `parsePriceInput` from `lib/catalogs/pricing.ts` so the
merchant reads "3,000 UZS" or "$15.00" depending on the catalog's settings. Same
helpers the variations editor uses — don't hand-roll currency formatting.

### How to think about it

When in doubt, look at Square's equivalent screen first. If our schema has
columns sitting unused (override columns, ordinal, per-row toggles like
`hidden_from_customer_override`), that's almost always a Square pattern we
haven't built yet — activate them in the UI.

**Pasting a Square screenshot directly into a request is the highest-bandwidth
input.** The agent matches the spacing, button shapes, header layout etc. much
closer from an image than from prose. Drop a screenshot before asking for a
redesign.
