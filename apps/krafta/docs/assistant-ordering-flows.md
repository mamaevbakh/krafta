# Krafta Assistant — Ordering Flows & Widgets (v1, for approval)

> **Status:** in revision — founder reviewing before any build. Grounded against the real cart/checkout/delivery/item code (file anchors at the end), so every flow here is buildable, not aspirational.
>
> **Decisions locked (rev. 1):**
> 1. Primary checkout button = **“Оформить заказ”** — places a **cash/COD** order (no card charge in v1). Becomes a real charge when Krafta Pay card flow ships.
> 2. Checkout = **tappable guided widgets**, one question at a time (free-text only as a fallback).
> 3. **Delivery requires a map pin** (real lat+lng). No coords → placement blocked. The `0,0` manual-text fallback is removed for delivery.

---

## 1. Vision & principles

The Krafta Assistant turns the storefront into a conversation. A shopper types or speaks (“что-нибудь освежающее”, “show me a gift”, “хочу латте на овсяном”) and the assistant answers with **widgets** — rich, tappable UI rendered inline in the chat — not walls of text. The chat *is* the storefront: browse → configure → cart → checkout all happen in one thread.

- **Widgets, not forms.** Every tool output (a result row, an item configurator, the cart, a map, a single question) renders as a self-contained widget. We never drop a multi-field form into the chat.
- **Conversational checkout.** When the shopper says “buy”, the assistant *guides* fulfillment one widget at a time, asking only what that venue and that mode actually require.
- **Honesty over faking.** It only claims what the platform can do: no order tracking, no refunds, no allergen guarantees, and — critically — **no card charge** in v1 (orders are placed as **cash/COD at the counter**). It says so plainly.
- **Multilingual, native-feeling.** It replies in the shopper’s language (RU / UZ Latin-or-Cyrillic / EN / mixed), inferred from their message. Item names and prices are already localized server-side per the catalog’s active locale.
- **Obeys DESIGN.md.** This doc specifies *layout & composition* (the ChatKit-style cart you liked). It is **not** a license to deviate from the design system: oklch tokens, Geist Sans for UI, **Geist Mono `tabular-nums` for every price**, shadcn / `@ai-elements` primitives, radii from the scale (`rounded-lg` cards, `rounded-md` inputs, `rounded-full` pills/steppers), `lucide` icons, no gradients, no decorative shadows. Touch targets ≥ 44px.

---

## 2. Widget catalog

Every widget is a tool output rendered inline. Prices always render `font-mono tabular-nums` via `formatPriceCents` with the catalog currency settings (UZS → whole numbers; USD → `$` + 2 decimals).

### 2.1 Result cards (carousel)
**Purpose.** Show search/recommendation results so the shopper can add or open without leaving the thread.
**Shows.** Horizontal snap-scroll carousel (`w-36`, square photo, name `line-clamp-2`, price in mono). Backed by `searchCatalog` (hybrid), filtered to `kind='item'`.
**Actions.**
- **Simple item** (no modifiers AND ≤1 variation): inline **Add** → flips to a **− / qty / +** stepper after first add.
- **Complex item** (modifiers OR >1 variation): button reads **Choose options** → opens the Item widget. Never silently added.

**States.** *Empty:* “Ничего не нашёл — попробуем иначе?” + suggestion chips. *Loading:* skeleton cards. *Sold-out variation:* card shows, add disabled (“Нет в наличии”). *Sold-out single variation on a simple item:* whole card’s add is disabled (no fallback add path). *Category result* (`kind='category'`): currently filtered out — if we want “browse this category”, that’s a separate widget (out of v1).

```
┌──────┐ ┌──────┐ ┌──────┐ →  (snap-scroll)
│ img  │ │ img  │ │ img  │
│ Латте│ │ Раф  │ │ Эспр.│
│25 000│ │32 000│ │18 000│
│[+ Add]│ │− 1 +│ │[Choose]│
└──────┘ └──────┘ └──────┘
```

