/**
 * messages.ts — storefront system message catalog.
 *
 * System-rendered strings (cart chrome, checkout form labels, error
 * messages, aria labels) that need to follow the storefront's locale
 * just like merchant content does. Counterpart to the locale registry:
 * `registry.ts` owns language metadata (display name, text direction),
 * this file owns the message strings.
 *
 * Why a hand-rolled lookup instead of next-intl / react-intl:
 *   - Catalog is bounded — ~50 keys for the customer-side surfaces.
 *   - Server-safe: pure object map + small helpers, zero React runtime.
 *   - We already have a per-catalog locale resolver
 *     (resolveStorefrontLocale) that picks the active locale; full ICU
 *     would be a heavier dep than we need.
 *
 * Resolution order matches `pickLocalizedField` for merchant content:
 *   activeLocale → defaultLocale → "en"
 *
 * Adding a new message:
 *   1. Add the key to STOREFRONT_MESSAGES.<locale> for ru and uz-Latn
 *      at minimum (the two locales that ship at launch). Other locales
 *      can fall back to English without harm.
 *   2. If the message needs runtime values (item name, price), use
 *      `getStorefrontMessage(key, locale, { vars: { name } })` and
 *      write `{name}` in the catalog string.
 *   3. If the message changes shape with count (1 item / 2 items /
 *      5 items), use `getStorefrontPlural(key, count, locale)` with
 *      a `_plural` suffix on the key. ru needs nplurals=3, en/uz-Latn
 *      have 2.
 *
 * KRA-S0 (finish-ordering-flow): extends the F-5 'all'-only catalog to
 * the full cart/checkout/placed flow. Adds interpolation + pluralization.
 */

// ============================================================================
// Message keys
// ============================================================================

/**
 * Every system-rendered string the storefront uses gets a key here. TS
 * union enforces compile-time existence; per-locale tables fill in the
 * translations. Missing entries fall back to English without breaking
 * compilation.
 *
 * Convention: `surface.element` (`cart.title`, `checkout.tip.label`) or
 * `category.subject` (`errors.network`, `aria.close_drawer`). Keep
 * snake_case for multi-word subjects.
 */
export type StorefrontMessageKey =
  // Filter chip (carried over from F-5)
  | "all"
  // Storefront empty states (server-rendered catalog shell)
  | "catalog.empty"
  | "catalog.category_empty"
  // Cart drawer chrome
  | "cart.title"
  | "cart.description"
  | "cart.empty"
  | "cart.empty.hint"
  | "cart.empty.cta"
  | "cart.continue"
  | "cart.keep_shopping"
  | "cart.subtotal"
  | "cart.total"
  | "cart.tax"
  | "cart.service_fee"
  | "cart.tip"
  | "cart.modifier_pricing_hint"
  // Plural-aware item count: "1 item" / "2 items" — pass count to
  // getStorefrontPlural() not getStorefrontMessage().
  | "cart.item_count_plural"
  // QR-driven dine-in indicator shown above the cart list when the
  // customer arrived via a table QR. Interpolates `{table}`.
  | "cart.mode_pill.dine_in"
  // Checkout step
  | "checkout.title"
  | "checkout.back"
  | "checkout.place_order"
  | "checkout.placing"
  | "checkout.mode.dine_in"
  | "checkout.mode.pickup"
  | "checkout.mode.delivery"
  | "checkout.mode.title"
  | "checkout.mode.subtitle"
  | "checkout.edit_cart"
  | "checkout.mode_unavailable"
  | "checkout.tip.label"
  | "checkout.tip.none"
  | "checkout.tip.custom"
  | "checkout.tip.custom_placeholder"
  | "checkout.tip.preset"
  | "checkout.schedule.when"
  | "checkout.schedule.asap"
  | "checkout.schedule.scheduled"
  | "checkout.schedule.pick_date"
  | "checkout.schedule.time_aria"
  | "checkout.table.label"
  | "checkout.table.placeholder"
  | "checkout.address.label"
  | "checkout.address.placeholder"
  | "checkout.address.district.label"
  | "checkout.address.district.placeholder"
  | "checkout.address.street.label"
  | "checkout.address.street.placeholder"
  | "checkout.address.building.label"
  | "checkout.address.building.placeholder"
  | "checkout.recipient.label"
  | "checkout.recipient.placeholder"
  | "checkout.phone.label"
  | "checkout.phone.placeholder"
  | "checkout.note.label"
  | "checkout.note.placeholder"
  // Inline "what's missing" hint shown above the Place order CTA
  | "checkout.missing.address"
  | "checkout.missing.name"
  | "checkout.missing.phone"
  | "checkout.missing.time"
  | "checkout.missing.table"
  | "checkout.out_of_zone"
  | "checkout.below_min_order"
  // Delivery-checkout polish: clearer order summary, lower-friction tip,
  // intentional section labels.
  | "cart.delivery_free"
  | "checkout.tip.add"
  | "checkout.schedule.pickup_when"
  | "checkout.schedule.delivery_when"
  | "checkout.your_name"
  | "checkout.section.contact"
  | "checkout.contact"
  | "checkout.summary.heading"
  | "checkout.chip.required"
  | "checkout.chip.optional"
  // Online (card) payment — shown when the merchant has connected Krafta Pay.
  | "checkout.payment.heading"
  | "checkout.payment.cash"
  | "checkout.payment.card"
  | "checkout.payment.card_hint"
  | "checkout.card_unavailable_cash"
  // Delivery address book — dedicated map + list screens
  | "address.title"
  | "address.use_location"
  | "address.add"
  | "address.change"
  | "address.new"
  | "address.edit_title"
  | "address.loading"
  | "address.search"
  | "address.confirm"
  | "address.resolving"
  | "address.map_hint"
  | "address.edit_on_map"
  | "address.save"
  | "address.delete"
  | "address.delete_confirm_title"
  | "address.delete_confirm_body"
  | "address.set_default"
  | "address.default"
  | "address.summary_empty"
  | "address.helps_delivery"
  | "address.field.entrance"
  | "address.field.floor"
  | "address.field.apartment"
  | "address.field.intercom"
  | "address.field.note"
  | "address.field.note_ph"
  | "address.field.label"
  | "address.label.home"
  | "address.label.work"
  | "address.label.other"
  // Placed step
  | "placed.title"
  | "placed.order_label"
  | "placed.status"
  | "placed.subtitle.dine_in"
  | "placed.subtitle.pickup"
  | "placed.subtitle.delivery"
  | "placed.pay.dine_in"
  | "placed.pay.pickup"
  | "placed.pay.delivery"
  | "placed.done"
  | "placed.order_more"
  | "placed.view_previous"
  | "placed.scheduled_for"
  // Add to cart
  | "add_to_cart.label"
  // Short verb-only variant for the compact catalog-card pill.
  | "add_to_cart.short"
  // aria label on the catalog-card Add pill. Interpolates `{name}`.
  | "add_to_cart.aria"
  | "add_to_cart.label_with_price"
  | "add_to_cart.added"
  | "add_to_cart.view"
  | "add_to_cart.choose_options"
  | "add_to_cart.view_item"
  | "add_to_cart.adding"
  // Gating message on the item-detail bottom CTA when required mods
  // aren't met yet. `{count}` is the number of unfilled required lists.
  | "add_to_cart.gated_required_one"
  | "add_to_cart.gated_required_many"
  // Disambiguation drawer that opens when the customer taps +/- on a
  // customisable item already in cart. Lists each existing config plus
  // an "Add new customised item" CTA.
  | "customisations.title"
  | "customisations.add_new"
  // Storefront bottom dock — search input placeholder + a11y label.
  | "search.placeholder"
  | "search.open_aria"
  // Full-screen search dialog chrome (catalog-search).
  | "search.title"
  | "search.close_aria"
  | "search.prompt"
  | "search.error"
  | "search.no_results"
  | "search.items_heading"
  | "search.categories_heading"
  // Header language switcher — aria label on the globe-icon trigger.
  // The dropdown items themselves use each locale's `display_name`
  // (merchant-curated), so the only localized string we need is the
  // affordance label for screen readers.
  | "language.select_aria"
  // Header theme switcher (mode-toggle) — aria label + dropdown items.
  | "theme.toggle_aria"
  | "theme.light"
  | "theme.dark"
  | "theme.system"
  // Item detail view — variation selector. "Size" reads as the universal
  // header for variation pickers in food/menu contexts even when the
  // actual axis is something else (e.g. "Cold / Hot"). Renamed to
  // generic "Choose option" if you'd rather not assume size semantics.
  | "variation.label"
  | "variation.sold_out"
  // Modifier picker — required-list status pill (3 states) + its aria labels.
  | "modifier.required"
  | "modifier.required_satisfied"
  | "modifier.required_pending"
  // Modifier-list selection hints (rendered under each list's title).
  | "modifier.hint.choose_one"
  | "modifier.hint.choose_n"
  | "modifier.hint.up_to"
  | "modifier.hint.at_least"
  | "modifier.hint.choose_range"
  | "modifier.hint.up_to_chars"
  | "modifier.hint.optional_up_to_chars"
  // Conversational shopping assistant chrome (opt-in per catalog).
  | "assistant.title"
  | "assistant.empty_title"
  | "assistant.empty_hint"
  | "assistant.suggestion_recommend"
  | "assistant.suggestion_popular"
  | "assistant.suggestion_gift"
  | "assistant.searching"
  | "assistant.error"
  | "assistant.input_placeholder"
  | "assistant.added_to_cart"
  | "assistant.opened_choose_options"
  | "assistant.close_aria"
  | "assistant.send_aria"
  // Dine-in running check — the per-table tab bar + "Table Check" sheet
  // (placed rounds, status pills, running total, ask-for-the-bill).
  | "table_check.open_aria"
  | "table_check.table"
  | "table_check.round_count_plural"
  | "table_check.round_count_plural.one"
  | "table_check.round_count_plural.few"
  | "table_check.round_count_plural.many"
  | "table_check.subtitle"
  | "table_check.round"
  | "table_check.total"
  | "table_check.request_bill"
  | "table_check.bill_requested"
  | "table_check.requesting"
  | "table_check.status_served"
  | "table_check.status_preparing"
  // Errors (interpolation-aware — use `{var}` placeholders in the string)
  | "errors.network"
  | "errors.item_not_found"
  | "errors.modifier_unavailable"
  | "errors.cart_empty"
  | "errors.order_expired"
  | "errors.price_changed"
  | "errors.table_session_expired"
  | "errors.scheduled_time_too_soon"
  | "errors.tip_too_high"
  | "errors.tip_without_items"
  | "errors.phone_invalid"
  | "errors.try_again"
  | "errors.cart_save_failed"
  | "errors.place_order_failed"
  // Share / copy (item-detail-fullscreen-view)
  | "share.link_copied"
  | "share.copy_fallback"
  | "share.unable_to_copy"
  // ARIA labels
  | "aria.close_drawer"
  | "aria.decrease_quantity"
  | "aria.increase_quantity"
  | "aria.remove_item"
  | "aria.remove_from_cart"
  | "aria.share"
  // Item-name-interpolated stepper labels (`{name}`) used on catalog cards.
  | "aria.remove_item_named"
  | "aria.decrease_item_named"
  | "aria.increase_item_named"
  | "aria.cart_quantity_config"
  | "aria.cart_quantity_named";

