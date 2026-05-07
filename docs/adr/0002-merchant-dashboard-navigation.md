# ADR 0002 — Merchant Dashboard Navigation Tree

**Status:** Draft (proposal). Drafted 2026-05-08.
**Related:** ADR 0001 (orders & catalog schema v1), [KRA-32](https://linear.app/krafta/issue/KRA-32), [KRA-37](https://linear.app/krafta/issue/KRA-37), [KRA-34](https://linear.app/krafta/issue/KRA-34), [KRA-74](https://linear.app/krafta/issue/KRA-74) (Bar mode).

## 1. Context

The Studio has accumulated routes ad hoc as features landed: Overview, Categories, Items, Studio (Builder), Billing, Settings, plus the new Orders surface from KRA-32. There's no second-level structure — every concept is a top-level link. As we add Modifiers, Discounts, Taxes & Service Fees, Customers, Reports, and per-mode workflows (Bar, Retail), the flat top bar will get unwieldy.

The user asked for a "logical tree" anchored in Square's information architecture. The Square nav was researched and confirmed against [Square's Help Center](https://squareup.com/help) and [Developer docs](https://developer.squareup.com/docs/devtools/seller-dashboard); see Appendix A for the source map.

Design constraints we're committing to:

1. **Match Square's mental model where it serves us**, not where it carries POS-specific noise (Square's nav still has 2010-era seams: Items vs Inventory split, Online as a sibling of Items, etc.).
2. **One concept per second-level page.** No Square-style "Items › Settings › Item defaults" three-deep crumbs — those become tabs inside the parent page.
3. **Navigation reflects current capability**, not future plans. Sections we don't ship for v1 don't get parking-lot links.
4. **The Orders / Items / Settings hierarchy must hold up when the Bar / Retail / Bookings modes ship later** ([KRA-74](https://linear.app/krafta/issue/KRA-74)). Mode-specific sub-surfaces hang off the main concept, not as parallel top-level routes.

## 2. Decision: target navigation tree

Five top-level sections at v1 launch. Two more (**Customers**, **Reports**) move from "later" to "v1.5" once they have anything to render. **Marketing**, **Loyalty**, **Apps**, **Team** wait until the corresponding feature work starts.

```
Overview                           ← KPIs for today + activity feed
Orders
  ├── Live                         ← state=open queue (current default)
  ├── History                      ← state in (completed, canceled)
  └── Transactions                 ← commerce.order_payments — money, not orders
Items
  ├── Library                      ← items + their default variation
  ├── Categories
  ├── Modifiers                    ← modifier_lists + modifiers (KRA-35 / KRA-62)
  ├── Discounts                    ← public.discounts (KRA-63)
  └── Taxes & Fees                 ← public.taxes incl. service_fee kind (KRA-63)
Studio
  ├── Structure                    ← (existing Studio Builder section)
  ├── Cards
  ├── Brand
  ├── Pricing
  └── Cart                         ← (existing — Cart enable toggle)
Settings
  ├── Venue                        ← public.venues row (modes, hours, currency, KRA-34)
  ├── Account
  ├── Organization
  └── Notifications                ← chime mute, email digest, Telegram (KRA-65 / KRA-66)
Billing                            ← unchanged
```

### Why these names, mapped to Square

| Krafta | Square equivalent | Why we differ (if we do) |
|---|---|---|
| Orders › Live | Orders › Active / Open orders | Same idea, shorter label. |
| Orders › History | Orders › Completed / Shipments | "History" is mode-agnostic; "Shipments" is delivery-coloured. |
| Orders › Transactions | Payments › Transactions | Square splits Orders and Payments at the top level; they live in different sidebars. We promote Transactions as a sibling under Orders because for cash-only v1 the relationship is 1:1 and merchants think "the order's payment", not "an unrelated payment object". When card-on-file / refunds / disputes get real (v2 with Krafta Pay), Transactions will likely move to a Payments top-level — see §5 deferred decisions. |
| Items › Library | Items › Item Library | Same. |
| Items › Categories | Items › Categories | Same. |
| Items › Modifiers | Items › Modifiers | Same. |
| Items › Discounts | Items › Discounts | Same. |
| Items › Taxes & Fees | Items › Service charges + (separate) Taxes | We collapse — our schema (Migration 3) folds taxes and service fees into one table with a `kind` discriminator (ADR 0001 §7 Q3). One page for both. |
| Settings › Venue | Settings › Locations + Restaurant settings + Service settings | Square spreads location identity across three areas. We have one row (`public.venues`, 1:1 with catalog per ADR 0001 §7 Q1) so it's one page. |
| Settings › Notifications | Settings › Account → notifications + per-venue mute (mixed) | Single page, scoped to the active catalog. |
| (Studio remains its own top-level) | Square Online editor (in Square's "Online" section) | Krafta's Studio is the brand surface; it deserves a top-level slot. Square treats site editor as a sub-feature of Online; we treat it as the default editor for every catalog. |

### What's deliberately not on the tree at launch

- **Customers** — nothing renders today. The `commerce.customers` table exists and is populated by the cart flow, but until there's a directory page, an order detail link, or a marketing surface to attach it to, the link is a parking lot. v1.5 ([KRA-69](https://linear.app/krafta/issue/KRA-69) cancellation notification will need this anyway).
- **Reports** — same. We can sum line items + payments client-side in detail sheets; a real Reports surface waits until it's worth more than a 30-minute scratch query.
- **Inventory** — schema doesn't exist yet. Square has it; we don't (and might not for v1).
- **Marketing / Loyalty** — out of v1 scope.
- **Apps & Integrations** — nothing to integrate yet beyond Krafta Pay (which is a separate product surface, not a third-party).
- **Team / Permissions** — orgs have one role today. Multi-role is post-launch.

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

1. **Sub-nav primitive.** A second row that appears when the active top section has children. shadcn `NavigationMenu` supports this; we already use it for the top bar. For mobile, a horizontal scroll of pills under the page header, similar to the Studio's "Studio sections" pills.
2. **Migrate Categories under Items.** Today `/dashboard/[org]/[catalog]/categories` is a sibling of `/items`. New URL: `/dashboard/[org]/[catalog]/items/categories`. The current `/categories` route stays as a permanent redirect for one release.
3. **Add Items → Modifiers / Discounts / Taxes & Fees.** Each is a new route under Items. They render in the order they're built ([KRA-35](https://linear.app/krafta/issue/KRA-35) for modifier creation, [KRA-63](https://linear.app/krafta/issue/KRA-63) for discounts + taxes/fees). Until then, the link is hidden, not greyed out.
4. **Add Orders → History / Transactions.** Today the orders page filters Open vs. Completed via tab cards. Promote each tab to its own URL (`/orders/live`, `/orders/history`, `/orders/transactions`) so deep-links work and the second-level nav has somewhere to point.
5. **Settings → Venue.** Lands as part of [KRA-34](https://linear.app/krafta/issue/KRA-34). The current Settings page becomes a wrapper that defaults to Venue.

This isn't a single refactor PR — it follows the feature work. The ADR exists so each PR knows where its surface lives.

## 5. Deferred decisions

These deserve their own ADRs when the feature work starts; this one shouldn't pre-decide them.

- **Transactions vs Payments hierarchy.** When card-on-file (Krafta Pay), refunds, disputes, and payouts are real, do we promote Payments to its own top-level (Square pattern) or keep it tucked under Orders? Recommendation when revisiting: promote.
- **Per-mode catalog (Bar / Retail / Bookings).** The Square mode-picker UI is great; the question is when we have a second mode worth picking. [KRA-74](https://linear.app/krafta/issue/KRA-74) is the first.
- **Multi-venue navigation.** Today the catalog/venue switcher in the top bar handles single-org-many-catalogs. When an org has 5 venues, the org-wide Orders aggregation ([KRA-71](https://linear.app/krafta/issue/KRA-71)) needs a different shape — possibly a top-level "All venues" mode with venue filters, similar to Square Locations.
- **Onboarding / first-run wizard structure.** Square inserts mode selection + menu naming as gated wizard steps before the dashboard renders. We have [KRA-16](https://linear.app/krafta/issue/KRA-16) / [KRA-42](https://linear.app/krafta/issue/KRA-42) for this; the wizard's step sequence should be designed against the tree above so post-onboarding the merchant lands on the right page.

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