### 2.2 Item widget (in-assistant item detail)
**Purpose.** Configure a complex item to a valid cart line without the full-screen sheet.
**Shows.** Square photo, name, short description; **variation chips** (only if >1); **visible modifier lists** (`hidden_from_customer=false`); a **running price**; qty stepper. Modifier UI honors the model: list-mode → radio (max 1) or checkbox/stepper (max >1) respecting `min_selected` / `max_selected` (a *total-quantity* cap, not a distinct count) / `required` / `on_by_default`; text-mode → single input honoring `text_required` / `max_length`. Price = `basePriceCents + Σ(modifier.price_cents × qty)`, live.
**Actions.** **Add to cart** (validate required → add line → keep shopping) · **Оформить заказ** (add, then start Guided Checkout §3e) · qty stepper.
**States.** *Required pending:* button disabled-with-reason (“Выберите размер”) — simplified vs the storefront’s guided color-pills (Decision §5.5). *Sold out:* chip disabled; default sold-out → “currently unavailable”. *Add re-validation fails server-side:* fall back to opening the full-screen item sheet.

```
┌───────────────────────────────────┐
│ [photo]  Латте · Эспрессо + молоко │
│ Размер:  ( S ) [ M ] ( L )         │
│ Молоко:  ◉ Обычное  ○ Овсяное +5 000│
│ Сироп:   ☐ Карамель +4 000  …      │
│ Заметка: [______________________]  │
│ ──────────────────────────────────│
│ Цена  29 000           − 1 +       │
│ [ Add to cart ] [ Оформить заказ ] │
└───────────────────────────────────┘
```

### 2.3 Cart widget (the ChatKit-style design) — centerpiece
**Purpose.** Review/manage the cart, see the price breakdown, choose how to proceed.
**Shows.** One row per line: **square thumbnail** + **item name** + a muted **options line** built from variation + selected modifiers (e.g. “M · Овсяное · Карамель”) + **line price** (mono). The **− / qty / + stepper sits on the RIGHT** of each line (trash icon replaces “−” at qty 1). The same item in two different configurations shows as **two separate lines** — the options line is what distinguishes them (dedup key = `itemId + variationId + modifierSignature`). Divider, then the breakdown:
- **Subtotal** (sum of line totals)
- each **additive** fee/tax with its **percentage** shown (e.g. “Сервисный сбор 10%”) — these *increase* the total
- **included** taxes (e.g. UZ VAT baked into menu prices): shown **for transparency, never added** — labeled “включён” and visually de-emphasized so it can’t read as an addend
- delivery fee (delivery only) · tip (if set)
- **Total** (bold) = `subtotal + additiveFees + deliveryFee + tip`

Then **two stacked pill buttons**: solid black **Оформить заказ** (primary) and outlined **Keep shopping** (secondary — it returns to browse; it is *not* an “add to cart”, since the items are already in the cart — critic fix).
**Actions.** Per-line − / qty / + ; remove (trash at qty 1) with an **undo** affordance ; **Оформить заказ** → Guided Checkout ; **Keep shopping** → dismiss & browse.
**States.** *Empty:* “Корзина пуста” + suggestions; no buttons. *Below delivery minimum / out of zone:* relevant only once mode = delivery — inline amber note, Purchase blocked with reason (§4). *Price drift detected at place:* this is **terminal** — the cart refreshes and the shopper is bounced **back to this widget** to re-review (not a retry-in-place).

```
┌─────────────────────────────────────────────┐
│ ▢ Латте                                       │
│   M · Овсяное · Карамель      − 1 +    38 000 │
│ ▢ Круассан                                    │
│   Миндальный                  − 2 +    44 000 │
│ ─────────────────────────────────────────────│
│ Подытог                                82 000 │
│ Сервисный сбор 10%                      8 200 │  ← additive, added
│ НДС 12% · включён                      ~8 786 │  ← info only, NOT added
│ Итого                                  90 200 │  ← bold
│ [            Оформить заказ             ]     │  ← solid black
│ [             Keep shopping             ]     │  ← outline
└─────────────────────────────────────────────┘
```