type MessageTable = Partial<Record<StorefrontMessageKey, string>>;

// ============================================================================
// Per-locale catalogs
// ============================================================================
//
// en is the canonical / fallback source. ru + uz-Latn cover the launch
// markets and ship at full coverage. Other locales inherit English via
// the resolution chain — acceptable for v1, can be filled out per
// merchant request.

const EN: MessageTable = {
  all: "All",

  "catalog.empty": "No categories or items in this catalog yet.",
  "catalog.category_empty": "No items in this category yet.",

  "cart.title": "Your cart",
  "cart.description": "Review the items in your cart and continue to checkout.",
  "cart.empty": "Your cart is empty.",
  "cart.empty.hint": "Add items from the menu to get started.",
  "cart.empty.cta": "Browse the menu",
  "cart.continue": "Continue",
  "cart.keep_shopping": "Keep shopping",
  "cart.subtotal": "Subtotal",
  "cart.total": "Total",
  "cart.tax": "Tax",
  "cart.service_fee": "Service fee",
  "cart.tip": "Tip",
  "cart.modifier_pricing_hint": "Modifier prices are per item.",
  "cart.item_count_plural": "{count} items",
  "cart.mode_pill.dine_in": "Dine-in · Table {table}",

  "checkout.title": "Checkout",
  "checkout.back": "Back",
  "checkout.place_order": "Place order",
  "checkout.placing": "Placing order…",
  "checkout.mode.dine_in": "Dine-in",
  "checkout.mode.pickup": "Pickup",
  "checkout.mode.delivery": "Delivery",
  "checkout.mode.title": "Choose order mode",
  "checkout.mode.subtitle": "Select how you'd like to get your order",
  "checkout.edit_cart": "Edit cart",
  "checkout.mode_unavailable":
    "This option isn't available right now. Pick another mode.",
  "checkout.tip.label": "Tip",
  "checkout.tip.none": "No tip",
  "checkout.tip.custom": "Custom",
  "checkout.tip.custom_placeholder": "Enter tip amount",
  "checkout.tip.preset": "{percent}%",
  "checkout.schedule.when": "When",
  "checkout.schedule.asap": "As soon as possible",
  "checkout.schedule.scheduled": "Schedule",
  "checkout.schedule.pick_date": "Pick a date",
  "checkout.schedule.time_aria": "Time",
  "checkout.table.label": "Table",
  "checkout.table.placeholder": "Table number",
  "checkout.address.label": "Address",
  "checkout.address.placeholder": "Building, street, city",
  "checkout.address.district.label": "District",
  "checkout.address.district.placeholder": "e.g. Mirzo Ulug‘bek",
  "checkout.address.street.label": "Street",
  "checkout.address.street.placeholder": "e.g. Amir Temur",
  "checkout.address.building.label": "Building / Apt",
  "checkout.address.building.placeholder": "e.g. 12, apt 45",
  "checkout.recipient.label": "Recipient name",
  "checkout.recipient.placeholder": "Your name",
  "checkout.phone.label": "Phone",
  "checkout.phone.placeholder": "XX XXX XX XX",
  "checkout.note.label": "Note",
  "checkout.note.placeholder": "Anything we should know? (optional)",
  "checkout.missing.address": "Choose a delivery address",
  "checkout.missing.name": "Enter the recipient’s name",
  "checkout.missing.phone": "Enter a valid phone number",
  "checkout.missing.time": "Pick a time",
  "checkout.missing.table": "Enter your table number",
  "checkout.out_of_zone": "Outside the delivery area",
  "checkout.below_min_order": "Minimum order for delivery is {amount}",
  "cart.delivery_free": "Free",
  "checkout.tip.add": "Add a tip",
  "checkout.schedule.pickup_when": "Pickup time",
  "checkout.schedule.delivery_when": "Delivery time",
  "checkout.your_name": "Your name",
  "checkout.section.contact": "Contact details",
  "checkout.contact": "Contact",
  "checkout.summary.heading": "Order summary",
  "checkout.payment.heading": "Payment method",
  "checkout.payment.cash": "Cash",
  "checkout.payment.card": "Card",
  "checkout.payment.card_hint": "You'll pay by card on a secure page, then come right back.",
  "checkout.card_unavailable_cash": "Online payment is unavailable right now — your order was placed with cash on delivery.",
  "checkout.chip.required": "Required",
  "checkout.chip.optional": "Optional",
  "address.title": "Delivery address",
  "address.use_location": "Use my location",
  "address.add": "Add address",
  "address.change": "Change",
  "address.new": "New address",
  "address.edit_title": "Edit address",
  "address.loading": "Loading addresses…",
  "address.search": "Search address",
  "address.confirm": "Confirm",
  "address.resolving": "Finding address…",
  "address.map_hint": "Drag the map to pinpoint the entrance",
  "address.edit_on_map": "Edit on map",
  "address.save": "Save",
  "address.delete": "Delete address",
  "address.delete_confirm_title": "Delete this address?",
  "address.delete_confirm_body": "This can’t be undone.",
  "address.set_default": "Set as default",
  "address.default": "Default",
  "address.summary_empty": "Add a delivery address",
  "address.helps_delivery": "Helps the courier find you",
  "address.field.entrance": "Entrance",
  "address.field.floor": "Floor",
  "address.field.apartment": "Apartment",
  "address.field.intercom": "Intercom",
  "address.field.note": "Courier note",
  "address.field.note_ph": "Call 10 min before · entrance from the yard",
  "address.field.label": "Label",
  "address.label.home": "Home",
  "address.label.work": "Work",
  "address.label.other": "Other",

  "placed.title": "Order placed",
  "placed.order_label": "Order",
  "placed.status": "Placed",
  "placed.subtitle.dine_in":
    "We sent it to the kitchen — your order will arrive at table {table} shortly.",
  "placed.subtitle.pickup": "Your order’s in — it’ll be ready for pickup soon.",
  "placed.subtitle.delivery":
    "Your order’s in — the merchant will prepare it and send it your way.",
  "placed.pay.dine_in": "Pay at the table when your server brings the bill.",
  "placed.pay.pickup": "Pay at the counter when you pick up.",
  "placed.pay.delivery": "Pay the courier in cash on arrival.",
  "placed.done": "Done",
  "placed.order_more": "Order more",
  "placed.view_previous": "View previous order",
  "placed.scheduled_for": "Scheduled for {time}",

  "add_to_cart.label": "Add to cart",
  "add_to_cart.short": "Add",
  "add_to_cart.aria": "Add {name} to cart",
  "add_to_cart.label_with_price": "Add  •  {price}",
  "add_to_cart.added": "Added {name}",
  "add_to_cart.view": "View cart",
  "add_to_cart.choose_options": "Choose options",
  "add_to_cart.view_item": "View item",
  "add_to_cart.adding": "Adding…",
  "add_to_cart.gated_required_one": "Make 1 required selection",
  "add_to_cart.gated_required_many": "Make {count} required selections",
  "customisations.title": "Your customisations for this item",
  "customisations.add_new": "Add new customised item",
  "search.placeholder": "Search the menu",
  "search.open_aria": "Open search",
  "search.title": "Search",
  "search.close_aria": "Close search",
  "search.prompt": "Start typing to search items and categories.",
  "search.error": "We could not load search results. Please try again.",
  "search.no_results": "No matches yet. Try another keyword.",
  "search.items_heading": "Items",
  "search.categories_heading": "Categories",
  "language.select_aria": "Select language",
  "theme.toggle_aria": "Toggle theme",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",
  "variation.label": "Choose option",
  "variation.sold_out": "Sold out",
  "modifier.required": "Required",
  "modifier.required_satisfied": "Required (satisfied)",
  "modifier.required_pending": "Required (pending)",
  "modifier.hint.choose_one": "Choose 1",
  "modifier.hint.choose_n": "Choose {count}",
  "modifier.hint.up_to": "Up to {count}",
  "modifier.hint.at_least": "At least {count}",
  "modifier.hint.choose_range": "Choose {min} to {max}",
  "modifier.hint.up_to_chars": "Up to {count} chars",
  "modifier.hint.optional_up_to_chars": "Optional · up to {count} chars",
  "assistant.title": "Assistant",
  "assistant.empty_title": "What are you looking for?",
  "assistant.empty_hint": "Ask in any language — I’ll find it for you.",
  "assistant.suggestion_recommend": "What do you recommend?",
  "assistant.suggestion_popular": "Show me something popular",
  "assistant.suggestion_gift": "I’m looking for a gift",
  "assistant.searching": "Searching…",
  "assistant.error": "Something went wrong. Please try again.",
  "assistant.input_placeholder": "Ask anything…",
  "assistant.added_to_cart": "Added {name} to cart",
  "assistant.opened_choose_options": "Opened {name} — choose options to add",
  "assistant.close_aria": "Close assistant",
  "assistant.send_aria": "Send",

  "table_check.open_aria": "Open table check",
  "table_check.table": "Table {table}",
  "table_check.round_count_plural": "{count} orders",
  "table_check.round_count_plural.one": "{count} order",
  "table_check.subtitle": "Your check at this table",
  "table_check.round": "Order {number}",
  "table_check.total": "Table total",
  "table_check.request_bill": "Ask for the bill",
  "table_check.bill_requested": "Bill requested",
  "table_check.requesting": "Requesting…",
  "table_check.status_served": "Served",
  "table_check.status_preparing": "Preparing",

  "errors.network":
    "Network issue. Check your connection and try again.",
  "errors.item_not_found": "This item is no longer available.",
  "errors.modifier_unavailable":
    "\"{name}\" is no longer available. Pick another option or remove it.",
  "errors.cart_empty": "Your cart is empty.",
  "errors.order_expired":
    "This order expired. Start a new one to continue.",
  "errors.price_changed":
    "Prices have changed for: {name}. Refresh the cart and try again.",
  "errors.table_session_expired":
    "This table session ended. Scan the QR again or pick another mode.",
  "errors.scheduled_time_too_soon":
    "Pick a time at least 15 minutes from now.",
  "errors.tip_too_high":
    "That tip seems unusually high. Adjust and try again.",
  "errors.tip_without_items": "Add at least one item before adding a tip.",
  "errors.phone_invalid":
    "Enter a valid Uzbek phone number (+998 XX XXX XX XX).",
  "errors.try_again": "Try again",
  "errors.cart_save_failed": "Could not save cart change.",
  "errors.place_order_failed": "Could not place your order. Try again.",

  "share.link_copied": "Link copied",
  "share.copy_fallback": "Paste it anywhere to share.",
  "share.unable_to_copy": "Unable to copy link.",

  "aria.close_drawer": "Close cart",
  "aria.decrease_quantity": "Decrease quantity",
  "aria.increase_quantity": "Increase quantity",
  "aria.remove_item": "Remove item",
  "aria.remove_from_cart": "Remove from cart",
  "aria.share": "Share",
  "aria.remove_item_named": "Remove {name} from cart",
  "aria.decrease_item_named": "Decrease {name} quantity",
  "aria.increase_item_named": "Increase {name} quantity",
  "aria.cart_quantity_config": "Cart quantity for this configuration",
  "aria.cart_quantity_named": "Cart quantity for {name}",
};

