# Krafta Dine-In Shop Design

Date: 2026-03-27
Status: Draft
Owner: Codex + user

## Goal

Design a new dine-in ordering experience for Krafta that starts from a table QR code, lets multiple guests build and send batches to the kitchen from their own phones, and ends with in-app payment through Krafta Pay.

The experience should feel modern and distinctly Krafta. It should use the existing UI kit and interaction primitives, but evolve the composition toward lighter, floating surfaces with selective blur and a more current mobile feel.

## Product Model

The dine-in flow is built on four core concepts:

- Table session: the shared order context linked to a specific table QR code
- Guest session: one diner's identity inside that table session, either signed-in or guest
- Cart: draft items the guest has added but not yet submitted
- Order: submitted kitchen batches that accumulate across the table

The product rule is strict:

- Once a batch is sent to the kitchen, guests cannot edit or cancel those items.

This keeps the guest experience simple and keeps post-submission changes in staff hands.

## MVP Rules

- Guests enter through a QR code tied to a specific table.
- Multiple guests can join the same table order from different phones.
- Sign up or log in is the preferred path, but `Continue as guest` must be available.
- Guests browse the menu, search, open items, and add them to a cart.
- The cart is the only review surface before submission.
- Tapping `Send to kitchen` submits the batch immediately.
- Success feedback is a small default shadcn-style toast.
- Submitted batches are read-only for guests.
- Each guest pays for the items they personally sent to the kitchen, plus service fee if applicable.
- One guest may optionally pay the full remaining table order.

## Experience Principles

### 1. Order-first, not checkout-first

This is not a normal storefront. Guests are participating in a live shared table order over time, so the interface should feel like a dine-in workspace rather than a one-shot ecommerce funnel.

### 2. Krafta DNA, newer composition

The redesign should stay inside Krafta's product language:

- reuse the existing UI kit for buttons, inputs, sheets, toggles, and feedback
- preserve the product's clean typography and structured control surfaces
- avoid generic consumer-commerce styling

But the framing should feel more modern:

- floating utility surfaces instead of heavy boxed chrome
- selective blur on overlays, chips, docks, and sheets
- breathable spacing
- reduced header weight
- no outdated tab bars or rigid app-shell framing

### 3. Blurs should be selective

Blur and glass treatment should support hierarchy, not become the whole aesthetic. The main content, prices, and order details should stay crisp and trustworthy.

Recommended blur usage:

- floating table identity cluster
- floating search/filter surfaces
- floating cart/order dock
- sheets and overlays

## User Flow

### Join

1. Guest scans a QR code for a specific table.
2. Guest lands on a table-scoped join screen.
3. Guest chooses:
   - `Sign up / Log in`
   - `Continue as guest`
4. The app creates a guest session inside the shared table order.

### Browse and Build

1. Guest lands in the menu experience.
2. Guest can search, switch categories, open item details, and add items to cart.
3. The app keeps the shared table context visible without dominating the screen.

### Send to Kitchen

1. Guest opens cart.
2. Cart shows only draft items from this guest.
3. Guest reviews quantities and totals.
4. Guest taps `Send to kitchen`.
5. App shows a small toast.
6. Cart clears.
7. Submitted items move into the shared order history.

### Continue Ordering

Guests can repeat the browse -> cart -> send flow multiple times during the meal.

### Pay

1. Guest opens payment.
2. App shows the guest's own submitted items, service fee, and total due.
3. Guest can pay:
   - only their own submitted items
   - or the full remaining table balance
4. Payment hands off into Krafta Pay.

## Screen System

## 1. Join Table

Purpose:

- confirm the guest is joining the correct physical table
- establish identity
- set the tone for the dine-in session

Content:

- venue name
- table label or number
- brief dine-in context
- primary CTA: `Sign up / Log in`
- secondary CTA: `Continue as guest`

Design notes:

- no heavy hero
- minimal copy
- subtle branded backdrop
- card-like entry surface with soft border and light blur behind it

## 2. Menu Canvas

Purpose:

- primary browsing and discovery surface
- support fast ordering during dine-in

Content:

- floating venue/table identity cluster
- guest identity indicator
- floating search control
- category pills
- item feed
- floating bottom dock for `Cart` and `Order`

Design notes:

- not a traditional app header
- not a classic bottom nav
- menu content should feel open and fast
- the dock should feel like a live utility tray hovering above the page

## 3. Item Detail

Purpose:

- focused selection surface for one item

Content:

- item image
- item name
- description
- price
- quantity control
- notes area for future extensibility
- `Add to cart`

Design notes:

- bottom sheet or near-fullscreen mobile sheet
- modern product quick-view feel
- clean, decisive action hierarchy

## 4. Cart Sheet

Purpose:

- the only review surface before kitchen submission

Content:

- draft items for this guest only
- quantities
- line totals
- subtotal
- service fee note if relevant
- primary CTA: `Send to kitchen`

Behavior:

- no second confirmation layer
- send is immediate
- toast confirms success

## 5. Shared Order Sheet

Purpose:

- show what has already been committed for the table

Content:

- batches grouped chronologically
- sender identity
- timestamp
- items inside each batch
- outstanding order summary

Behavior:

- fully read-only for guests after submission

Design notes:

- should feel like a trustworthy order ledger, not an admin screen

## 6. Pay Surface

Purpose:

- settle the guest's own submitted items or the whole table balance

Content:

- `Your items`
- service fee
- personal total
- secondary action for paying the remaining full table balance

Behavior:

- acts as the final native pay review before handoff into Krafta Pay

## Navigation Model

The app should avoid old-style headers and rigid tab bars. Instead, use anchored utility surfaces:

- floating top cluster for table identity
- floating search/filter tools
- floating bottom dock for `Cart` and `Order`
- sheets for detail, cart, order, and payment

This creates a more contemporary, layered mobile experience while still using Krafta's existing component language.

## Data and Responsibility Boundaries

### Guest-facing state

- who the current guest is
- draft cart items for that guest
- submitted batches for the full table
- guest-specific payment responsibility

### Shared table state

- table identity
- full submitted order
- total outstanding amount
- participant list

### Submission boundary

`Send to kitchen` is the key state boundary:

- before submission: editable cart
- after submission: immutable kitchen batch

This boundary should stay obvious in both design and implementation.

## Payment Model

MVP payment rules:

- guest pays for what they personally sent
- service fee can be applied on top
- guest may optionally pay the full remaining table balance

Future phases may support richer split logic, but MVP should avoid item-by-item reassignment or equal-split complexity.

## Relationship to Existing Apps

The new dine-in flow should be designed fresh, not by copying the current storefront composition.

However, it should align with existing route and platform boundaries:

- public shop route: `apps/krafta/app/[...slug]/page.tsx`
- search behavior: `apps/krafta/components/catalogs/search/catalog-search.tsx`
- hosted pay route: `apps/krafta-pay/app/pay/[public_token]/page.tsx`

This means the visual design can be new while still fitting the actual product architecture.

## Risks and Design Watchouts

- Too much glass treatment could reduce readability and trust.
- Too much custom chrome could make the experience stop feeling like Krafta.
- A second confirmation step after cart review would add friction without adding clarity.
- Overloading the shared order view could make the product feel like staff software instead of guest software.
- Trying to support advanced split-bill logic too early would complicate MVP.

## Recommendation

Design the MVP as a modern dine-in workspace built from Krafta's UI kit, with:

- QR-based table entry
- soft identity gate
- floating menu utilities
- cart as the single review surface
- immutable kitchen batches
- shared order ledger
- payment per guest by submitted items, with an optional pay-all path

This gives Krafta a clear restaurant-native product shape without drifting away from the current system foundations.