### 2.4 Mode-picker widget
**Purpose.** Ask which fulfillment mode, when it isn’t already known.
**Shows.** One pill per **enabled** mode only (`venue.modes_enabled` ⊆ {dine_in, pickup, delivery}).
**Precedence** (critic fix — spell it out):
1. `dineInLock` set (QR table scan) → **dine_in forced**, table pre-filled, picker **not shown**.
2. exactly one enabled mode → use it silently, picker **not shown**.
3. `initialModeHint` (`?mode=pickup|delivery`) → pre-select but still changeable.
4. otherwise → show picker; default highlight = `cart.modes[0]`.
**States.** *Single mode / locked:* not rendered. *Empty `modes_enabled`:* should be impossible (DB CHECK), but degrade to “ordering isn’t available right now” (§4).

```
Как удобно получить заказ?
[ В зале ]  [ Самовывоз ]  [ Доставка ]
```

### 2.5 Address + Map widget
**Purpose.** Capture a delivery address that satisfies the hard requirement: **freeform string + latitude + longitude**, inside the delivery zone.
**Shows.** Embedded Yandex Maps v3 map, **fixed centre pin**; the shopper drags the map under the pin; on settle (debounced ~320ms) it reverse-geocodes via the server proxy and shows the resolved line. A **“Использовать моё местоположение” button at the BOTTOM** triggers browser geolocation, flies the map there, reverse-geocodes. Below the map: resolved line + optional details (entrance/floor/apartment/intercom/note).
**Returns:** `{ freeform (req), latitude (req), longitude (req), district?, street?, building?, entrance?, floor?, apartment?, intercom?, note? }`. *(Note: ymaps v3 coords are `[lng, lat]`; we flip to `lat,lng` for storage.)*
**Zone-gated states.** *In zone:* Continue enabled. *Out of zone* (`delivery.enabled` + origin set + Haversine > `radiusM`): amber warning, Continue **blocked** (`out_of_zone`); re-enforced server-side. *Geolocation denied/timeout:* fall back to drag from Tashkent centre with a note. *Yandex down / no API key:* the map can’t produce coordinates, and **delivery requires a pin (locked rev.1)** — so the assistant **blocks delivery placement** and offers pickup/dine-in or “try again”, rather than writing `0,0`. The old manual-text fallback (district/street/building with no coords) is **no longer a valid delivery path**. (It may still capture the *display* address text once a pin exists, but coords come from the pin.)

```
┌───────────────────────────────────┐
│            ┌───┐                    │
│            │ ▼ │   (fixed pin)      │
│   [ draggable Yandex map ]          │
│ ул. Амира Темура, 15                │
│ Подъезд__ Этаж__ Кв.__ Домофон__    │
│ [ ⦿ Использовать моё местоположение]│  ← bottom
│ [ Continue ]                        │
└───────────────────────────────────┘
```

### 2.6 Short-question widgets
Single-purpose prompts — one question, one control, never a stacked form.
- **Phone** → normalized to **+998 E.164**. *Required for delivery* (courier callback); *optional for pickup* — but **if a pickup phone is entered, it’s still validated** and an invalid value throws `phone_invalid` (critic fix). Invalid → inline “Введите номер в формате +998…”.
- **Name** → required for delivery; optional for pickup.
- **Time** → segmented: **Как можно скорее** / **Ко времени**; the latter reveals a picker. **Past times rejected** (enforce server-side too — §5.8); inline error on rejection.
- **Table number** → numeric; pre-filled + locked via QR `dineInLock`. Required, non-empty.
- **Notes** → optional free text.
- **Tip** → presets 0 / 5% / 10% + custom; **open by default for delivery, collapsed-but-present for pickup** (critic fix). Dine-in tip behavior → **Decision §5.11**. Capped server-side at half of (subtotal + additive fees + delivery fee) → exceeding throws `tip_too_high`.

