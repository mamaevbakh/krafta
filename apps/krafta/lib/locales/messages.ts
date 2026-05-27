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
  // Cart drawer chrome
  | "cart.title"
  | "cart.empty"
  | "cart.empty.hint"
  | "cart.continue"
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
  | "checkout.mode_unavailable"
  | "checkout.tip.label"
  | "checkout.tip.none"
  | "checkout.tip.custom"
  | "checkout.tip.preset"
  | "checkout.schedule.when"
  | "checkout.schedule.asap"
  | "checkout.schedule.scheduled"
  | "checkout.schedule.pick_date"
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
  // Placed step
  | "placed.title"
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
  | "add_to_cart.label_with_price"
  | "add_to_cart.added"
  | "add_to_cart.view"
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
  // Header language switcher — aria label on the globe-icon trigger.
  // The dropdown items themselves use each locale's `display_name`
  // (merchant-curated), so the only localized string we need is the
  // affordance label for screen readers.
  | "language.select_aria"
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
  | "aria.remove_item";

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

  "cart.title": "Your cart",
  "cart.empty": "Your cart is empty.",
  "cart.empty.hint": "Add items from the menu to get started.",
  "cart.continue": "Continue",
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
  "checkout.mode_unavailable":
    "This option isn't available right now. Pick another mode.",
  "checkout.tip.label": "Tip",
  "checkout.tip.none": "No tip",
  "checkout.tip.custom": "Custom",
  "checkout.tip.preset": "{percent}%",
  "checkout.schedule.when": "When",
  "checkout.schedule.asap": "As soon as possible",
  "checkout.schedule.scheduled": "Schedule",
  "checkout.schedule.pick_date": "Pick a date",
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

  "placed.title": "Order placed",
  "placed.subtitle.dine_in":
    "We sent it to the kitchen — your order will arrive at table {table} shortly.",
  "placed.subtitle.pickup": "We sent it to the kitchen — ready for pickup soon.",
  "placed.subtitle.delivery": "We sent it to the kitchen — on its way to you.",
  "placed.pay.dine_in": "Pay at the table when your server brings the bill.",
  "placed.pay.pickup": "Pay at the counter when you pick up.",
  "placed.pay.delivery": "Pay the courier in cash on arrival.",
  "placed.done": "Done",
  "placed.order_more": "Order more",
  "placed.view_previous": "View previous order",
  "placed.scheduled_for": "Scheduled for {time}",

  "add_to_cart.label": "Add to cart",
  "add_to_cart.label_with_price": "Add  •  {price}",
  "add_to_cart.added": "Added {name}",
  "add_to_cart.view": "View cart",
  "add_to_cart.adding": "Adding…",
  "add_to_cart.gated_required_one": "Make 1 required selection",
  "add_to_cart.gated_required_many": "Make {count} required selections",
  "customisations.title": "Your customisations for this item",
  "customisations.add_new": "Add new customised item",
  "search.placeholder": "Search the menu",
  "search.open_aria": "Open search",
  "language.select_aria": "Select language",

  "errors.network":
    "Network issue. Check your connection and try again.",
  "errors.item_not_found": "This item is no longer available.",
  "errors.modifier_unavailable":
    "\"{name}\" is no longer available. Pick another option or remove it.",
  "errors.cart_empty": "Your cart is empty.",
  "errors.order_expired":
    "This order expired. Start a new one to continue.",
  "errors.price_changed":
    "The price of \"{name}\" changed from {old} to {new}. Update and continue?",
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
};