const RU: MessageTable = {
  all: "Все",

  "catalog.empty": "В этом каталоге пока нет категорий и позиций.",
  "catalog.category_empty": "В этой категории пока нет позиций.",

  "cart.title": "Корзина",
  "cart.description": "Просмотрите позиции в корзине и перейдите к оформлению.",
  "cart.empty": "Ваша корзина пуста.",
  "cart.empty.hint": "Добавьте позиции из меню, чтобы начать.",
  "cart.empty.cta": "В меню",
  "cart.continue": "Далее",
  "cart.keep_shopping": "Продолжить покупки",
  "cart.subtotal": "Подытог",
  "cart.total": "Итого",
  "cart.tax": "Налог",
  "cart.service_fee": "Сервисный сбор",
  "cart.tip": "Чаевые",
  "cart.modifier_pricing_hint": "Цены модификаторов указаны за позицию.",
  "cart.item_count_plural": "{count} позиций",
  "cart.mode_pill.dine_in": "В зале · Стол {table}",

  "checkout.title": "Оформление",
  "checkout.back": "Назад",
  "checkout.place_order": "Оформить заказ",
  "checkout.placing": "Отправляем заказ…",
  "checkout.mode.dine_in": "В зале",
  "checkout.mode.pickup": "Самовывоз",
  "checkout.mode.delivery": "Доставка",
  "checkout.mode.title": "Как получить заказ?",
  "checkout.mode.subtitle": "Выберите способ получения заказа",
  "checkout.edit_cart": "Изменить корзину",
  "checkout.mode_unavailable":
    "Этот способ сейчас недоступен. Выберите другой.",
  "checkout.tip.label": "Чаевые",
  "checkout.tip.none": "Без чаевых",
  "checkout.tip.custom": "Своя сумма",
  "checkout.tip.custom_placeholder": "Введите сумму чаевых",
  "checkout.tip.preset": "{percent}%",
  "checkout.schedule.when": "Когда",
  "checkout.schedule.asap": "Как можно скорее",
  "checkout.schedule.scheduled": "Запланировать",
  "checkout.schedule.pick_date": "Выберите дату",
  "checkout.schedule.time_aria": "Время",
  "checkout.table.label": "Стол",
  "checkout.table.placeholder": "Номер стола",
  "checkout.address.label": "Адрес",
  "checkout.address.placeholder": "Дом, улица, город",
  "checkout.address.district.label": "Район",
  "checkout.address.district.placeholder": "Напр. Мирзо-Улугбекский",
  "checkout.address.street.label": "Улица",
  "checkout.address.street.placeholder": "Напр. Амира Темура",
  "checkout.address.building.label": "Дом / Квартира",
  "checkout.address.building.placeholder": "Напр. 12, кв. 45",
  "checkout.recipient.label": "Получатель",
  "checkout.recipient.placeholder": "Ваше имя",
  "checkout.phone.label": "Телефон",
  "checkout.phone.placeholder": "XX XXX XX XX",
  "checkout.note.label": "Комментарий",
  "checkout.note.placeholder": "Что нам стоит знать? (необязательно)",
  "checkout.missing.address": "Выберите адрес доставки",
  "checkout.missing.name": "Укажите имя получателя",
  "checkout.missing.phone": "Введите корректный номер телефона",
  "checkout.missing.time": "Выберите время",
  "checkout.missing.table": "Укажите номер столика",
  "checkout.out_of_zone": "Вне зоны доставки",
  "checkout.below_min_order": "Минимальный заказ для доставки — {amount}",
  "cart.delivery_free": "Бесплатно",
  "checkout.tip.add": "Добавить чаевые",
  "checkout.schedule.pickup_when": "Время самовывоза",
  "checkout.schedule.delivery_when": "Время доставки",
  "checkout.your_name": "Ваше имя",
  "checkout.section.contact": "Контактные данные",
  "checkout.contact": "Контакт",
  "checkout.summary.heading": "Ваш заказ",
  "checkout.payment.heading": "Способ оплаты",
  "checkout.payment.cash": "Наличными",
  "checkout.payment.card": "Картой",
  "checkout.payment.card_hint": "Оплатите картой на защищённой странице и вернётесь обратно.",
  "checkout.card_unavailable_cash": "Онлайн-оплата сейчас недоступна — заказ оформлен с оплатой при получении.",
  "checkout.chip.required": "Обязательно",
  "checkout.chip.optional": "Необязательно",
  "address.title": "Адрес доставки",
  "address.use_location": "Использовать геолокацию",
  "address.add": "Добавить адрес",
  "address.change": "Изменить",
  "address.new": "Новый адрес",
  "address.edit_title": "Изменить адрес",
  "address.loading": "Загрузка адресов…",
  "address.search": "Поиск адреса",
  "address.confirm": "Подтвердить",
  "address.resolving": "Определяем адрес…",
  "address.map_hint": "Подвиньте карту, чтобы уточнить вход",
  "address.edit_on_map": "Изменить на карте",
  "address.save": "Сохранить",
  "address.delete": "Удалить адрес",
  "address.delete_confirm_title": "Удалить этот адрес?",
  "address.delete_confirm_body": "Это действие нельзя отменить.",
  "address.set_default": "Сделать основным",
  "address.default": "По умолчанию",
  "address.summary_empty": "Добавить адрес доставки",
  "address.helps_delivery": "Поможет курьеру вас найти",
  "address.field.entrance": "Подъезд",
  "address.field.floor": "Этаж",
  "address.field.apartment": "Квартира",
  "address.field.intercom": "Домофон",
  "address.field.note": "Комментарий курьеру",
  "address.field.note_ph": "позвонить за 10 минут · вход со двора",
  "address.field.label": "Метка",
  "address.label.home": "Дом",
  "address.label.work": "Работа",
  "address.label.other": "Другое",

  "placed.title": "Заказ оформлен",
  "placed.order_label": "Заказ",
  "placed.status": "Принят",
  "placed.subtitle.dine_in":
    "Передали на кухню — заказ скоро принесут к столу {table}.",
  "placed.subtitle.pickup":
    "Заказ принят — скоро будет готов к выдаче.",
  "placed.subtitle.delivery":
    "Заказ принят — продавец подготовит его и отправит к вам.",
  "placed.pay.dine_in": "Оплата на столе, когда официант принесёт счёт.",
  "placed.pay.pickup": "Оплата на стойке при получении.",
  "placed.pay.delivery": "Оплата курьеру наличными при доставке.",
  "placed.done": "Готово",
  "placed.order_more": "Заказать ещё",
  "placed.view_previous": "Показать прошлый заказ",
  "placed.scheduled_for": "Запланировано на {time}",

  "add_to_cart.label": "В корзину",
  "add_to_cart.short": "Добавить",
  "add_to_cart.aria": "Добавить {name} в корзину",
  "add_to_cart.label_with_price": "В корзину  •  {price}",
  "add_to_cart.added": "Добавлено: {name}",
  "add_to_cart.view": "Перейти в корзину",
  "add_to_cart.choose_options": "Выбрать опции",
  "add_to_cart.view_item": "Подробнее",
  "add_to_cart.adding": "Добавляем…",
  "add_to_cart.gated_required_one": "Сделайте 1 обязательный выбор",
  "add_to_cart.gated_required_many": "Сделайте {count} обязательных выборов",
  "customisations.title": "Ваши настройки этого блюда",
  "customisations.add_new": "Добавить ещё с другими настройками",
  "search.placeholder": "Поиск по меню",
  "search.open_aria": "Открыть поиск",
  "search.title": "Поиск",
  "search.close_aria": "Закрыть поиск",
  "search.prompt": "Начните вводить, чтобы искать позиции и категории.",
  "search.error": "Не удалось загрузить результаты поиска. Попробуйте снова.",
  "search.no_results": "Пока ничего не найдено. Попробуйте другой запрос.",
  "search.items_heading": "Позиции",
  "search.categories_heading": "Категории",
  "language.select_aria": "Выбрать язык",
  "theme.toggle_aria": "Переключить тему",
  "theme.light": "Светлая",
  "theme.dark": "Тёмная",
  "theme.system": "Системная",
  "variation.label": "Выберите вариант",
  "variation.sold_out": "Нет в наличии",
  "modifier.required": "Обязательно",
  "modifier.required_satisfied": "Обязательно (выбрано)",
  "modifier.required_pending": "Обязательно (не выбрано)",
  "modifier.hint.choose_one": "Выберите 1",
  "modifier.hint.choose_n": "Выберите {count}",
  "modifier.hint.up_to": "До {count}",
  "modifier.hint.at_least": "Минимум {count}",
  "modifier.hint.choose_range": "Выберите от {min} до {max}",
  "modifier.hint.up_to_chars": "До {count} символов",
  "modifier.hint.optional_up_to_chars": "Необязательно · до {count} символов",
  "assistant.title": "Ассистент",
  "assistant.empty_title": "Что вы ищете?",
  "assistant.empty_hint": "Спросите на любом языке — я найду.",
  "assistant.suggestion_recommend": "Что посоветуете?",
  "assistant.suggestion_popular": "Покажите популярное",
  "assistant.suggestion_gift": "Ищу подарок",
  "assistant.searching": "Ищу…",
  "assistant.error": "Что-то пошло не так. Попробуйте снова.",
  "assistant.input_placeholder": "Спросите что угодно…",
  "assistant.added_to_cart": "Добавлено в корзину: {name}",
  "assistant.opened_choose_options": "Открыли {name} — выберите опции, чтобы добавить",
  "assistant.close_aria": "Закрыть ассистента",
  "assistant.send_aria": "Отправить",

  "table_check.open_aria": "Открыть счёт стола",
  "table_check.table": "Стол {table}",
  "table_check.round_count_plural": "{count} заказов",
  "table_check.round_count_plural.one": "{count} заказ",
  "table_check.round_count_plural.few": "{count} заказа",
  "table_check.round_count_plural.many": "{count} заказов",
  "table_check.subtitle": "Ваш счёт за этим столом",
  "table_check.round": "Заказ {number}",
  "table_check.total": "Итого по столу",
  "table_check.request_bill": "Попросить счёт",
  "table_check.bill_requested": "Счёт запрошен",
  "table_check.requesting": "Запрашиваем…",
  "table_check.status_served": "Подано",
  "table_check.status_preparing": "Готовится",

  "errors.network": "Проблема с сетью. Проверьте подключение и попробуйте снова.",
  "errors.item_not_found": "Эта позиция больше недоступна.",
  "errors.modifier_unavailable":
    "Опция «{name}» больше недоступна. Выберите другую или удалите её.",
  "errors.cart_empty": "Ваша корзина пуста.",
  "errors.order_expired":
    "Срок действия этого заказа истёк. Начните новый заказ.",
  "errors.price_changed":
    "Цены изменились: {name}. Обновите корзину и попробуйте снова.",
  "errors.table_session_expired":
    "Сессия столика завершена. Отсканируйте QR заново или выберите другой режим.",
  "errors.scheduled_time_too_soon":
    "Выберите время минимум через 15 минут.",
  "errors.tip_too_high":
    "Сумма чаевых выглядит слишком большой. Поправьте, пожалуйста.",
  "errors.tip_without_items":
    "Добавьте хотя бы одну позицию перед чаевыми.",
  "errors.phone_invalid":
    "Введите корректный узбекский номер (+998 XX XXX XX XX).",
  "errors.try_again": "Повторить",
  "errors.cart_save_failed": "Не удалось сохранить изменения корзины.",
  "errors.place_order_failed":
    "Не удалось оформить заказ. Попробуйте снова.",

  "share.link_copied": "Ссылка скопирована",
  "share.copy_fallback": "Вставьте, чтобы поделиться.",
  "share.unable_to_copy": "Не удалось скопировать ссылку.",

  "aria.close_drawer": "Закрыть корзину",
  "aria.decrease_quantity": "Уменьшить количество",
  "aria.increase_quantity": "Увеличить количество",
  "aria.remove_item": "Удалить позицию",
  "aria.remove_from_cart": "Удалить из корзины",
  "aria.share": "Поделиться",
  "aria.remove_item_named": "Удалить {name} из корзины",
  "aria.decrease_item_named": "Уменьшить количество: {name}",
  "aria.increase_item_named": "Увеличить количество: {name}",
  "aria.cart_quantity_config": "Количество в корзине для этой конфигурации",
  "aria.cart_quantity_named": "Количество в корзине: {name}",
};