```
Ваш телефон для связи?
[ +998 __ ___ __ __ ]      [ Готово ]
```

### 2.7 Order-confirmation widget
**Purpose.** Confirm a placed order; reflect that **Purchase placed a cash/COD order**, not a charge.
**Shows.** Success check, **order #**, chosen mode + details (table / pickup time / delivery address), final total, and the honest payment line **“Оплата наличными при получении.”** Snapshot persisted (sessionStorage) so a refresh doesn’t lose it.
**Actions.** **Начать новый заказ** (resets cart) · **Закрыть**.

### 2.8 Shop-info widget (optional)
**Purpose.** Answer hours / open-now / location / delivery from `getShopInfo`.
**Shows.** Name, open-now + today’s hours, enabled modes, delivery (radius / fee / minimum), address, currency. **Limitation:** `computeOpenNow` answers **current** open-now only — it can’t answer “are you open at 8pm?” precisely; the widget should phrase around that, not fake a future answer. Tool output prose i18n (“Доставка” vs “delivery”) is currently un-localized → §5.12.
**States.** *Closed:* shows “Закрыто” + next open time; pairs with the venue-closed guard (§4).

### 2.9 System micro-states (not full widgets)
- **“Added ✓” chip** after a simple add from a card.
- **“Открыл {item} — выберите опции” chip** when the model tries to add a **complex item by name from chat** (not via a card): `addToCart` returns `needs_options` and the Item widget opens (critic fix — this path must exist, not just the card’s “Choose options”).
- **Step-limit graceful state:** the tool loop is bounded (`stepCountIs(6)`); if a request needs more, the assistant says “давайте сузим запрос” rather than silently truncating (critic fix).

---

## 3. End-to-end flows (product language)

**(a) Discover & add.** Shopper asks → `searchCatalog` → **Result cards**. Simple → **Add** (stepper + “Добавлено”). Complex → **Choose options** → Item widget.

**(b) Configure an item.** Item widget: pick variation/modifiers, price updates live, required-empty lists marked → **Add to cart** (keep shopping) or **Purchase** (checkout).

**(c) View & manage cart.** “корзина” / cart affordance → **Cart widget**. Right-side stepper adjusts; trash at qty 1 removes with **undo**; breakdown recomputes live. Same item in different configs = separate lines.

**(d) Оформить заказ vs Keep shopping.**
- **Keep shopping** = return to browse (cart stays).
- **Оформить заказ** = **checkout now**. v1 has **no online payment**, so this places the order for **cash/COD** (pay at counter / on delivery) via guided checkout — *not* a card charge. The confirmation says so. *(Locked rev.1.)*

**(e) GUIDED CHECKOUT (the headline).** Triggered by **Оформить заказ** or a “checkout” intent.
1. **Pre-flush.** Await pending cart edits (`placeOrder` flushes first; taps during placement are dropped).
2. **Mode resolution** — precedence per §2.4 (QR-lock → single-mode → hint → picker w/ `cart.modes[0]` default).
3. **Per-mode question sequence** (each step is a widget):
   - **Dine-in:** Table number (pre-filled+locked if QR) → confirm → place.
   - **Pickup:** Time (asap/scheduled) → Name (opt) → Phone (opt, validated if given) → Tip (collapsed) → Notes (opt) → confirm → place.
   - **Delivery:** Address+Map (drag or “current location”; must return freeform+lat+lng and pass zone + minimum) → Phone (**req**) → Name (**req**) → Time + Tip (open) + Notes → confirm → place.
