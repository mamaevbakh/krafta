/**
 * settings — dashboard "settings" surface strings.
 *
 * Contract: export { en, ru, "uz-Latn" } objects of flat dotted keys prefixed
 * "settings.". English is canonical (defines the key union); ru / uz-Latn are
 * type-checked against it in ../catalog.ts. Use {var} placeholders for runtime
 * values. See ./common.ts for the full contract.
 */

export const settings = {
  en: {
    // Page chrome + shared
    "settings.title": "Settings",
    "settings.subtitle": "Customize your catalog presentation and metadata.",
    "settings.catalog_not_found": "Catalog not found.",
    "settings.venue_row_missing":
      "Venue row not found for this catalog. Contact support.",
    "settings.account_coming_soon": "Account settings are coming soon.",
    "settings.organization_coming_soon":
      "Organization settings are coming soon.",
    "settings.disconnect": "Disconnect",
    "settings.connecting": "Connecting…",
    "settings.pause_hint": "Pause without removing the connected account.",
    "settings.account_name_optional": "Account name (optional)",
    "settings.account_name_placeholder": "e.g. My Cafe LLC",

    // Tabs
    "settings.tabs.venue": "Venue",
    "settings.tabs.delivery": "Delivery",
    "settings.tabs.payments": "Payments",
    "settings.tabs.catalog": "Catalog",
    "settings.tabs.miniapp": "Mini App",
    "settings.tabs.notifications": "Notifications",
    "settings.tabs.account": "Account",
    "settings.tabs.organization": "Organization",

    // Catalog form
    "settings.catalog.legend": "Catalog",
    "settings.catalog.description":
      "Control how this catalog appears across your storefront.",
    "settings.catalog.name_label": "Catalog name",
    "settings.catalog.name_placeholder": "Catalog name",
    "settings.catalog.logo_label": "Logo",
    "settings.catalog.logo_alt": "Catalog logo",
    "settings.catalog.no_logo": "No logo",
    "settings.catalog.upload_logo": "Upload logo",
    "settings.catalog.logo_hint": "Recommended square logo, minimum 256×256.",
    "settings.catalog.description_label": "Description",
    "settings.catalog.description_placeholder": "Describe this catalog...",
    "settings.catalog.tags_label": "Tags",
    "settings.catalog.tags_placeholder": "Add tags, separated by commas",
    "settings.catalog.tags_hint":
      "Tags show up in search and discovery surfaces.",
    "settings.catalog.remove_tag": "Remove {tag}",
    "settings.catalog.saved": "Settings saved.",
    "settings.catalog.update_error": "Unable to update settings.",
    "settings.catalog.logo_upload_error": "Unable to upload the catalog logo.",
    "settings.catalog.logo_upload_failed": "Upload failed.",
    "settings.catalog.logo_remove_error": "Unable to remove the catalog logo.",
    "settings.catalog.logo_remove_failed": "Remove failed.",

    // Venue form
    "settings.venue.identity_legend": "Identity",
    "settings.venue.identity_description":
      "The name customers see for this venue.",
    "settings.venue.name_label": "Venue name",
    "settings.venue.name_placeholder": "Khiva Branch",
    "settings.venue.accept_orders_label": "Accept orders",
    "settings.venue.accept_orders_hint":
      "When off, the storefront shows the venue as paused.",
    "settings.venue.modes_legend": "Order modes",
    "settings.venue.modes_description": "At least one mode must stay enabled.",
    "settings.venue.hours_legend": "Hours",
    "settings.venue.hours_description":
      "Single window per day. Overnight hours come with bar mode.",
    "settings.venue.hours_error": "Closing time must be after opening time.",
    "settings.venue.locale_legend": "Locale",
    "settings.venue.locale_description":
      "Currency, timezone, and default language for receipts and the menu.",
    "settings.venue.currency_label": "Currency",
    "settings.venue.currency_placeholder": "Select currency",
    "settings.venue.currency_search": "Search currencies…",
    "settings.venue.currency_empty": "No currency found.",
    "settings.venue.timezone_label": "Timezone",
    "settings.venue.timezone_placeholder": "Select timezone",
    "settings.venue.timezone_search": "Search timezones…",
    "settings.venue.timezone_empty": "No timezone found.",
    "settings.venue.language_label": "Language",
    "settings.venue.language_placeholder": "Select language",
    "settings.venue.language_search": "Search languages…",
    "settings.venue.language_empty": "No language found.",
    "settings.venue.address_legend": "Address",
    "settings.venue.address_description":
      "Used on receipts and pickup directions.",
    "settings.venue.saved": "Venue settings saved.",
    "settings.venue.save_error": "Unable to save venue settings.",
    "settings.venue.country_label": "Country",
    "settings.venue.country_placeholder": "Select country",
    "settings.venue.country_search": "Search countries…",
    "settings.venue.country_empty": "No country found.",
    "settings.venue.city_label": "City",
    "settings.venue.city_placeholder": "Tashkent",
    "settings.venue.street_label": "Street",
    "settings.venue.street_placeholder": "Amir Temur Avenue 1",
    "settings.venue.postal_label": "Postal code",
    "settings.venue.postal_placeholder": "100000",
    "settings.venue.notes_label": "Notes",
    "settings.venue.notes_placeholder": "Floor, unit, landmark…",
    "settings.venue.day.monday": "Monday",
    "settings.venue.day.tuesday": "Tuesday",
    "settings.venue.day.wednesday": "Wednesday",
    "settings.venue.day.thursday": "Thursday",
    "settings.venue.day.friday": "Friday",
    "settings.venue.day.saturday": "Saturday",
    "settings.venue.day.sunday": "Sunday",
    "settings.venue.day_opens_at": "{day} opens at",
    "settings.venue.day_closes_at": "{day} closes at",
    "settings.venue.day_closed": "{day} closed",
    "settings.venue.closed": "Closed",
    "settings.venue.mode.dine_in_label": "Dine-in",
    "settings.venue.mode.dine_in_hint": "QR scan at table",
    "settings.venue.mode.pickup_label": "Pickup",
    "settings.venue.mode.pickup_hint": "Customer comes to you",
    "settings.venue.mode.delivery_label": "Delivery",
    "settings.venue.mode.delivery_hint": "You bring it to them",

    // Delivery zone form
    "settings.delivery.zone_legend": "Delivery zone",
    "settings.delivery.zone_description":
      "Set your cafe location and how far you deliver. Orders pinned outside this radius are blocked at checkout.",
    "settings.delivery.mode_off_notice":
      "Delivery isn’t in your enabled order modes yet — turn it on under the Venue tab for customers to see this zone.",
    "settings.delivery.location_label": "Cafe location & radius",
    "settings.delivery.map_search_placeholder": "Find your cafe address",
    "settings.delivery.drag_hint": "Drag the map so the pin sits on your cafe.",
    "settings.delivery.radius_label": "Delivery radius",
    "settings.delivery.radius_aria": "Delivery radius in metres",
    "settings.delivery.fee_label": "Delivery fee",
    "settings.delivery.fee_hint":
      "Flat fee added to every delivery order. 0 = free delivery.",
    "settings.delivery.min_order_label": "Minimum order",
    "settings.delivery.min_order_aria": "Minimum order for delivery",
    "settings.delivery.min_order_hint":
      "Smallest subtotal you accept for delivery. 0 = no minimum.",
    "settings.delivery.enforce_label": "Enforce this zone",
    "settings.delivery.enforce_hint_ready":
      "Block checkout for addresses outside the radius.",
    "settings.delivery.enforce_hint_need_location":
      "Set your cafe location on the map first.",
    "settings.delivery.enforce_aria": "Enforce delivery zone",
    "settings.delivery.save_cta": "Save delivery zone",
    "settings.delivery.saved": "Delivery zone saved.",
    "settings.delivery.save_error": "Unable to save delivery settings.",

    // Delivery courier (Yandex Go)
    "settings.courier.title": "Delivery courier — Yandex Go",
    "settings.courier.description":
      "Connect your company’s Yandex Delivery account to quote fees and dispatch couriers automatically. Each company uses its own account.",
    "settings.courier.connected_fallback": "Yandex Delivery connected",
    "settings.courier.dispatch_active_label": "Courier dispatch active",
    "settings.courier.env_fallback":
      "Currently using Krafta’s shared test token (dev). Connect your own account below to bill couriers to your company.",
    "settings.courier.token_label": "Yandex Delivery API token",
    "settings.courier.token_placeholder":
      "OAuth token from your Yandex Delivery account",
    "settings.courier.token_hint":
      "From your Yandex Delivery corporate account → Integration. We validate it, then store it encrypted — it’s never shown again.",
    "settings.courier.connect_cta": "Connect Yandex Delivery",
    "settings.courier.connected_last4": "Connected · token ending {last4}",
    "settings.courier.disconnected": "Disconnected.",
    "settings.courier.error_enter_token": "Enter your Yandex Delivery token.",
    "settings.courier.error_provider_unavailable": "Provider unavailable.",
    "settings.courier.error_invalid_token":
      "Yandex rejected this token (401). Check it and try again.",
    "settings.courier.error_verify_failed":
      "Couldn’t verify the token — please try again.",

    // Card payments (Krafta Pay / Atmos)
    "settings.payments.title": "Card payments — Krafta Pay (Atmos)",
    "settings.payments.description":
      "Connect your company’s Atmos account so customers can pay by card at checkout instead of cash only. Payments settle to your own Atmos account. Each company uses its own credentials.",
    "settings.payments.connected_fallback": "Krafta Pay connected",
    "settings.payments.store_label": "store",
    "settings.payments.unverified_notice":
      "Saved, but we couldn’t reach Atmos to verify the credentials from here. The first real card payment will confirm them.",
    "settings.payments.active_label": "Card checkout active",
    "settings.payments.store_id_label": "Atmos store ID",
    "settings.payments.store_id_placeholder": "e.g. 1234",
    "settings.payments.consumer_key_label": "Consumer key",
    "settings.payments.consumer_key_placeholder": "Atmos consumer key",
    "settings.payments.consumer_secret_label": "Consumer secret",
    "settings.payments.consumer_secret_placeholder": "Atmos consumer secret",
    "settings.payments.creds_hint":
      "From your Atmos merchant account. We validate them, then store them encrypted in Krafta Pay — they’re never shown again.",
    "settings.payments.connect_cta": "Connect Krafta Pay",
    "settings.payments.connected_verified":
      "Connected — customers can now pay by card.",
    "settings.payments.connected_unverified":
      "Saved. We couldn’t reach Atmos to verify from here; the first real payment will confirm it.",
    "settings.payments.disconnected":
      "Disconnected. Card checkout is turned off.",
    "settings.payments.error_enter_creds":
      "Enter your Atmos store ID, consumer key and secret.",
    "settings.payments.error_not_signed_in": "Not signed in.",
    "settings.payments.error_credentials_rejected":
      "Atmos rejected these credentials. Check the store ID, key and secret and try again.",
    "settings.payments.error_forbidden":
      "You need to be an owner or admin to connect payments.",
    "settings.payments.error_connect_failed":
      "Couldn’t connect Krafta Pay — please try again.",

    // Notifications (Telegram order alerts)
    "settings.notifications.legend": "Notifications",
    "settings.notifications.description":
      "Get a Telegram message the moment a customer places an order.",
    "settings.notifications.no_venue":
      "Venue row not found for this catalog. Notifications need a venue.",
    "settings.notifications.chat_default": "Chat",
    "settings.notifications.order_chat_label": "Order chat",
    "settings.notifications.receives_every_order": "receives every order",
    "settings.notifications.send_alerts_label": "Send order alerts",
    "settings.notifications.send_test": "Send test message",
    "settings.notifications.connect_cta": "Connect order alerts",
    "settings.notifications.connect_hint":
      "Connect a Telegram group for your team — or a private chat just for you. Every order arrives instantly; customers never see it.",
    "settings.notifications.pick_destination":
      "Where should orders land? Pick one.",
    "settings.notifications.team_label": "My team",
    "settings.notifications.team_add_pre": "Add",
    "settings.notifications.team_add_post":
      " to your team’s Telegram group, then send this message in the group:",
    "settings.notifications.team_hint":
      "Everyone in the group sees every order. Best when more than one person works the counter.",
    "settings.notifications.self_label": "Just me",
    "settings.notifications.open_in_telegram": "Open @{bot} in Telegram",
    "settings.notifications.self_hint_pre": "Tap",
    "settings.notifications.self_hint_post":
      " — orders arrive in your private chat with the bot. Best for a one-person shop.",
    "settings.notifications.check_cta": "I’ve connected — check",
    "settings.notifications.code_expires": "Code expires in 30 minutes.",
    "settings.notifications.chat_connected": "Chat connected.",
    "settings.notifications.not_connected_yet":
      "Not seeing a connection yet. Send the code to the bot and try again.",
    "settings.notifications.test_sent": "Test message sent.",
    "settings.notifications.chat_disconnected": "Chat disconnected.",
    "settings.notifications.test_message":
      "✅ Krafta test. Order notifications are working.",
    "settings.notifications.error_bot_not_configured":
      "The bot isn’t set up on Krafta’s side yet. Please contact support.",
    "settings.notifications.error_connect_chat_first": "Connect a chat first.",

    // Telegram Mini App
    "settings.miniapp.legend": "Telegram Mini App",
    "settings.miniapp.description":
      "Let customers order from your shop inside Telegram — no app install.",
    "settings.miniapp.hosted_pre": "We host it on the shared",
    "settings.miniapp.hosted_post": " bot, so there’s nothing for you to set up.",
    "settings.miniapp.not_configured":
      "The Krafta bot isn’t configured yet on our side. Please contact support to turn on the Mini App.",
    "settings.miniapp.enable_label": "Enable Mini App storefront",
    "settings.miniapp.link_label": "Your Mini App link",
    "settings.miniapp.link_hint":
      "Share this link anywhere — tapping it opens your shop right inside Telegram.",
    "settings.miniapp.qr_label": "QR code",
    "settings.miniapp.qr_aria": "Mini App QR code",
    "settings.miniapp.open_in_telegram": "Open in Telegram",
    "settings.miniapp.share": "Share",
    "settings.miniapp.qr_hint":
      "Print it for tables or the counter. Customers scan to order.",
    "settings.miniapp.disabled_hint":
      "Turn it on to get a shareable link and a QR code for your tables.",
    "settings.miniapp.copy_error": "Couldn’t copy the link.",
    "settings.miniapp.share_title": "Order from us on Telegram",

    // AI shopping assistant
    "settings.assistant.legend": "AI shopping assistant",
    "settings.assistant.beta": "Beta",
    "settings.assistant.description":
      "When on, the storefront search opens a conversational assistant that helps shoppers find items in any language and add them to the cart. When off, search stays the classic instant results list.",
    "settings.assistant.enable_label": "Enable assistant",
    "settings.assistant.enable_hint": "Conversational search for this storefront.",
    "settings.assistant.on": "On",
    "settings.assistant.off": "Off",
    "settings.assistant.enabled_toast": "Assistant enabled.",
    "settings.assistant.disabled_toast": "Assistant disabled.",
    "settings.assistant.update_error":
      "Unable to update the assistant setting.",

    // Validation + gating (server actions)
    "settings.miniapp.no_venue":
      "Venue row not found for this catalog. The Mini App needs a venue.",
    "settings.venue.postal_hint": "Optional.",
    "settings.catalog.name_required": "Catalog name is required.",
    "settings.venue.name_required": "Venue name is required.",
    "settings.venue.currency_invalid": "Currency must be a 3-letter code.",
    "settings.venue.modes_required": "At least one order mode must be enabled.",
    "settings.venue.mode_unknown": "Unknown order mode: {mode}.",
    "settings.venue.hours_invalid": "Invalid hours for {day}.",
    "settings.venue.hours_order_error":
      "{day}: closing time must be after opening time.",
    "settings.venue.dine_in_gated":
      "Dine-in is a Business feature. Enable pickup or delivery, or upgrade to Business.",
    "settings.delivery.origin_required":
      "Set your cafe location on the map before enabling delivery.",
    "settings.payments.error_pro_required":
      "Card payments are a Pro feature. Upgrade to Pro to connect Krafta Pay.",
  },
  ru: {
    // Page chrome + shared
    "settings.title": "Настройки",
    "settings.subtitle": "Настройте оформление и данные каталога.",
    "settings.catalog_not_found": "Каталог не найден.",
    "settings.venue_row_missing":
      "Для этого каталога не найдено заведение. Свяжитесь с поддержкой.",
    "settings.account_coming_soon": "Настройки аккаунта появятся позже.",
    "settings.organization_coming_soon": "Настройки организации появятся позже.",
    "settings.disconnect": "Отключить",
    "settings.connecting": "Подключение…",
    "settings.pause_hint": "Приостановите, не удаляя подключённый аккаунт.",
    "settings.account_name_optional": "Название аккаунта (необязательно)",
    "settings.account_name_placeholder": "напр. ООО «Моё кафе»",

    // Tabs
    "settings.tabs.venue": "Заведение",
    "settings.tabs.delivery": "Доставка",
    "settings.tabs.payments": "Платежи",
    "settings.tabs.catalog": "Каталог",
    "settings.tabs.miniapp": "Мини-приложение",
    "settings.tabs.notifications": "Уведомления",
    "settings.tabs.account": "Аккаунт",
    "settings.tabs.organization": "Организация",

    // Catalog form
    "settings.catalog.legend": "Каталог",
    "settings.catalog.description":
      "Управляйте тем, как этот каталог отображается в вашей витрине.",
    "settings.catalog.name_label": "Название каталога",
    "settings.catalog.name_placeholder": "Название каталога",
    "settings.catalog.logo_label": "Логотип",
    "settings.catalog.logo_alt": "Логотип каталога",
    "settings.catalog.no_logo": "Нет логотипа",
    "settings.catalog.upload_logo": "Загрузить логотип",
    "settings.catalog.logo_hint":
      "Рекомендуется квадратный логотип, не менее 256×256.",
    "settings.catalog.description_label": "Описание",
    "settings.catalog.description_placeholder": "Опишите этот каталог...",
    "settings.catalog.tags_label": "Теги",
    "settings.catalog.tags_placeholder": "Добавьте теги через запятую",
    "settings.catalog.tags_hint":
      "Теги отображаются в поиске и разделах подборок.",
    "settings.catalog.remove_tag": "Удалить {tag}",
    "settings.catalog.saved": "Настройки сохранены.",
    "settings.catalog.update_error": "Не удалось обновить настройки.",
    "settings.catalog.logo_upload_error":
      "Не удалось загрузить логотип каталога.",
    "settings.catalog.logo_upload_failed": "Не удалось загрузить.",
    "settings.catalog.logo_remove_error": "Не удалось удалить логотип каталога.",
    "settings.catalog.logo_remove_failed": "Не удалось удалить.",

    // Venue form
    "settings.venue.identity_legend": "Основное",
    "settings.venue.identity_description":
      "Название, которое видят клиенты для этого заведения.",
    "settings.venue.name_label": "Название заведения",
    "settings.venue.name_placeholder": "Филиал в Хиве",
    "settings.venue.accept_orders_label": "Принимать заказы",
    "settings.venue.accept_orders_hint":
      "Когда выключено, витрина показывает заведение как приостановленное.",
    "settings.venue.modes_legend": "Режимы заказа",
    "settings.venue.modes_description":
      "Хотя бы один режим должен быть включён.",
    "settings.venue.hours_legend": "Часы работы",
    "settings.venue.hours_description":
      "Одно окно в день. Ночные часы доступны в режиме бара.",
    "settings.venue.hours_error":
      "Время закрытия должно быть позже времени открытия.",
    "settings.venue.locale_legend": "Регион и язык",
    "settings.venue.locale_description":
      "Валюта, часовой пояс и язык по умолчанию для чеков и меню.",
    "settings.venue.currency_label": "Валюта",
    "settings.venue.currency_placeholder": "Выберите валюту",
    "settings.venue.currency_search": "Поиск валют…",
    "settings.venue.currency_empty": "Валюта не найдена.",
    "settings.venue.timezone_label": "Часовой пояс",
    "settings.venue.timezone_placeholder": "Выберите часовой пояс",
    "settings.venue.timezone_search": "Поиск часовых поясов…",
    "settings.venue.timezone_empty": "Часовой пояс не найден.",
    "settings.venue.language_label": "Язык",
    "settings.venue.language_placeholder": "Выберите язык",
    "settings.venue.language_search": "Поиск языков…",
    "settings.venue.language_empty": "Язык не найден.",
    "settings.venue.address_legend": "Адрес",
    "settings.venue.address_description":
      "Используется в чеках и для самовывоза.",
    "settings.venue.saved": "Настройки заведения сохранены.",
    "settings.venue.save_error": "Не удалось сохранить настройки заведения.",
    "settings.venue.country_label": "Страна",
    "settings.venue.country_placeholder": "Выберите страну",
    "settings.venue.country_search": "Поиск стран…",
    "settings.venue.country_empty": "Страна не найдена.",
    "settings.venue.city_label": "Город",
    "settings.venue.city_placeholder": "Ташкент",
    "settings.venue.street_label": "Улица",
    "settings.venue.street_placeholder": "Проспект Амира Темура, 1",
    "settings.venue.postal_label": "Почтовый индекс",
    "settings.venue.postal_placeholder": "100000",
    "settings.venue.notes_label": "Примечания",
    "settings.venue.notes_placeholder": "Этаж, помещение, ориентир…",
    "settings.venue.day.monday": "Понедельник",
    "settings.venue.day.tuesday": "Вторник",
    "settings.venue.day.wednesday": "Среда",
    "settings.venue.day.thursday": "Четверг",
    "settings.venue.day.friday": "Пятница",
    "settings.venue.day.saturday": "Суббота",
    "settings.venue.day.sunday": "Воскресенье",
    "settings.venue.day_opens_at": "{day} — открытие",
    "settings.venue.day_closes_at": "{day} — закрытие",
    "settings.venue.day_closed": "{day} — закрыто",
    "settings.venue.closed": "Закрыто",
    "settings.venue.mode.dine_in_label": "В зале",
    "settings.venue.mode.dine_in_hint": "Сканирование QR за столом",
    "settings.venue.mode.pickup_label": "Самовывоз",
    "settings.venue.mode.pickup_hint": "Клиент забирает сам",
    "settings.venue.mode.delivery_label": "Доставка",
    "settings.venue.mode.delivery_hint": "Вы привозите клиенту",

    // Delivery zone form
    "settings.delivery.zone_legend": "Зона доставки",
    "settings.delivery.zone_description":
      "Укажите местоположение кафе и радиус доставки. Заказы за пределами радиуса блокируются при оформлении.",
    "settings.delivery.mode_off_notice":
      "Доставка ещё не входит в активные режимы заказа — включите её на вкладке «Заведение», чтобы клиенты видели эту зону.",
    "settings.delivery.location_label": "Местоположение кафе и радиус",
    "settings.delivery.map_search_placeholder": "Найдите адрес кафе",
    "settings.delivery.drag_hint":
      "Перетащите карту так, чтобы метка была на вашем кафе.",
    "settings.delivery.radius_label": "Радиус доставки",
    "settings.delivery.radius_aria": "Радиус доставки в метрах",
    "settings.delivery.fee_label": "Стоимость доставки",
    "settings.delivery.fee_hint":
      "Фиксированная плата за каждый заказ с доставкой. 0 — бесплатная доставка.",
    "settings.delivery.min_order_label": "Минимальный заказ",
    "settings.delivery.min_order_aria": "Минимальный заказ для доставки",
    "settings.delivery.min_order_hint":
      "Наименьшая сумма заказа для доставки. 0 — без минимума.",
    "settings.delivery.enforce_label": "Применять эту зону",
    "settings.delivery.enforce_hint_ready":
      "Блокировать оформление для адресов за пределами радиуса.",
    "settings.delivery.enforce_hint_need_location":
      "Сначала укажите местоположение кафе на карте.",
    "settings.delivery.enforce_aria": "Применять зону доставки",
    "settings.delivery.save_cta": "Сохранить зону доставки",
    "settings.delivery.saved": "Зона доставки сохранена.",
    "settings.delivery.save_error": "Не удалось сохранить настройки доставки.",

    // Delivery courier (Yandex Go)
    "settings.courier.title": "Курьер доставки — Yandex Go",
    "settings.courier.description":
      "Подключите аккаунт Яндекс Доставки вашей компании, чтобы автоматически рассчитывать стоимость и вызывать курьеров. Каждая компания использует свой аккаунт.",
    "settings.courier.connected_fallback": "Яндекс Доставка подключена",
    "settings.courier.dispatch_active_label": "Вызов курьеров активен",
    "settings.courier.env_fallback":
      "Сейчас используется общий тестовый токен Krafta (dev). Подключите свой аккаунт ниже, чтобы курьеры оплачивались с вашей компании.",
    "settings.courier.token_label": "API-токен Яндекс Доставки",
    "settings.courier.token_placeholder":
      "OAuth-токен из аккаунта Яндекс Доставки",
    "settings.courier.token_hint":
      "Из корпоративного аккаунта Яндекс Доставки → Интеграция. Мы проверяем его, затем храним в зашифрованном виде — он больше не показывается.",
    "settings.courier.connect_cta": "Подключить Яндекс Доставку",
    "settings.courier.connected_last4":
      "Подключено · токен оканчивается на {last4}",
    "settings.courier.disconnected": "Отключено.",
    "settings.courier.error_enter_token": "Введите токен Яндекс Доставки.",
    "settings.courier.error_provider_unavailable": "Провайдер недоступен.",
    "settings.courier.error_invalid_token":
      "Яндекс отклонил этот токен (401). Проверьте его и попробуйте снова.",
    "settings.courier.error_verify_failed":
      "Не удалось проверить токен — попробуйте снова.",

    // Card payments (Krafta Pay / Atmos)
    "settings.payments.title": "Оплата картой — Krafta Pay (Atmos)",
    "settings.payments.description":
      "Подключите аккаунт Atmos вашей компании, чтобы клиенты могли платить картой при оформлении, а не только наличными. Платежи поступают на ваш аккаунт Atmos. Каждая компания использует свои данные.",
    "settings.payments.connected_fallback": "Krafta Pay подключён",
    "settings.payments.store_label": "магазин",
    "settings.payments.unverified_notice":
      "Сохранено, но нам не удалось связаться с Atmos для проверки данных отсюда. Первый реальный платёж картой их подтвердит.",
    "settings.payments.active_label": "Оплата картой активна",
    "settings.payments.store_id_label": "ID магазина Atmos",
    "settings.payments.store_id_placeholder": "напр. 1234",
    "settings.payments.consumer_key_label": "Consumer key",
    "settings.payments.consumer_key_placeholder": "Consumer key от Atmos",
    "settings.payments.consumer_secret_label": "Consumer secret",
    "settings.payments.consumer_secret_placeholder": "Consumer secret от Atmos",
    "settings.payments.creds_hint":
      "Из вашего аккаунта продавца Atmos. Мы проверяем их, затем храним в зашифрованном виде в Krafta Pay — они больше не показываются.",
    "settings.payments.connect_cta": "Подключить Krafta Pay",
    "settings.payments.connected_verified":
      "Подключено — клиенты теперь могут платить картой.",
    "settings.payments.connected_unverified":
      "Сохранено. Нам не удалось связаться с Atmos для проверки отсюда; первый реальный платёж это подтвердит.",
    "settings.payments.disconnected": "Отключено. Оплата картой выключена.",
    "settings.payments.error_enter_creds":
      "Введите ID магазина Atmos, consumer key и secret.",
    "settings.payments.error_not_signed_in": "Вы не вошли в систему.",
    "settings.payments.error_credentials_rejected":
      "Atmos отклонил эти данные. Проверьте ID магазина, key и secret и попробуйте снова.",
    "settings.payments.error_forbidden":
      "Чтобы подключить платежи, нужно быть владельцем или администратором.",
    "settings.payments.error_connect_failed":
      "Не удалось подключить Krafta Pay — попробуйте снова.",

    // Notifications (Telegram order alerts)
    "settings.notifications.legend": "Уведомления",
    "settings.notifications.description":
      "Получайте сообщение в Telegram, как только клиент оформит заказ.",
    "settings.notifications.no_venue":
      "Для этого каталога не найдено заведение. Для уведомлений нужно заведение.",
    "settings.notifications.chat_default": "Чат",
    "settings.notifications.order_chat_label": "Чат для заказов",
    "settings.notifications.receives_every_order": "получает каждый заказ",
    "settings.notifications.send_alerts_label": "Отправлять уведомления о заказах",
    "settings.notifications.send_test": "Отправить тестовое сообщение",
    "settings.notifications.connect_cta": "Подключить уведомления о заказах",
    "settings.notifications.connect_hint":
      "Подключите Telegram-группу для вашей команды — или личный чат только для себя. Каждый заказ приходит мгновенно; клиенты его не видят.",
    "settings.notifications.pick_destination":
      "Куда отправлять заказы? Выберите одно.",
    "settings.notifications.team_label": "Моя команда",
    "settings.notifications.team_add_pre": "Добавьте",
    "settings.notifications.team_add_post":
      " в Telegram-группу вашей команды, затем отправьте в группе это сообщение:",
    "settings.notifications.team_hint":
      "Все в группе видят каждый заказ. Подходит, когда за прилавком работает несколько человек.",
    "settings.notifications.self_label": "Только я",
    "settings.notifications.open_in_telegram": "Открыть @{bot} в Telegram",
    "settings.notifications.self_hint_pre": "Нажмите",
    "settings.notifications.self_hint_post":
      " — заказы приходят в ваш личный чат с ботом. Подходит для магазина с одним сотрудником.",
    "settings.notifications.check_cta": "Я подключил — проверить",
    "settings.notifications.code_expires": "Код действует 30 минут.",
    "settings.notifications.chat_connected": "Чат подключён.",
    "settings.notifications.not_connected_yet":
      "Пока не вижу подключения. Отправьте код боту и попробуйте снова.",
    "settings.notifications.test_sent": "Тестовое сообщение отправлено.",
    "settings.notifications.chat_disconnected": "Чат отключён.",
    "settings.notifications.test_message":
      "✅ Тест Krafta. Уведомления о заказах работают.",
    "settings.notifications.error_bot_not_configured":
      "Бот ещё не настроен на стороне Krafta. Напишите в поддержку.",
    "settings.notifications.error_connect_chat_first": "Сначала подключите чат.",

    // Telegram Mini App
    "settings.miniapp.legend": "Telegram Mini App",
    "settings.miniapp.description":
      "Позвольте клиентам заказывать в вашем магазине прямо в Telegram — без установки приложения.",
    "settings.miniapp.hosted_pre": "Мы размещаем его на общем боте",
    "settings.miniapp.hosted_post": ", так что настраивать ничего не нужно.",
    "settings.miniapp.not_configured":
      "Бот Krafta пока не настроен на нашей стороне. Свяжитесь с поддержкой, чтобы включить Mini App.",
    "settings.miniapp.enable_label": "Включить витрину Mini App",
    "settings.miniapp.link_label": "Ваша ссылка на Mini App",
    "settings.miniapp.link_hint":
      "Делитесь этой ссылкой где угодно — нажатие откроет ваш магазин прямо в Telegram.",
    "settings.miniapp.qr_label": "QR-код",
    "settings.miniapp.qr_aria": "QR-код Mini App",
    "settings.miniapp.open_in_telegram": "Открыть в Telegram",
    "settings.miniapp.share": "Поделиться",
    "settings.miniapp.qr_hint":
      "Распечатайте его для столов или прилавка. Клиенты сканируют, чтобы заказать.",
    "settings.miniapp.disabled_hint":
      "Включите, чтобы получить ссылку для отправки и QR-код для ваших столов.",
    "settings.miniapp.copy_error": "Не удалось скопировать ссылку.",
    "settings.miniapp.share_title": "Закажите у нас в Telegram",

    // AI shopping assistant
    "settings.assistant.legend": "ИИ-помощник по покупкам",
    "settings.assistant.beta": "Бета",
    "settings.assistant.description":
      "Когда включено, поиск в витрине открывает диалогового помощника, который помогает покупателям находить товары на любом языке и добавлять их в корзину. Когда выключено, поиск остаётся классическим списком мгновенных результатов.",
    "settings.assistant.enable_label": "Включить помощника",
    "settings.assistant.enable_hint": "Диалоговый поиск для этой витрины.",
    "settings.assistant.on": "Вкл",
    "settings.assistant.off": "Выкл",
    "settings.assistant.enabled_toast": "Помощник включён.",
    "settings.assistant.disabled_toast": "Помощник выключен.",
    "settings.assistant.update_error":
      "Не удалось обновить настройку помощника.",

    // Validation + gating (server actions)
    "settings.miniapp.no_venue":
      "Для этого каталога не найдено заведение. Для Mini App нужно заведение.",
    "settings.venue.postal_hint": "Необязательно.",
    "settings.catalog.name_required": "Укажите название каталога.",
    "settings.venue.name_required": "Укажите название заведения.",
    "settings.venue.currency_invalid": "Валюта должна быть кодом из 3 букв.",
    "settings.venue.modes_required":
      "Должен быть включён хотя бы один режим заказа.",
    "settings.venue.mode_unknown": "Неизвестный режим заказа: {mode}.",
    "settings.venue.hours_invalid": "Неверные часы для {day}.",
    "settings.venue.hours_order_error":
      "{day}: время закрытия должно быть позже времени открытия.",
    "settings.venue.dine_in_gated":
      "Обслуживание в зале — функция тарифа Business. Включите самовывоз или доставку либо перейдите на Business.",
    "settings.delivery.origin_required":
      "Укажите местоположение кафе на карте перед включением доставки.",
    "settings.payments.error_pro_required":
      "Оплата картой — функция тарифа Pro. Перейдите на Pro, чтобы подключить Krafta Pay.",
  },
  "uz-Latn": {
    // Page chrome + shared
    "settings.title": "Sozlamalar",
    "settings.subtitle": "Katalog ko‘rinishi va ma’lumotlarini sozlang.",
    "settings.catalog_not_found": "Katalog topilmadi.",
    "settings.venue_row_missing":
      "Ushbu katalog uchun muassasa topilmadi. Qo‘llab-quvvatlashga murojaat qiling.",
    "settings.account_coming_soon": "Hisob sozlamalari tez orada qo‘shiladi.",
    "settings.organization_coming_soon":
      "Tashkilot sozlamalari tez orada qo‘shiladi.",
    "settings.disconnect": "Uzish",
    "settings.connecting": "Ulanmoqda…",
    "settings.pause_hint": "Ulangan hisobni o‘chirmasdan to‘xtatib turing.",
    "settings.account_name_optional": "Hisob nomi (ixtiyoriy)",
    "settings.account_name_placeholder": "masalan, My Cafe MChJ",

    // Tabs
    "settings.tabs.venue": "Muassasa",
    "settings.tabs.delivery": "Yetkazib berish",
    "settings.tabs.payments": "To‘lovlar",
    "settings.tabs.catalog": "Katalog",
    "settings.tabs.miniapp": "Mini-ilova",
    "settings.tabs.notifications": "Bildirishnomalar",
    "settings.tabs.account": "Hisob",
    "settings.tabs.organization": "Tashkilot",

    // Catalog form
    "settings.catalog.legend": "Katalog",
    "settings.catalog.description":
      "Ushbu katalog vitrinangizda qanday ko‘rinishini boshqaring.",
    "settings.catalog.name_label": "Katalog nomi",
    "settings.catalog.name_placeholder": "Katalog nomi",
    "settings.catalog.logo_label": "Logotip",
    "settings.catalog.logo_alt": "Katalog logotipi",
    "settings.catalog.no_logo": "Logotip yo‘q",
    "settings.catalog.upload_logo": "Logotipni yuklash",
    "settings.catalog.logo_hint":
      "Kvadrat logotip tavsiya etiladi, kamida 256×256.",
    "settings.catalog.description_label": "Tavsif",
    "settings.catalog.description_placeholder": "Ushbu katalogni tavsiflang...",
    "settings.catalog.tags_label": "Teglar",
    "settings.catalog.tags_placeholder": "Teglarni vergul bilan ajratib qo‘shing",
    "settings.catalog.tags_hint":
      "Teglar qidiruv va tavsiyalar bo‘limlarida ko‘rinadi.",
    "settings.catalog.remove_tag": "{tag} ni olib tashlash",
    "settings.catalog.saved": "Sozlamalar saqlandi.",
    "settings.catalog.update_error": "Sozlamalarni yangilab bo‘lmadi.",
    "settings.catalog.logo_upload_error": "Katalog logotipini yuklab bo‘lmadi.",
    "settings.catalog.logo_upload_failed": "Yuklab bo‘lmadi.",
    "settings.catalog.logo_remove_error":
      "Katalog logotipini o‘chirib bo‘lmadi.",
    "settings.catalog.logo_remove_failed": "O‘chirib bo‘lmadi.",

    // Venue form
    "settings.venue.identity_legend": "Asosiy",
    "settings.venue.identity_description":
      "Mijozlar ko‘radigan ushbu muassasa nomi.",
    "settings.venue.name_label": "Muassasa nomi",
    "settings.venue.name_placeholder": "Xiva filiali",
    "settings.venue.accept_orders_label": "Buyurtmalarni qabul qilish",
    "settings.venue.accept_orders_hint":
      "O‘chirilganda vitrina muassasani to‘xtatilgan deb ko‘rsatadi.",
    "settings.venue.modes_legend": "Buyurtma rejimlari",
    "settings.venue.modes_description":
      "Kamida bitta rejim yoqilgan bo‘lishi kerak.",
    "settings.venue.hours_legend": "Ish vaqti",
    "settings.venue.hours_description":
      "Kuniga bitta oraliq. Tungi soatlar bar rejimida mavjud.",
    "settings.venue.hours_error":
      "Yopilish vaqti ochilish vaqtidan keyin bo‘lishi kerak.",
    "settings.venue.locale_legend": "Hudud va til",
    "settings.venue.locale_description":
      "Cheklar va menyu uchun valyuta, vaqt mintaqasi va standart til.",
    "settings.venue.currency_label": "Valyuta",
    "settings.venue.currency_placeholder": "Valyutani tanlang",
    "settings.venue.currency_search": "Valyutalarni qidirish…",
    "settings.venue.currency_empty": "Valyuta topilmadi.",
    "settings.venue.timezone_label": "Vaqt mintaqasi",
    "settings.venue.timezone_placeholder": "Vaqt mintaqasini tanlang",
    "settings.venue.timezone_search": "Vaqt mintaqalarini qidirish…",
    "settings.venue.timezone_empty": "Vaqt mintaqasi topilmadi.",
    "settings.venue.language_label": "Til",
    "settings.venue.language_placeholder": "Tilni tanlang",
    "settings.venue.language_search": "Tillarni qidirish…",
    "settings.venue.language_empty": "Til topilmadi.",
    "settings.venue.address_legend": "Manzil",
    "settings.venue.address_description":
      "Cheklarda va olib ketish uchun ishlatiladi.",
    "settings.venue.saved": "Muassasa sozlamalari saqlandi.",
    "settings.venue.save_error": "Muassasa sozlamalarini saqlab bo‘lmadi.",
    "settings.venue.country_label": "Davlat",
    "settings.venue.country_placeholder": "Davlatni tanlang",
    "settings.venue.country_search": "Davlatlarni qidirish…",
    "settings.venue.country_empty": "Davlat topilmadi.",
    "settings.venue.city_label": "Shahar",
    "settings.venue.city_placeholder": "Toshkent",
    "settings.venue.street_label": "Ko‘cha",
    "settings.venue.street_placeholder": "Amir Temur shoh ko‘chasi, 1",
    "settings.venue.postal_label": "Pochta indeksi",
    "settings.venue.postal_placeholder": "100000",
    "settings.venue.notes_label": "Izohlar",
    "settings.venue.notes_placeholder": "Qavat, xona, mo‘ljal…",
    "settings.venue.day.monday": "Dushanba",
    "settings.venue.day.tuesday": "Seshanba",
    "settings.venue.day.wednesday": "Chorshanba",
    "settings.venue.day.thursday": "Payshanba",
    "settings.venue.day.friday": "Juma",
    "settings.venue.day.saturday": "Shanba",
    "settings.venue.day.sunday": "Yakshanba",
    "settings.venue.day_opens_at": "{day} — ochilish",
    "settings.venue.day_closes_at": "{day} — yopilish",
    "settings.venue.day_closed": "{day} — yopiq",
    "settings.venue.closed": "Yopiq",
    "settings.venue.mode.dine_in_label": "Zalda",
    "settings.venue.mode.dine_in_hint": "Stol yonida QR skaneri",
    "settings.venue.mode.pickup_label": "Olib ketish",
    "settings.venue.mode.pickup_hint": "Mijoz o‘zi olib ketadi",
    "settings.venue.mode.delivery_label": "Yetkazib berish",
    "settings.venue.mode.delivery_hint": "Siz mijozga yetkazasiz",

    // Delivery zone form
    "settings.delivery.zone_legend": "Yetkazib berish hududi",
    "settings.delivery.zone_description":
      "Kafe manzilini va yetkazib berish radiusini belgilang. Radiusdan tashqaridagi buyurtmalar to‘lov bosqichida bloklanadi.",
    "settings.delivery.mode_off_notice":
      "Yetkazib berish hali faol buyurtma rejimlariga kirmagan — mijozlar bu hududni ko‘rishi uchun uni «Muassasa» bo‘limida yoqing.",
    "settings.delivery.location_label": "Kafe manzili va radius",
    "settings.delivery.map_search_placeholder": "Kafe manzilini toping",
    "settings.delivery.drag_hint":
      "Belgini kafeyingiz ustiga qo‘yish uchun xaritani suring.",
    "settings.delivery.radius_label": "Yetkazib berish radiusi",
    "settings.delivery.radius_aria": "Yetkazib berish radiusi (metrda)",
    "settings.delivery.fee_label": "Yetkazib berish narxi",
    "settings.delivery.fee_hint":
      "Har bir yetkazib berish buyurtmasiga qo‘shiladigan qat’iy to‘lov. 0 — bepul yetkazish.",
    "settings.delivery.min_order_label": "Eng kam buyurtma",
    "settings.delivery.min_order_aria": "Yetkazib berish uchun eng kam buyurtma",
    "settings.delivery.min_order_hint":
      "Yetkazib berish uchun qabul qiladigan eng kam summa. 0 — cheklovsiz.",
    "settings.delivery.enforce_label": "Ushbu hududni qo‘llash",
    "settings.delivery.enforce_hint_ready":
      "Radiusdan tashqaridagi manzillar uchun to‘lovni bloklash.",
    "settings.delivery.enforce_hint_need_location":
      "Avval xaritada kafe manzilini belgilang.",
    "settings.delivery.enforce_aria": "Yetkazib berish hududini qo‘llash",
    "settings.delivery.save_cta": "Yetkazib berish hududini saqlash",
    "settings.delivery.saved": "Yetkazib berish hududi saqlandi.",
    "settings.delivery.save_error":
      "Yetkazib berish sozlamalarini saqlab bo‘lmadi.",

    // Delivery courier (Yandex Go)
    "settings.courier.title": "Yetkazib berish kuryeri — Yandex Go",
    "settings.courier.description":
      "Narxlarni hisoblash va kuryerlarni avtomatik chaqirish uchun kompaniyangizning Yandex Delivery hisobini ulang. Har bir kompaniya o‘z hisobidan foydalanadi.",
    "settings.courier.connected_fallback": "Yandex Delivery ulandi",
    "settings.courier.dispatch_active_label": "Kuryer chaqiruvi faol",
    "settings.courier.env_fallback":
      "Hozir Krafta’ning umumiy sinov tokeni (dev) ishlatilmoqda. Kuryerlar kompaniyangiz hisobidan to‘lanishi uchun quyida o‘z hisobingizni ulang.",
    "settings.courier.token_label": "Yandex Delivery API tokeni",
    "settings.courier.token_placeholder":
      "Yandex Delivery hisobingizdagi OAuth token",
    "settings.courier.token_hint":
      "Yandex Delivery korporativ hisobingizdan → Integratsiya. Biz uni tekshiramiz, so‘ng shifrlangan holda saqlaymiz — u boshqa ko‘rsatilmaydi.",
    "settings.courier.connect_cta": "Yandex Delivery’ni ulash",
    "settings.courier.connected_last4": "Ulandi · token oxiri {last4}",
    "settings.courier.disconnected": "Uzildi.",
    "settings.courier.error_enter_token": "Yandex Delivery tokenini kiriting.",
    "settings.courier.error_provider_unavailable": "Provayder mavjud emas.",
    "settings.courier.error_invalid_token":
      "Yandex bu tokenni rad etdi (401). Uni tekshirib, qayta urinib ko‘ring.",
    "settings.courier.error_verify_failed":
      "Tokenni tekshirib bo‘lmadi — qayta urinib ko‘ring.",

    // Card payments (Krafta Pay / Atmos)
    "settings.payments.title": "Karta orqali to‘lov — Krafta Pay (Atmos)",
    "settings.payments.description":
      "Mijozlar to‘lov bosqichida faqat naqd emas, balki karta orqali ham to‘lashi uchun kompaniyangizning Atmos hisobini ulang. To‘lovlar o‘z Atmos hisobingizga tushadi. Har bir kompaniya o‘z ma’lumotlaridan foydalanadi.",
    "settings.payments.connected_fallback": "Krafta Pay ulandi",
    "settings.payments.store_label": "do‘kon",
    "settings.payments.unverified_notice":
      "Saqlandi, lekin bu yerdan ma’lumotlarni tekshirish uchun Atmos bilan bog‘lana olmadik. Birinchi haqiqiy karta to‘lovi ularni tasdiqlaydi.",
    "settings.payments.active_label": "Karta orqali to‘lov faol",
    "settings.payments.store_id_label": "Atmos do‘kon ID’si",
    "settings.payments.store_id_placeholder": "masalan, 1234",
    "settings.payments.consumer_key_label": "Consumer key",
    "settings.payments.consumer_key_placeholder": "Atmos consumer key",
    "settings.payments.consumer_secret_label": "Consumer secret",
    "settings.payments.consumer_secret_placeholder": "Atmos consumer secret",
    "settings.payments.creds_hint":
      "Atmos sotuvchi hisobingizdan. Biz ularni tekshiramiz, so‘ng Krafta Pay’da shifrlangan holda saqlaymiz — ular boshqa ko‘rsatilmaydi.",
    "settings.payments.connect_cta": "Krafta Pay’ni ulash",
    "settings.payments.connected_verified":
      "Ulandi — mijozlar endi karta orqali to‘lay oladi.",
    "settings.payments.connected_unverified":
      "Saqlandi. Bu yerdan Atmos bilan bog‘lanib tekshira olmadik; birinchi haqiqiy to‘lov buni tasdiqlaydi.",
    "settings.payments.disconnected":
      "Uzildi. Karta orqali to‘lov o‘chirildi.",
    "settings.payments.error_enter_creds":
      "Atmos do‘kon ID’si, consumer key va secret’ni kiriting.",
    "settings.payments.error_not_signed_in": "Tizimga kirmagansiz.",
    "settings.payments.error_credentials_rejected":
      "Atmos bu ma’lumotlarni rad etdi. Do‘kon ID’si, key va secret’ni tekshirib, qayta urinib ko‘ring.",
    "settings.payments.error_forbidden":
      "To‘lovlarni ulash uchun egasi yoki administrator bo‘lishingiz kerak.",
    "settings.payments.error_connect_failed":
      "Krafta Pay’ni ulab bo‘lmadi — qayta urinib ko‘ring.",

    // Notifications (Telegram order alerts)
    "settings.notifications.legend": "Bildirishnomalar",
    "settings.notifications.description":
      "Mijoz buyurtma bergani zahoti Telegram’da xabar oling.",
    "settings.notifications.no_venue":
      "Ushbu katalog uchun muassasa topilmadi. Bildirishnomalar uchun muassasa kerak.",
    "settings.notifications.chat_default": "Chat",
    "settings.notifications.order_chat_label": "Buyurtmalar chati",
    "settings.notifications.receives_every_order": "har bir buyurtmani oladi",
    "settings.notifications.send_alerts_label":
      "Buyurtma bildirishnomalarini yuborish",
    "settings.notifications.send_test": "Sinov xabarini yuborish",
    "settings.notifications.connect_cta":
      "Buyurtma bildirishnomalarini ulash",
    "settings.notifications.connect_hint":
      "Jamoangiz uchun Telegram guruhini — yoki faqat o‘zingiz uchun shaxsiy chatni ulang. Har bir buyurtma zudlik bilan keladi; mijozlar buni ko‘rmaydi.",
    "settings.notifications.pick_destination":
      "Buyurtmalar qayerga tushsin? Bittasini tanlang.",
    "settings.notifications.team_label": "Mening jamoam",
    "settings.notifications.team_add_pre": "",
    "settings.notifications.team_add_post":
      " ni jamoangiz Telegram guruhiga qo‘shing, so‘ng guruhga bu xabarni yuboring:",
    "settings.notifications.team_hint":
      "Guruhdagi hamma har bir buyurtmani ko‘radi. Peshtaxtada bir nechta kishi ishlaganda qulay.",
    "settings.notifications.self_label": "Faqat men",
    "settings.notifications.open_in_telegram": "@{bot} ni Telegram’da ochish",
    "settings.notifications.self_hint_pre": "",
    "settings.notifications.self_hint_post":
      " ni bosing — buyurtmalar bot bilan shaxsiy chatingizga keladi. Bitta kishilik do‘kon uchun qulay.",
    "settings.notifications.check_cta": "Ulandim — tekshirish",
    "settings.notifications.code_expires": "Kod 30 daqiqa amal qiladi.",
    "settings.notifications.chat_connected": "Chat ulandi.",
    "settings.notifications.not_connected_yet":
      "Hali ulanishni ko‘rmayapman. Kodni botga yuboring va qayta urinib ko‘ring.",
    "settings.notifications.test_sent": "Sinov xabari yuborildi.",
    "settings.notifications.chat_disconnected": "Chat uzildi.",
    "settings.notifications.test_message":
      "✅ Krafta sinovi. Buyurtma bildirishnomalari ishlayapti.",
    "settings.notifications.error_bot_not_configured":
      "Bot hali Krafta tomonida sozlanmagan. Qo‘llab-quvvatlashga yozing.",
    "settings.notifications.error_connect_chat_first": "Avval chatni ulang.",

    // Telegram Mini App
    "settings.miniapp.legend": "Telegram Mini App",
    "settings.miniapp.description":
      "Mijozlar do‘koningizdan Telegram ichida buyurtma bera oladi — ilova o‘rnatishsiz.",
    "settings.miniapp.hosted_pre": "Biz uni umumiy",
    "settings.miniapp.hosted_post":
      " botida joylashtiramiz, shuning uchun hech narsa sozlashingiz shart emas.",
    "settings.miniapp.not_configured":
      "Krafta boti hali biz tomonda sozlanmagan. Mini App’ni yoqish uchun qo‘llab-quvvatlashga murojaat qiling.",
    "settings.miniapp.enable_label": "Mini App vitrinasini yoqish",
    "settings.miniapp.link_label": "Sizning Mini App havolangiz",
    "settings.miniapp.link_hint":
      "Bu havolani istalgan joyda ulashing — bosilganda do‘koningiz to‘g‘ridan-to‘g‘ri Telegram ichida ochiladi.",
    "settings.miniapp.qr_label": "QR-kod",
    "settings.miniapp.qr_aria": "Mini App QR-kodi",
    "settings.miniapp.open_in_telegram": "Telegram’da ochish",
    "settings.miniapp.share": "Ulashish",
    "settings.miniapp.qr_hint":
      "Uni stollar yoki peshtaxta uchun chop eting. Mijozlar buyurtma berish uchun skanerlaydi.",
    "settings.miniapp.disabled_hint":
      "Ulashiladigan havola va stollaringiz uchun QR-kod olish uchun uni yoqing.",
    "settings.miniapp.copy_error": "Havolani nusxalab bo‘lmadi.",
    "settings.miniapp.share_title": "Bizdan Telegram orqali buyurtma bering",

    // AI shopping assistant
    "settings.assistant.legend": "AI xarid yordamchisi",
    "settings.assistant.beta": "Beta",
    "settings.assistant.description":
      "Yoqilganda, vitrina qidiruvi suhbatlashuvchi yordamchini ochadi — u xaridorlarga istalgan tilda mahsulot topish va uni savatga qo‘shishda yordam beradi. O‘chirilganda, qidiruv klassik tezkor natijalar ro‘yxati bo‘lib qoladi.",
    "settings.assistant.enable_label": "Yordamchini yoqish",
    "settings.assistant.enable_hint":
      "Ushbu vitrina uchun suhbatlashuvchi qidiruv.",
    "settings.assistant.on": "Yoniq",
    "settings.assistant.off": "O‘chiq",
    "settings.assistant.enabled_toast": "Yordamchi yoqildi.",
    "settings.assistant.disabled_toast": "Yordamchi o‘chirildi.",
    "settings.assistant.update_error":
      "Yordamchi sozlamasini yangilab bo‘lmadi.",

    // Validation + gating (server actions)
    "settings.miniapp.no_venue":
      "Ushbu katalog uchun muassasa topilmadi. Mini App uchun muassasa kerak.",
    "settings.venue.postal_hint": "Ixtiyoriy.",
    "settings.catalog.name_required": "Katalog nomini kiriting.",
    "settings.venue.name_required": "Muassasa nomini kiriting.",
    "settings.venue.currency_invalid": "Valyuta 3 harfli kod bo‘lishi kerak.",
    "settings.venue.modes_required":
      "Kamida bitta buyurtma rejimi yoqilgan bo‘lishi kerak.",
    "settings.venue.mode_unknown": "Noma’lum buyurtma rejimi: {mode}.",
    "settings.venue.hours_invalid": "{day} uchun noto‘g‘ri ish vaqti.",
    "settings.venue.hours_order_error":
      "{day}: yopilish vaqti ochilish vaqtidan keyin bo‘lishi kerak.",
    "settings.venue.dine_in_gated":
      "Zalda xizmat — Business tarifi imkoniyati. Olib ketish yoki yetkazib berishni yoqing yoki Business tarifiga o‘ting.",
    "settings.delivery.origin_required":
      "Yetkazib berishni yoqishdan oldin xaritada kafe manzilini belgilang.",
    "settings.payments.error_pro_required":
      "Karta orqali to‘lov — Pro tarifi imkoniyati. Krafta Pay’ni ulash uchun Pro tarifiga o‘ting.",
  },
};