const RU: MessageTable = {
  all: "Все",

  "cart.title": "Корзина",
  "cart.empty": "Ваша корзина пуста.",
  "cart.empty.hint": "Добавьте позиции из меню, чтобы начать.",
  "cart.continue": "Далее",
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
  "checkout.mode_unavailable":
    "Этот способ сейчас недоступен. Выберите другой.",
  "checkout.tip.label": "Чаевые",
  "checkout.tip.none": "Без чаевых",
  "checkout.tip.custom": "Своя сумма",
  "checkout.tip.preset": "{percent}%",
  "checkout.schedule.when": "Когда",
  "checkout.schedule.asap": "Как можно скорее",
  "checkout.schedule.scheduled": "Запланировать",
  "checkout.schedule.pick_date": "Выберите дату",
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

  "placed.title": "Заказ оформлен",
  "placed.subtitle.dine_in":
    "Передали на кухню — заказ скоро принесут к столу {table}.",
  "placed.subtitle.pickup":
    "Передали на кухню — будет готов к выдаче в ближайшее время.",
  "placed.subtitle.delivery": "Передали на кухню — заказ уже в пути.",
  "placed.pay.dine_in": "Оплата на столе, когда официант принесёт счёт.",
  "placed.pay.pickup": "Оплата на стойке при получении.",
  "placed.pay.delivery": "Оплата курьеру наличными при доставке.",
  "placed.done": "Готово",
  "placed.order_more": "Заказать ещё",
  "placed.view_previous": "Показать прошлый заказ",
  "placed.scheduled_for": "Запланировано на {time}",

  "add_to_cart.label": "В корзину",
  "add_to_cart.label_with_price": "В корзину  •  {price}",
  "add_to_cart.added": "Добавлено: {name}",
  "add_to_cart.view": "Перейти в корзину",
  "add_to_cart.adding": "Добавляем…",
  "add_to_cart.gated_required_one": "Сделайте 1 обязательный выбор",
  "add_to_cart.gated_required_many": "Сделайте {count} обязательных выборов",
  "customisations.title": "Ваши настройки этого блюда",
  "customisations.add_new": "Добавить ещё с другими настройками",
  "search.placeholder": "Поиск по меню",
  "search.open_aria": "Открыть поиск",
  "language.select_aria": "Выбрать язык",

  "errors.network": "Проблема с сетью. Проверьте подключение и попробуйте снова.",
  "errors.item_not_found": "Эта позиция больше недоступна.",
  "errors.modifier_unavailable":
    "Опция «{name}» больше недоступна. Выберите другую или удалите её.",
  "errors.cart_empty": "Ваша корзина пуста.",
  "errors.order_expired":
    "Срок действия этого заказа истёк. Начните новый заказ.",
  "errors.price_changed":
    "Цена «{name}» изменилась с {old} на {new}. Обновить и продолжить?",
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
};

const UZ_LATN: MessageTable = {
  all: "Hammasi",

  "cart.title": "Savatcha",
  "cart.empty": "Savatchangiz bo‘sh.",
  "cart.empty.hint": "Boshlash uchun menyudan taom qo‘shing.",
  "cart.continue": "Davom etish",
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
  "checkout.mode_unavailable":
    "Bu variant hozir mavjud emas. Boshqasini tanlang.",
  "checkout.tip.label": "Chaqimcha",
  "checkout.tip.none": "Chaqimchasiz",
  "checkout.tip.custom": "Boshqa miqdor",
  "checkout.tip.preset": "{percent}%",
  "checkout.schedule.when": "Qachon",
  "checkout.schedule.asap": "Tezroq",
  "checkout.schedule.scheduled": "Rejalashtirish",
  "checkout.schedule.pick_date": "Sanani tanlang",
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

  "placed.title": "Buyurtma qabul qilindi",
  "placed.subtitle.dine_in":
    "Buyurtmangiz oshxonaga yuborildi — {table}-stol uchun tez orada keladi.",
  "placed.subtitle.pickup":
    "Buyurtmangiz oshxonaga yuborildi — tez orada tayyor bo‘ladi.",
  "placed.subtitle.delivery":
    "Buyurtmangiz oshxonaga yuborildi — yo‘lda.",
  "placed.pay.dine_in":
    "Ofitsiant hisob-kitobni keltirgach, stolda to‘laysiz.",
  "placed.pay.pickup": "Olib ketishda kassada to‘laysiz.",
  "placed.pay.delivery": "Kuryerga naqd to‘laysiz.",
  "placed.done": "Tayyor",
  "placed.order_more": "Yana buyurtma berish",
  "placed.view_previous": "Avvalgi buyurtmani ko‘rish",
  "placed.scheduled_for": "{time} ga rejalashtirildi",

  "add_to_cart.label": "Savatchaga",
  "add_to_cart.label_with_price": "Savatchaga  •  {price}",
  "add_to_cart.added": "Qo‘shildi: {name}",
  "add_to_cart.view": "Savatchaga o‘tish",
  "add_to_cart.adding": "Qo‘shilmoqda…",
  "add_to_cart.gated_required_one": "1 ta majburiy tanlovni bajaring",
  "add_to_cart.gated_required_many": "{count} ta majburiy tanlovni bajaring",
  "customisations.title": "Bu mahsulot uchun sozlamalaringiz",
  "customisations.add_new": "Boshqa sozlamalar bilan qo‘shish",
  "search.placeholder": "Menyu bo‘yicha qidirish",
  "search.open_aria": "Qidiruvni ochish",
  "language.select_aria": "Tilni tanlash",

  "errors.network": "Internet bilan muammo. Aloqani tekshirib qaytadan urinib ko‘ring.",
  "errors.item_not_found": "Bu taom endi mavjud emas.",
  "errors.modifier_unavailable":
    "«{name}» endi mavjud emas. Boshqasini tanlang yoki olib tashlang.",
  "errors.cart_empty": "Savatchangiz bo‘sh.",
  "errors.order_expired":
    "Bu buyurtma muddati o‘tdi. Yangi buyurtma boshlang.",
  "errors.price_changed":
    "«{name}» narxi {old} dan {new} ga o‘zgardi. Yangilab davom etamizmi?",
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