const UZ_LATN: MessageTable = {
  all: "Hammasi",

  "catalog.empty": "Bu katalogda hozircha turkum va mahsulotlar yo‘q.",
  "catalog.category_empty": "Bu turkumda hozircha mahsulotlar yo‘q.",

  "cart.title": "Savatcha",
  "cart.description": "Savatchangizdagi taomlarni ko‘rib chiqing va buyurtma berishga o‘ting.",
  "cart.empty": "Savatchangiz bo‘sh.",
  "cart.empty.hint": "Boshlash uchun menyudan taom qo‘shing.",
  "cart.empty.cta": "Menyuga o‘tish",
  "cart.continue": "Davom etish",
  "cart.keep_shopping": "Xaridni davom ettirish",
  "cart.subtotal": "Oraliq jami",
  "cart.total": "Jami",
  "cart.tax": "Soliq",
  "cart.service_fee": "Xizmat haqi",
  "cart.tip": "Chaqimcha",
  "cart.modifier_pricing_hint": "Modifikator narxi har bir taom uchun.",
  "cart.mode_pill.dine_in": "Zalda · {table}-stol",
  "cart.item_count_plural": "{count} ta taom",

  "checkout.title": "Buyurtma berish",
  "checkout.back": "Orqaga",
  "checkout.place_order": "Buyurtma berish",
  "checkout.placing": "Buyurtma yuborilmoqda…",
  "checkout.mode.dine_in": "Zalda",
  "checkout.mode.pickup": "O‘zi olib ketish",
  "checkout.mode.delivery": "Yetkazib berish",
  "checkout.mode.title": "Buyurtmani qanday olasiz?",
  "checkout.mode.subtitle": "Buyurtmani olish usulini tanlang",
  "checkout.edit_cart": "Savatchani tahrirlash",
  "checkout.mode_unavailable":
    "Bu variant hozir mavjud emas. Boshqasini tanlang.",
  "checkout.tip.label": "Chaqimcha",
  "checkout.tip.none": "Chaqimchasiz",
  "checkout.tip.custom": "Boshqa miqdor",
  "checkout.tip.custom_placeholder": "Chaqimcha miqdorini kiriting",
  "checkout.tip.preset": "{percent}%",
  "checkout.schedule.when": "Qachon",
  "checkout.schedule.asap": "Tezroq",
  "checkout.schedule.scheduled": "Rejalashtirish",
  "checkout.schedule.pick_date": "Sanani tanlang",
  "checkout.schedule.time_aria": "Vaqt",
  "checkout.table.label": "Stol",
  "checkout.table.placeholder": "Stol raqami",
  "checkout.address.label": "Manzil",
  "checkout.address.placeholder": "Uy, ko‘cha, shahar",
  "checkout.address.district.label": "Tuman",
  "checkout.address.district.placeholder": "Masalan: Mirzo Ulug‘bek",
  "checkout.address.street.label": "Ko‘cha",
  "checkout.address.street.placeholder": "Masalan: Amir Temur",
  "checkout.address.building.label": "Uy / Xonadon",
  "checkout.address.building.placeholder": "Masalan: 12, xonadon 45",
  "checkout.recipient.label": "Qabul qiluvchi",
  "checkout.recipient.placeholder": "Ismingiz",
  "checkout.phone.label": "Telefon",
  "checkout.phone.placeholder": "XX XXX XX XX",
  "checkout.note.label": "Izoh",
  "checkout.note.placeholder": "Biz bilishimiz kerakmi? (ixtiyoriy)",
  "checkout.missing.address": "Yetkazib berish manzilini tanlang",
  "checkout.missing.name": "Qabul qiluvchi ismini kiriting",
  "checkout.missing.phone": "To‘g‘ri telefon raqamini kiriting",
  "checkout.missing.time": "Vaqtni tanlang",
  "checkout.missing.table": "Stol raqamini kiriting",
  "checkout.out_of_zone": "Yetkazib berish hududidan tashqarida",
  "checkout.below_min_order": "Yetkazib berish uchun minimal buyurtma — {amount}",
  "cart.delivery_free": "Bepul",
  "checkout.tip.add": "Chaqimcha qo‘shish",
  "checkout.schedule.pickup_when": "Olib ketish vaqti",
  "checkout.schedule.delivery_when": "Yetkazib berish vaqti",
  "checkout.your_name": "Ismingiz",
  "checkout.section.contact": "Aloqa ma’lumotlari",
  "checkout.contact": "Aloqa",
  "checkout.summary.heading": "Buyurtma tafsilotlari",
  "checkout.payment.heading": "To'lov usuli",
  "checkout.payment.cash": "Naqd pul",
  "checkout.payment.card": "Karta",
  "checkout.payment.card_hint": "Karta bilan xavfsiz sahifada to'laysiz va qaytib kelasiz.",
  "checkout.card_unavailable_cash": "Onlayn to'lov hozir mavjud emas — buyurtma yetkazib berilganda naqd to'lov bilan rasmiylashtirildi.",
  "checkout.chip.required": "Majburiy",
  "checkout.chip.optional": "Ixtiyoriy",
  "address.title": "Yetkazib berish manzili",
  "address.use_location": "Joylashuvdan foydalanish",
  "address.add": "Manzil qo‘shish",
  "address.change": "O‘zgartirish",
  "address.new": "Yangi manzil",
  "address.edit_title": "Manzilni tahrirlash",
  "address.loading": "Manzillar yuklanmoqda…",
  "address.search": "Manzilni qidirish",
  "address.confirm": "Tasdiqlash",
  "address.resolving": "Manzil aniqlanmoqda…",
  "address.map_hint": "Kirishni aniqlash uchun xaritani suring",
  "address.edit_on_map": "Xaritada o‘zgartirish",
  "address.save": "Saqlash",
  "address.delete": "Manzilni o‘chirish",
  "address.delete_confirm_title": "Ushbu manzil o‘chirilsinmi?",
  "address.delete_confirm_body": "Buni bekor qilib bo‘lmaydi.",
  "address.set_default": "Asosiy qilish",
  "address.default": "Asosiy",
  "address.summary_empty": "Yetkazish manzilini qo‘shing",
  "address.helps_delivery": "Kuryerga sizni topishda yordam beradi",
  "address.field.entrance": "Kirish",
  "address.field.floor": "Qavat",
  "address.field.apartment": "Xonadon",
  "address.field.intercom": "Domofon",
  "address.field.note": "Kuryerga izoh",
  "address.field.note_ph": "10 daqiqa oldin qo‘ng‘iroq qiling · hovlidan kirish",
  "address.field.label": "Yorliq",
  "address.label.home": "Uy",
  "address.label.work": "Ish",
  "address.label.other": "Boshqa",

  "placed.title": "Buyurtma qabul qilindi",
  "placed.order_label": "Buyurtma",
  "placed.status": "Qabul qilindi",
  "placed.subtitle.dine_in":
    "Buyurtmangiz oshxonaga yuborildi — {table}-stol uchun tez orada keladi.",
  "placed.subtitle.pickup":
    "Buyurtma qabul qilindi — tez orada olib ketishga tayyor bo‘ladi.",
  "placed.subtitle.delivery":
    "Buyurtma qabul qilindi — sotuvchi tayyorlab, sizga yuboradi.",
  "placed.pay.dine_in":
    "Ofitsiant hisob-kitobni keltirgach, stolda to‘laysiz.",
  "placed.pay.pickup": "Olib ketishda kassada to‘laysiz.",
  "placed.pay.delivery": "Kuryerga naqd to‘laysiz.",
  "placed.done": "Tayyor",
  "placed.order_more": "Yana buyurtma berish",
  "placed.view_previous": "Avvalgi buyurtmani ko‘rish",
  "placed.scheduled_for": "{time} ga rejalashtirildi",

  "add_to_cart.label": "Savatchaga",
  "add_to_cart.short": "Qo‘shish",
  "add_to_cart.aria": "{name}ni savatchaga qo‘shish",
  "add_to_cart.label_with_price": "Savatchaga  •  {price}",
  "add_to_cart.added": "Qo‘shildi: {name}",
  "add_to_cart.view": "Savatchaga o‘tish",
  "add_to_cart.choose_options": "Tanlash",
  "add_to_cart.view_item": "Batafsil",
  "add_to_cart.adding": "Qo‘shilmoqda…",
  "add_to_cart.gated_required_one": "1 ta majburiy tanlovni bajaring",
  "add_to_cart.gated_required_many": "{count} ta majburiy tanlovni bajaring",
  "customisations.title": "Bu mahsulot uchun sozlamalaringiz",
  "customisations.add_new": "Boshqa sozlamalar bilan qo‘shish",
  "search.placeholder": "Menyu bo‘yicha qidirish",
  "search.open_aria": "Qidiruvni ochish",
  "search.title": "Qidiruv",
  "search.close_aria": "Qidiruvni yopish",
  "search.prompt": "Mahsulot va turkumlarni qidirish uchun yozishni boshlang.",
  "search.error": "Qidiruv natijalarini yuklab bo‘lmadi. Qayta urinib ko‘ring.",
  "search.no_results": "Hozircha hech narsa topilmadi. Boshqa so‘z bilan urinib ko‘ring.",
  "search.items_heading": "Mahsulotlar",
  "search.categories_heading": "Turkumlar",
  "language.select_aria": "Tilni tanlash",
  "theme.toggle_aria": "Mavzuni almashtirish",
  "theme.light": "Yorug‘",
  "theme.dark": "Qorong‘i",
  "theme.system": "Tizim",
  "variation.label": "Variantni tanlang",
  "variation.sold_out": "Tugagan",
  "modifier.required": "Majburiy",
  "modifier.required_satisfied": "Majburiy (tanlandi)",
  "modifier.required_pending": "Majburiy (tanlanmagan)",
  "modifier.hint.choose_one": "1 ta tanlang",
  "modifier.hint.choose_n": "{count} ta tanlang",
  "modifier.hint.up_to": "{count} tagacha",
  "modifier.hint.at_least": "Kamida {count} ta",
  "modifier.hint.choose_range": "{min}–{max} ta tanlang",
  "modifier.hint.up_to_chars": "{count} belgigacha",
  "modifier.hint.optional_up_to_chars": "Ixtiyoriy · {count} belgigacha",
  "assistant.title": "Yordamchi",
  "assistant.empty_title": "Nimani qidiryapsiz?",
  "assistant.empty_hint": "Istalgan tilda so‘rang — men topib beraman.",
  "assistant.suggestion_recommend": "Nimani tavsiya qilasiz?",
  "assistant.suggestion_popular": "Ommabop mahsulotlarni ko‘rsating",
  "assistant.suggestion_gift": "Sovg‘a qidiryapman",
  "assistant.searching": "Qidiryapman…",
  "assistant.error": "Nimadir xato ketdi. Qayta urinib ko‘ring.",
  "assistant.input_placeholder": "Istalgan narsani so‘rang…",
  "assistant.added_to_cart": "Savatchaga qo‘shildi: {name}",
  "assistant.opened_choose_options": "{name} ochildi — qo‘shish uchun variantlarni tanlang",
  "assistant.close_aria": "Yordamchini yopish",
  "assistant.send_aria": "Yuborish",

  "table_check.open_aria": "Stol hisobini ochish",
  "table_check.table": "Stol {table}",
  "table_check.round_count_plural": "{count} ta buyurtma",
  "table_check.subtitle": "Shu stoldagi hisobingiz",
  "table_check.round": "{number}-buyurtma",
  "table_check.total": "Stol bo‘yicha jami",
  "table_check.request_bill": "Hisobni so‘rash",
  "table_check.bill_requested": "Hisob so‘raldi",
  "table_check.requesting": "So‘ralmoqda…",
  "table_check.status_served": "Berildi",
  "table_check.status_preparing": "Tayyorlanmoqda",

  "errors.network": "Internet bilan muammo. Aloqani tekshirib qaytadan urinib ko‘ring.",
  "errors.item_not_found": "Bu taom endi mavjud emas.",
  "errors.modifier_unavailable":
    "«{name}» endi mavjud emas. Boshqasini tanlang yoki olib tashlang.",
  "errors.cart_empty": "Savatchangiz bo‘sh.",
  "errors.order_expired":
    "Bu buyurtma muddati o‘tdi. Yangi buyurtma boshlang.",
  "errors.price_changed":
    "Narxlar o‘zgardi: {name}. Savatchani yangilab qaytadan urinib ko‘ring.",
  "errors.table_session_expired":
    "Stol sessiyasi tugadi. QR-kodni qayta skanerlang yoki boshqa rejimni tanlang.",
  "errors.scheduled_time_too_soon":
    "Hozirgi vaqtdan kamida 15 daqiqa keyingi vaqtni tanlang.",
  "errors.tip_too_high":
    "Chaqimcha summasi noodatiy katta ko‘rinadi. Iltimos, qayta kiriting.",
  "errors.tip_without_items":
    "Chaqimcha qo‘shishdan oldin kamida bitta taom qo‘shing.",
  "errors.phone_invalid":
    "To‘g‘ri o‘zbek raqamini kiriting (+998 XX XXX XX XX).",
  "errors.try_again": "Qayta urinish",
  "errors.cart_save_failed": "Savatcha o‘zgarishini saqlab bo‘lmadi.",
  "errors.place_order_failed":
    "Buyurtmani yuborib bo‘lmadi. Qayta urinib ko‘ring.",

  "share.link_copied": "Havola nusxalandi",
  "share.copy_fallback": "Ulashish uchun joylashtiring.",
  "share.unable_to_copy": "Havolani nusxalab bo‘lmadi.",

  "aria.close_drawer": "Savatchani yopish",
  "aria.decrease_quantity": "Miqdorni kamaytirish",
  "aria.increase_quantity": "Miqdorni oshirish",
  "aria.remove_item": "Taomni olib tashlash",
  "aria.remove_from_cart": "Savatchadan olib tashlash",
  "aria.share": "Ulashish",
  "aria.remove_item_named": "{name}ni savatchadan olib tashlash",
  "aria.decrease_item_named": "{name} miqdorini kamaytirish",
  "aria.increase_item_named": "{name} miqdorini oshirish",
  "aria.cart_quantity_config": "Ushbu tanlov uchun savatchadagi miqdor",
  "aria.cart_quantity_named": "{name} uchun savatchadagi miqdor",
};