4. **Place.** `placeOrder` re-reads delivery settings, re-charges the authoritative flat fee, re-checks zone + minimum, re-validates modes/phone/taxes, runs **price-drift** detection, and transitions the draft to `open` with a `pending` **cash** payment. Idempotency prevents duplicate orders on retry.

**(f) Confirmation & new order.** Success → **Confirmation widget** (order #, details, total, “оплата при получении”). **Начать новый заказ** resets; **Закрыть** dismisses. Placed snapshot survives refresh until one of those fires.

**(g) Shop questions.** “Вы открыты?” / “докуда возите?” → `getShopInfo` → **Shop-info widget**.

**(h) Honest declines.** Order status → “не могу отслеживать — кафе свяжется”. Payment → “оплата наличными при получении; картой пока нельзя” (until Krafta Pay — §5.1). Returns → “напишите кафе”. Allergens → only repeats description. Human handoff → venue contact.

---

## 4. Edge cases & guards
- **Empty cart** → empty state + suggestions; checkout intent nudges to add items.
- **Venue closed / not active** → CartProvider is omitted; order affordances disappear; assistant degrades to browse + shop-info and says ordering is paused (next open time). Also covers **no active venue / `enableCart=false`**.
- **Assistant disabled mid-session** → `enableAssistant=false` (default) makes the API **403**; also requires `OPENAI_API_KEY`. The UI shouldn’t open the assistant when off; if the API 403s, show a graceful “ассистент недоступен”.
- **Required modifiers not chosen** → Item widget blocks with reason; server re-validates regardless.
- **Ambiguous / multiple matches** → return the carousel and ask the shopper to pick; never guess one.
- **Delivery out of zone** → Address widget warns + blocks; `placeOrder` throws `out_of_zone` if bypassed. **Manual-fallback `0,0`** is the dangerous variant → §5.10.
- **Minimum order not met** → warn (`below_min_order`) once mode = delivery; re-enforced server-side.
- **Currency** → all prices via `formatPriceCents` (UZS whole / USD 2-dec), always mono `tabular-nums`.
- **Language switch mid-flow** → reply language follows the latest message; widget chrome stays in the page’s active locale; item names already localized.
- **Cart edited after checkout opened** → breakdown recomputes; **price drift** on place is terminal → back to cart (§2.3).
- **Network / placeOrder failure** → retry; idempotency makes retry safe. `tip_too_high` / `phone_invalid` surface as field errors. Telegram merchant notification is best-effort and never blocks confirmation.
- **Geocode/suggest under load** → server proxy could bottleneck at lunch rush; no rate-limit headers surfaced today → §5.13 (monitor/queue post-v1).

---

## 5. Open product decisions (need sign-off)
Each has a **recommended default** so you can approve fast.

1. ✅ **DECIDED (rev.1).** Primary button = **“Оформить заказ”**, v1 = `pending` **cash/COD**, no charge. Becomes a real charge when Krafta Pay card flow ships.
2. ✅ **DECIDED (rev.1).** Checkout = guided **widgets** (one tappable question at a time); free-text only as a fallback.
3. **Map inside chat vs overlay.** ymaps3 needs a measurable container + referer. **Rec:** embed a pinned-height (~55dvh) map widget reusing the singleton; if flaky, open the existing full-bleed picker as a transient overlay and return the result to chat.
4. **Address widget plumbing.** **Rec:** a lightweight endpoint that returns `{freeform, lat, lng, …}` to the tool call — not a partial-order write — so the map widget stays a pure “return a value” step (critic add).
5. **Required-selection UX in the Item widget.** **Rec:** disabled-with-reason button (simpler than the storefront’s guided color-pills); keep the guided flow only in the full-screen sheet.
6. **Venue paused degrade copy.** **Rec:** browse + shop-info stay; all add/checkout affordances hide; state ordering is paused + next open.
7. **Telegram notify failure.** **Rec:** v1 best-effort (already non-blocking); add a retry queue post-v1.
8. **Scheduled-time past-guard.** **Rec:** enforce “not in the past” **server-side** in `placeOrder`, not just client.
9. **Anon → authed address portability.** **Rec:** out of v1 (address book is `auth.uid()`-scoped; KRA-44 merges on phone).
10. ✅ **DECIDED (rev.1).** Delivery **requires a map pin** — placement is blocked without real coords, so `0,0` can never reach the zone check. Manual-text-only delivery is removed.
11. **Dine-in tip.** Unspecified today. **Rec:** hide tip for dine-in v1 (tips handled in-venue).
12. **`getShopInfo` prose i18n.** **Rec:** localize mode/label strings in the widget chrome (RU/UZ/EN) even though the tool returns structured data.
13. **Geocode/suggest rate-limits.** **Rec:** monitor in v1; add caching/queue if lunch-rush load shows up. Not a blocker.

---

## 6. Proposed V1 build phases

**Already shipping (reuse, don’t rebuild):** assistant shell (`gpt-5.4`, `/api/shop-assistant`, `enableAssistant` gate + 403 re-check), `searchCatalog` + `getShopInfo`, result-card carousel with simple-add stepper, client `addToCart`/`viewCart`/`openItem` (post-stream resolution, dedup by `toolCallId`), live cart via `useOptionalCart`, a first-cut in-assistant checkout overlay (mode tabs + per-mode fields + place order + confirmation), the full cart→checkout→placed lifecycle, Yandex map picker + zone gating + server-authoritative `placeOrder`.

- **Phase 1 — Cart widget redesign (ChatKit composition).** Rebuild the in-chat cart to §2.3: thumbnail + options line + line price + **right-side stepper**, divider, Subtotal / additive-with-% / included-shown / Total bold, **Purchase** + **Keep shopping** pills. Pure layout over existing cart data. *Lowest risk, highest visible payoff.*
- **Phase 2 — Item widget.** In-chat configurator (variations, visible modifiers honoring min/max/required/on_by_default, running price, qty) with **Add to cart** + **Purchase**; reuses modifier-signature / line-key; server re-validates; opens the `needs_options` path from chat.
- **Phase 3 — Guided Checkout (mode + short-question widgets).** Replace the overlay’s stacked form with the §3e sequence: Mode-picker (precedence/skip/lock) → per-mode short-question widgets (table; name/phone/time/tip/notes). Wire to `placeOrder` with all guards.
- **Phase 4 — Address + Map widget.** Embed (or overlay) the Yandex map with the **bottom “use my current location”** button; return `{freeform, lat, lng, …}`; surface zone + minimum inline; resolve the `0,0` hole (§5.10). *Highest technical risk → last.*
- **Phase 5 — Confirmation + honesty polish.** Confirmation widget (“оплата при получении”, “start a new order”), the honest-decline copy set, optional shop-info widget styling, graceful step-limit / 403 / paused states.

**Explicitly OUT of v1:** online/card payment via Krafta Pay (Purchase stays cash/COD); order tracking & status; returns/refunds; running table-check across multiple place-orders; delivery-provider dispatch beyond `merchant` (Yandex/Glovo); distance-based delivery surcharging (fee stays flat); anon→authed address portability; assistant prose driven by `?lang=` (language stays inferred from the message).

---

### Engineering anchors
`components/catalogs/assistant/storefront-assistant.tsx` · `components/catalogs/cart/cart-provider.tsx` · `cart/checkout-step.tsx` · `cart/placed-step.tsx` · `cart/pricing-breakdown.tsx` · `lib/cart/checkout.ts` · `lib/cart/pricing.ts` · `components/catalogs/cart/address-map-picker.tsx` · `lib/catalogs/settings/delivery.ts` · `components/catalogs/items/modifier-picker.tsx` · `lib/cart/modifier-signature.ts` · `lib/agents/shop-assistant.ts` · design system: `/DESIGN.md`.
