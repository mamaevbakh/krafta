# ADR 0002 — Merchant Dashboard Navigation Tree

**Status:** Draft (proposal). Drafted 2026-05-08. **Revised 2026-05-20** — pivoted from top-bar to sidebar chrome; added workspace switcher, search, utility row, sticky CTA; clarified Items children retain both Canvas and Table views via inline toggle.
**Related:** ADR 0001 (orders & catalog schema v1), [KRA-32](https://linear.app/krafta/issue/KRA-32), [KRA-37](https://linear.app/krafta/issue/KRA-37), [KRA-34](https://linear.app/krafta/issue/KRA-34), [KRA-35](https://linear.app/krafta/issue/KRA-35) (Library canvas), [KRA-74](https://linear.app/krafta/issue/KRA-74) (Bar mode), [KRA-76](https://linear.app/krafta/issue/KRA-76) (nav tree implementation).

## 1. Context

The Studio has accumulated routes ad hoc as features landed: Overview, Categories, Items, Studio (Builder), Billing, Settings, plus the new Orders surface from KRA-32. There's no second-level structure — every concept is a top-level link. As we add Modifiers, Discounts, Taxes & Service Fees, Customers, Reports, and per-mode workflows (Bar, Retail), the flat top bar will get unwieldy.

The user asked for a "logical tree" anchored in Square's information architecture. The Square nav was researched and confirmed against [Square's Help Center](https://squareup.com/help) and [Developer docs](https://developer.squareup.com/docs/devtools/seller-dashboard); see Appendix A for the source map.

**2026-05-20 revision context.** During /office-hours and /plan-eng-review for KRA-35 (the Library canvas), the navigation chrome was re-examined alongside the Items sub-tree. Two structural changes were locked:

1. **Top-bar → sidebar primary chrome.** Items alone is heading toward 5+ siblings (Library, Categories, Modifiers, Discounts, Taxes & Fees) and Settings + Studio + Orders are similar. Top-bar sub-nav strips cap at ~3-4 visible siblings without horizontal scroll. Sidebar expandable sections scale to 10+ siblings cleanly and match the depth Square's nav reaches. The previous "sub-nav primitive" plan (§4 slice 1, original draft) is replaced by the sidebar.
2. **Items children include both new and current surfaces, not a replacement.** KRA-35 ships a new Library canvas, but the current `/items` DataTable UX and current `/categories` page are preserved as alternatives (different jobs: scan vs author). Library and Table become two views of the same data, exposed via an inline view toggle inside the Items › Library route. Categories remains a dedicated sibling page (matches §4.2 migration, no redesign needed).

Design constraints we're committing to:

1. **Match Square's mental model where it serves us**, not where it carries POS-specific noise (Square's nav still has 2010-era seams: Items vs Inventory split, Online as a sibling of Items, etc.).
2. **One concept per second-level page.** No Square-style "Items › Settings › Item defaults" three-deep crumbs — those become tabs inside the parent page.
3. **Navigation reflects current capability**, not future plans. Sections we don't ship for v1 don't get parking-lot links.
4. **The Orders / Items / Settings hierarchy must hold up when the Bar / Retail / Bookings modes ship later** ([KRA-74](https://linear.app/krafta/issue/KRA-74)). Mode-specific sub-surfaces hang off the main concept, not as parallel top-level routes.
5. **Sidebar chrome on desktop, overlay on mobile.** Notion pattern: sidebar visible by default on desktop, collapsible. On mobile (< 768px), sidebar collapses to a single hamburger that opens an overlay (not a permanent bottom-tab bar, which caps at 4-5 items). One-tap access, no permanent screen-space cost. Touch targets ≥ 44px per DESIGN.md.

## 2. Decision: target navigation tree

Five top-level sections at v1 launch. Two more (**Customers**, **Reports**) move from "later" to "v1.5" once they have anything to render. **Marketing**, **Loyalty**, **Apps**, **Team** wait until the corresponding feature work starts.

The chrome itself is a left-side sidebar with the following structure:

```
┌──── Sidebar (desktop: ~240px, mobile: overlay) ─────┐
│ Workspace switcher (org · catalog · plan badge)     │  ← top
│   "Krafta · Tashkent Coffee · Free · Upgrade"       │
├─────────────────────────────────────────────────────┤
│ Search (cmd-K palette trigger)                      │
├─────────────────────────────────────────────────────┤
│ Overview                                            │  ← KPIs for today + activity feed
│ Orders                                       ▾      │
│   Live                                              │  ← state=open queue (current default)
│   History                                           │  ← state in (completed, canceled)
│   Transactions                                      │  ← commerce.order_payments — money, not orders
│ Items                                        ▾      │
│   Library                                           │  ← /items — Canvas/Table view toggle inside (KRA-35)
│   Categories                                        │  ← /items/categories (existing page, just moved)
│   Modifiers                                         │  ← modifier_lists + modifiers (KRA-35b / KRA-62)
│   Discounts                                         │  ← public.discounts (KRA-63)
│   Taxes & Fees                                      │  ← public.taxes incl. service_fee kind (KRA-63)
│ Studio                                       ▾      │
│   Structure                                         │  ← existing Studio Builder section
│   Cards                                             │
│   Brand                                             │
│   Pricing                                           │
│   Cart                                              │  ← existing — Cart enable toggle
│ Settings                                     ▾      │
│   Venue                                             │  ← public.venues row (modes, hours, currency, KRA-34)
│   Account                                           │
│   Organization                                      │
│   Notifications                                     │  ← chime mute, email digest, Telegram (KRA-65 / KRA-66)
│ Billing                                             │
├─────────────────────────────────────────────────────┤
│ Sticky primary action: 🛒 Open shop                 │  ← opens customer-view of /[catalog-slug] in new tab
├─────────────────────────────────────────────────────┤
│ Utility row: 🔔  💬  ?  ✨                          │  ← notifications, comments, help, AI sparkle (future)
└─────────────────────────────────────────────────────┘
```

Expandable sections persist their open/closed state in localStorage. The Items section is expanded by default for v1 since merchants spend most time there.

### Workspace switcher + plan badge

The workspace switcher carries three pieces of information at the top of the sidebar:

* **Organization name** (e.g. "Krafta") — the org the merchant is logged into. Click opens an org switcher dropdown if the merchant belongs to multiple orgs.
* **Active catalog** (e.g. "Tashkent Coffee") — the catalog scope for everything below. Click opens a catalog switcher when an org has multiple catalogs (KRA-71 territory).
* **Plan badge** (e.g. "Free · Upgrade →") — current Billing plan with an inline upgrade CTA. Real revenue surface. Routes to `/dashboard/[org]/[catalog]/billing` on click. Mirrors Square's "Free · See Plans" pattern.

### Sticky "Open shop" primary action

Square uses sticky "Take payment" at the bottom of the sidebar — the merchant's #1 action (typing in a counter order) is always one click away. Krafta v1 is order-RECEIVING (customer orders via web/TMA), not order-CREATING by the merchant, so "Take payment" doesn't fit yet. The v1 equivalent of "always-accessible primary action" is **"Open shop"** — opens the customer-view of the catalog (`/[catalog-slug]`) in a new tab. The merchant uses this constantly to verify the customer experience while editing. When merchant-side counter ordering ships (KRA-67 / KRA-74 territory), this slot may flip to a "+ New order" action.

### Utility row

Bottom row of small icon buttons for cross-cutting micro-actions that don't deserve top-level sidebar real estate: notifications dropdown, comments/feedback, help, future AI assistant. Touch target 44px per DESIGN.md.

### Why these names, mapped to Square

| Krafta | Square equivalent | Why we differ (if we do) |
|---|---|---|
| Sidebar chrome | Sidebar with workspace switcher + search + utility row | Same pattern. We use "Open shop" as the sticky CTA instead of Square's "Take payment" because v1 is order-receiving, not order-creating. |
| Items (top-level) | Items & inventory | We drop "& inventory" because Krafta v1 has no inventory schema. When inventory ships, may rename or split. |
| Items › Library | Items › Item library | Same. Krafta's Library has an inline Canvas/Table view toggle (see below). |
| Items › Library / Canvas view | (Square has no equivalent) | KRA-35's new in-place WYSIWYG canvas. Krafta-specific differentiation. |
| Items › Library / Table view | Square's default Item library | Preserves the existing `/items` DataTable UX as a sibling view. Power-user surface for scan / sort / bulk select. Toggle persists in localStorage. |
| Items › Categories | Items › Categories | Same. Standalone page, not collapsed into the canvas. Current `apps/krafta/app/dashboard/[orgSlug]/[catalogSlug]/categories/page.tsx` moves to `/items/categories` per §4.2; UI itself is preserved unchanged. |
| Items › Modifiers | Items › Modifiers | Same. Implementation in KRA-35b. |
| Items › Discounts | Items › Discounts | Same. |
| Items › Taxes & Fees | Items › Service charges + (separate) Taxes | We collapse — our schema (Migration 3) folds taxes and service fees into one table with a `kind` discriminator (ADR 0001 §7 Q3). One page for both. |
| Orders › Live | Orders › Active / Open orders | Same idea, shorter label. |
| Orders › History | Orders › Completed / Shipments | "History" is mode-agnostic; "Shipments" is delivery-coloured. |
| Orders › Transactions | Payments › Transactions | Square splits Orders and Payments at the top level; they live in different sidebars. We promote Transactions as a sibling under Orders because for cash-only v1 the relationship is 1:1 and merchants think "the order's payment", not "an unrelated payment object". When card-on-file / refunds / disputes get real (v2 with Krafta Pay), Transactions will likely move to a Payments top-level — see §5 deferred decisions. |
| Settings › Venue | Settings › Locations + Restaurant settings + Service settings | Square spreads location identity across three areas. We have one row (`public.venues`, 1:1 with catalog per ADR 0001 §7 Q1) so it's one page. |
| Settings › Notifications | Settings › Account → notifications + per-venue mute (mixed) | Single page, scoped to the active catalog. |
| (Studio remains its own top-level) | Square Online editor (in Square's "Online" section) | Krafta's Studio is the brand surface; it deserves a top-level slot. Square treats site editor as a sub-feature of Online; we treat it as the default editor for every catalog. |
| Workspace switcher · plan badge | Square's "Krafta · Free · See Plans" pattern | Same. Real revenue surface; inline upgrade CTA. |
| Sticky "Open shop" | Square's "Take payment" | Different action because Krafta v1 is order-receiving. Same pattern (sticky always-accessible primary action). |
| Mobile: overlay sidebar | Square: overlay sidebar | Same. Hamburger top-left opens the sidebar as an overlay. Bottom-tab nav considered and rejected (caps at 4-5 items, Krafta has 7 top-level sections). |

### What's deliberately not on the tree at launch

- **Customers** — nothing renders today. The `commerce.customers` table exists and is populated by the cart flow, but until there's a directory page, an order detail link, or a marketing surface to attach it to, the link is a parking lot. v1.5 ([KRA-69](https://linear.app/krafta/issue/KRA-69) cancellation notification will need this anyway).
- **Reports** — same. We can sum line items + payments client-side in detail sheets; a real Reports surface waits until it's worth more than a 30-minute scratch query.
- **Inventory** — schema doesn't exist yet. Square has it; we don't (and might not for v1).
- **Marketing / Loyalty** — out of v1 scope.
- **Apps & Integrations** — nothing to integrate yet beyond Krafta Pay (which is a separate product surface, not a third-party).
- **Team / Permissions** — orgs have one role today. Multi-role is post-launch.
- **Square's "Add more"** — Square monetizes app marketplace; we have no third-party app surface in v1.

## 3. Modes — Square's "Select a mode" pattern, mapped to Krafta

Square's POS modes (Standard / Quick service / Full service / Bar / Retail / Bookings / Services) live at **Settings → Device management → Modes** and are tied to the device, not the merchant or venue. Switching a mode swaps the POS surface and unlocks Restaurants- or Retail-only settings panels. Modes are not composable.

We don't have a POS app; modes for us are a different concept. Two layers:

1. **Catalog mode** (chosen at catalog creation, editable in Settings → Venue): determines which fulfillment modes are enabled on the customer surface and which features the Studio surfaces. Equivalent of Square's "what kind of business is this".
2. **Per-order fulfillment mode** (`dine_in` | `pickup` | `delivery` | `digital`): chosen at customer checkout. Already shipped via `venue.modes_enabled` + the cart's mode picker.

For v1 we have *one* catalog mode — the implicit "general" / "restaurant-ish" — and three fulfillment modes. **Bar mode** ([KRA-74](https://linear.app/krafta/issue/KRA-74)) is the first time we'd ship a real second catalog mode, and when it does it should:

- Live under **Settings → Venue → Mode** as a single picker (matching Square's pattern but at venue scope, not device scope).
- Toggle which fulfillment modes default on (Bar: tabs / table); which Studio sections are relevant (Bar wants speed-typing, hides delivery-address fields); which dashboard tabs default-render (Bar's "Open tabs" view per [KRA-67](https://linear.app/krafta/issue/KRA-67)).
- **Not** be a separate top-level dashboard surface. The merchant chooses once, the rest of the app reflects it.

## 4. Implementation slices

The current top bar (`apps/krafta/components/dashboard/dashboard-navbar-client.tsx`) renders a flat list of segments. To get to the target tree we need:

1. **Sidebar chrome primitive.** Replace the top-bar with shadcn `<Sidebar>` + `<SidebarProvider>` (already in `components/ui/sidebar.tsx`). Compound API: `<SidebarHeader>` (workspace switcher + plan badge), `<SidebarContent>` (search + sections), `<SidebarFooter>` (sticky "Open shop" + utility row). Per DESIGN.md "Components & Composition" section — shadcn at 100%, no competing libraries. Mobile: collapses to overlay via shadcn's built-in `<SidebarTrigger>` (hamburger button) and `<Sheet>` overlay. Persistence: `localStorage` for expanded/collapsed section state per merchant.
2. **Migrate Categories under Items.** Today `/dashboard/[org]/[catalog]/categories` is a sibling of `/items`. New URL: `/dashboard/[org]/[catalog]/items/categories`. The current `/categories` route stays as a 308 permanent redirect for one release. **The page content itself is preserved unchanged** — current `CategoriesPanel` moves intact, no redesign. (KRA-35c — the previously-planned Categories sibling redesign — is canceled; current UI is good enough for v1.)
3. **Add Items › Modifiers / Discounts / Taxes & Fees.** Each is a new route under Items. They render in the order they're built ([KRA-35b](https://linear.app/krafta/issue/KRA-35) for modifier list management, [KRA-63](https://linear.app/krafta/issue/KRA-63) for discounts + taxes/fees). Until then, the link is hidden, not greyed out.
4. **Items › Library: Canvas/Table view toggle.** New `/dashboard/[org]/[catalog]/items` (Library) page hosts both views. Default = Canvas (KRA-35 new visual editor). Toggle button in page header switches to Table (current 166-line `ItemsPanel` DataTable, preserved as a sibling component). View choice persists in localStorage per merchant. On mobile (< 768px), Table view is disabled / shown as read-only — DataTable doesn't fit a 375px viewport, and the canvas is mobile-first per KRA-35 design doc. Implementation lands in KRA-35 PR 3 (view-toggle UI) alongside the canvas in PR 2.
5. **Add Orders → History / Transactions.** Today the orders page filters Open vs. Completed via tab cards. Promote each tab to its own URL (`/orders/live`, `/orders/history`, `/orders/transactions`) so deep-links work and the second-level nav has somewhere to point.
6. **Workspace switcher + plan badge.** New `<WorkspaceSwitcher>` component in `<SidebarHeader>` showing org · catalog · plan. Plan badge reads from billing state, routes to `/billing` with `?upgrade=true` query param on click. KRA-71 (multi-venue) and KRA-72 (org switcher) eventually plug in here.
7. **Sticky "Open shop" primary action.** `<SidebarFooter>` button that opens `https://krafta.app/[catalog-slug]` (or the local equivalent) in a new tab. Stays accessible at all viewport sizes. Replaces Square's "Take payment" until counter-order entry exists.
8. **Settings → Venue.** Lands as part of [KRA-34](https://linear.app/krafta/issue/KRA-34). The current Settings page becomes a wrapper that defaults to Venue.

This isn't a single refactor PR — slices 1, 6, 7 (sidebar chrome, workspace switcher, sticky CTA) ship together as the [KRA-76](https://linear.app/krafta/issue/KRA-76) sidebar migration. Slices 2-5 follow the feature work that owns each route. The ADR exists so each PR knows where its surface lives.

## 5. Deferred decisions

These deserve their own ADRs when the feature work starts; this one shouldn't pre-decide them.

- **Transactions vs Payments hierarchy.** When card-on-file (Krafta Pay), refunds, disputes, and payouts are real, do we promote Payments to its own top-level (Square pattern) or keep it tucked under Orders? Recommendation when revisiting: promote.
- **Per-mode catalog (Bar / Retail / Bookings).** The Square mode-picker UI is great; the question is when we have a second mode worth picking. [KRA-74](https://linear.app/krafta/issue/KRA-74) is the first.
- **Multi-venue navigation.** Today the catalog/venue switcher in the top bar handles single-org-many-catalogs. When an org has 5 venues, the org-wide Orders aggregation ([KRA-71](https://linear.app/krafta/issue/KRA-71)) needs a different shape — possibly a top-level "All venues" mode with venue filters, similar to Square Locations.
- **Onboarding / first-run wizard structure.** Square inserts mode selection + menu naming as gated wizard steps before the dashboard renders. We have [KRA-16](https://linear.app/krafta/issue/KRA-16) / [KRA-42](https://linear.app/krafta/issue/KRA-42) for this; the wizard's step sequence should be designed against the tree above so post-onboarding the merchant lands on the right page.
- **Mobile bottom-tab nav as v1.5 alternative.** If the overlay-sidebar pattern proves slow / clunky in the field, a bottom-tab bar (Overview + Orders + Items + Studio + More) is the fallback. Caps at 5 items so secondary surfaces (Settings, Billing, plan upgrade) go under "More". Defer until we have real Tashkent merchant usage data.
- **Sidebar collapse to icon-rail.** Shadcn's `<Sidebar>` supports a collapsed icon-only state. For desktop power users who want more horizontal canvas space (the Library canvas especially benefits), expose a collapse button in `<SidebarHeader>` and persist the state. Defer the UX detail until KRA-76 lands the base chrome.
- **Search palette scope.** Cmd-K in the sidebar header — does it search items, categories, orders, customers, all of the above? Defer until there's enough data to justify scoping; v1 may ship the chrome with a "Search items" scope only and broaden later.

## Appendix A — Square source map

Confirmed against Square Help Center + Developer docs (May 2026):

```
Items / Catalog              squareup.com/help/us/en/article/5115
  Item library
  Categories                 .../article/8024
  Modifiers                  .../article/5119
  Item options               .../article/6689
  Discounts
  Service charges            (Restaurants context)
  Vendors                    .../article/5958
Inventory management
  Stock overview             .../article/8331
  Purchase orders            .../article/8262
Orders
  Active / Open orders       .../article/8326
  Completed / Shipments
  Fulfillment settings       .../article/8326
Payments
  Transactions               .../article/3882
  Disputes                   .../article/3882
  Risk Manager               .../article/6816
  Invoices, Subscriptions, Gift cards, Online Checkout, Deposits
Customers
  Directory                  developer.squareup.com/docs/devtools/seller-dashboard
  Groups, Loyalty            .../article/3952
Reports
  Sales summary              .../article/8363
  Sales by item / category / modifier
  Payment methods, Team, Channel
Online
  Edit Site                  .../article/7797
  Online items               .../article/7982
  Fulfillment / QR ordering  .../article/7142
Team
  Members, Permissions, Schedules, Payroll, Commissions
Settings
  My business / Locations    .../article/3861, .../article/5580
  Devices                    .../article/8339
  Device management → Modes  .../article/8458   ← the seven-mode picker
  Restaurant settings → Service settings → Bar tabs pre-auth
                             .../article/8455   ← Bar mode pre-auth
```

Sources for catalog mode behavior:
- [Use modes with Square Point of Sale](https://squareup.com/help/us/en/article/8458-use-modes-with-square-point-of-sale)
- [Bar Tabs with Pre-Authorization](https://squareup.com/help/us/en/article/8058-bar-tabs-with-pre-authorization-for-square-point-of-sale)
- [Updated Square POS and Dashboard app](https://squareup.com/us/en/the-bottom-line/inside-square/updated-square-pos-and-square-dashboard-app)

App Clips status (for [KRA-75](https://linear.app/krafta/issue/KRA-75)): Square has no first-party App Clip product. Third-party platforms (e.g. Flash Order) ship App Clip ordering with Stripe as the default processor, Square only via custom integration. Apple App Clips are iOS-only (≤10 MB, iOS 14+); Android equivalent (Instant Apps) does not support payments natively and is effectively de-prioritised by Google.

## 6. Revision history

- **2026-05-08** — Initial draft (top-bar primary chrome, sub-nav primitive, Categories migration, Items children, Orders/Transactions promotion).
- **2026-05-20** — Pivoted top-bar to sidebar chrome (Square pattern). Added workspace switcher + plan badge, search palette, sticky "Open shop" CTA, utility row. Clarified Items › Library hosts both Canvas (KRA-35 new) and Table (current DataTable) views via inline toggle. Canceled KRA-35c (Categories sibling redesign) — current page preserved unchanged. Locked Notion-style mobile overlay pattern. Locked Items, Studio, Settings as expandable sections with localStorage persistence.