/**
 * Per-locale tables. Locales that ship with full coverage (en, ru,
 * uz-Latn) get their own table. Locales not listed here fall back to
 * English via the resolution chain — acceptable v1 behavior, can be
 * filled out per merchant demand.
 *
 * Carryover entries for the other registry locales (uz-Cyrl, it, tg,
 * etc.) still translate the `all` filter chip via the legacy
 * single-key catalogs.
 */
const STOREFRONT_MESSAGES: Record<string, MessageTable> = {
  en: EN,
  ru: RU,
  "uz-Latn": UZ_LATN,
  "uz-Cyrl": { all: "Ҳаммаси" },
  it: { all: "Tutto" },
  tg: { all: "Ҳама" },
  "kk-Latn": { all: "Bárlıq" },
  "kk-Cyrl": { all: "Барлық" },
  ky: { all: "Баары" },
  ar: { all: "الكل" },
  fa: { all: "همه" },
  fr: { all: "Tout" },
  de: { all: "Alle" },
  es: { all: "Todo" },
  pt: { all: "Todos" },
  zh: { all: "全部" },
  ja: { all: "すべて" },
  ko: { all: "전체" },
  tr: { all: "Tümü" },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Interpolate `{var}` placeholders in a message with values from `vars`.
 * Unknown placeholders are left as-is so they're visible in debugging
 * rather than silently dropped.
 */
function interpolate(
  template: string,
  vars: Record<string, string | number> | undefined,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

function lookup(
  key: StorefrontMessageKey,
  activeLocale?: string | null,
  defaultLocale?: string | null,
): string | undefined {
  if (activeLocale) {
    const value = STOREFRONT_MESSAGES[activeLocale]?.[key];
    if (value) return value;
  }
  if (defaultLocale) {
    const value = STOREFRONT_MESSAGES[defaultLocale]?.[key];
    if (value) return value;
  }
  return STOREFRONT_MESSAGES.en[key];
}

/**
 * getStorefrontMessage — resolve a system label to the right locale,
 * with optional `{var}` interpolation.
 *
 * Resolution order: activeLocale → defaultLocale → English. Mirrors
 * pickLocalizedField for merchant content so a half-translated catalog
 * never produces a half-translated UI.
 *
 * Backward-compatible: `vars` is optional, existing callers pass only
 * the locale options.
 */
export function getStorefrontMessage(
  key: StorefrontMessageKey,
  {
    activeLocale,
    defaultLocale,
    vars,
  }: {
    activeLocale?: string | null;
    defaultLocale?: string | null;
    vars?: Record<string, string | number>;
  },
): string {
  const template = lookup(key, activeLocale, defaultLocale);
  if (!template) {
    // Should never happen for keys in the English table. Surface the
    // key itself so a missing entry is visible to QA rather than
    // silently producing empty strings.
    return key;
  }
  return interpolate(template, vars);
}

// ============================================================================
// Pluralization
// ============================================================================
//
// Russian has 3 plural categories (one, few, many). English and uz-Latn
// have 2 (one, other). Intl.PluralRules picks the right category for
// the locale at runtime — no hand-rolled plurals tables.
//
// Catalog entries for plural-aware strings ship under the singular key
// (e.g. `cart.item_count_plural`). The runtime helper appends the
// category suffix (e.g. `cart.item_count_plural.one`,
// `cart.item_count_plural.few`, `cart.item_count_plural.many`,
// `cart.item_count_plural.other`).
//
// For v1 we ship only the `other` form in the catalog above and treat
// it as a single-form plural ("3 items", "3 позиций", "3 ta taom").
// When merchant feedback demands proper Russian plural forms we add
// the suffix-keyed entries and the helper picks them up without code
// changes.

const PLURAL_RULES_CACHE = new Map<string, Intl.PluralRules>();

function getPluralRules(locale: string): Intl.PluralRules {
  let rules = PLURAL_RULES_CACHE.get(locale);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale);
    } catch {
      rules = new Intl.PluralRules("en");
    }
    PLURAL_RULES_CACHE.set(locale, rules);
  }
  return rules;
}

/**
 * getStorefrontPlural — pluralize a system label for a count.
 *
 * Looks up `{key}.{category}` first (where category = "one" / "few" /
 * "many" / "other"), then falls back to the base key, then to English.
 * `count` is interpolated as `{count}`.
 *
 * v1 ships single-form plurals (only `other` filled in). If RU feedback
 * demands proper three-form pluralization, add `.one` / `.few` / `.many`
 * keys to the RU table and this helper picks them up automatically.
 */
export function getStorefrontPlural(
  key: StorefrontMessageKey,
  count: number,
  {
    activeLocale,
    defaultLocale,
    vars,
  }: {
    activeLocale?: string | null;
    defaultLocale?: string | null;
    vars?: Record<string, string | number>;
  },
): string {
  const locale = activeLocale || defaultLocale || "en";
  const category = getPluralRules(locale).select(count);

  // Try the category-suffixed key first. If it's not in the catalog,
  // fall back to the base key.
  const suffixedKey = `${key}.${category}` as StorefrontMessageKey;
  const template =
    lookup(suffixedKey, activeLocale, defaultLocale) ??
    lookup(key, activeLocale, defaultLocale) ??
    key;

  return interpolate(template, { count, ...vars });
}
