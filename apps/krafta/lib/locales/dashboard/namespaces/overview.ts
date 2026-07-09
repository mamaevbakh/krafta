/**
 * overview — dashboard "overview" surface strings. (Stub — to be filled during migration.)
 *
 * Contract: export { en, ru, "uz-Latn" } objects of flat dotted keys prefixed
 * "overview.". English is canonical (defines the key union); ru / uz-Latn are
 * type-checked against it in ../catalog.ts. Use {var} placeholders for runtime
 * values. See ./common.ts for the full contract.
 */

export const overview = {
  en: {
    // Page-level
    "overview.catalog_not_found": "Catalog not found.",
    "overview.guest": "Guest",

    // Header
    "overview.title": "Overview",
    "overview.sound_on": "Sound on",
    "overview.sound_off": "Sound off",
    "overview.open_shop": "Open shop",
    "overview.status_paused": "Shop is paused",
    "overview.status_draft": "Draft — only you can see this shop",
    "overview.status_taking_orders": "Taking orders",

    // KPI card
    "overview.revenue_today": "Revenue today",
    "overview.yesterday": "Yesterday",
    "overview.orders": "Orders",
    "overview.avg_order": "Average order",
    "overview.delta_same": "Same as last week",
    "overview.delta_vs_last_week": "{value}% vs last week",
    "overview.order_one": "order",
    "overview.order_other": "orders",

    // Queue card
    "overview.needs_attention": "Needs attention",
    "overview.all_orders": "All orders",
    "overview.queue_paused": "Shop is paused — no new orders are coming in",
    "overview.all_handled": "All orders handled",
    "overview.action_accept": "Accept",
    "overview.action_ready": "Ready",
    "overview.action_hand_off": "Hand off",

    // Recent orders + status badges
    "overview.recent_orders": "Recent orders",
    "overview.no_orders_today": "No orders yet today.",
    "overview.status_accepted": "Accepted",
    "overview.status_ready": "Ready",
    "overview.status_completed": "Completed",
    "overview.status_canceled": "Canceled",
    "overview.status_failed": "Failed",
    "overview.status_open": "Open",
    "overview.item_one": "item",
    "overview.item_other": "items",

    // Sales bars
    "overview.revenue_7d": "Revenue · 7 days",
    "overview.revenue_chart_aria": "Revenue over the last 7 days, peak {peak}",
    "overview.peak": "Peak",
    "overview.peak_on_day": "on {day}",

    // Top items
    "overview.popular": "Popular",
    "overview.days_7": "7 days",

    // First-order card
    "overview.first_order_title": "Get your first order",
    "overview.first_order_subtitle":
      "Share your shop — orders will show up right here.",
    "overview.publish_to_share":
      "Publish your shop to get a shareable link and QR code.",
    "overview.shop_link": "Shop link",
    "overview.qr_for_tables": "QR code for tables",
    "overview.qr_hint": "Print it, put it on the counter.",
    "overview.telegram_mini_app": "Telegram Mini App",
    "overview.orders_appear_here": "Your orders will appear here.",
    "overview.open": "Open",
    "overview.open_qr_codes": "Open QR codes",
  },
  ru: {
    // Page-level
    "overview.catalog_not_found": "Каталог не найден.",
    "overview.guest": "Гость",

    // Header
    "overview.title": "Обзор",
    "overview.sound_on": "Звук включён",
    "overview.sound_off": "Звук выключен",
    "overview.open_shop": "Открыть магазин",
    "overview.status_paused": "Магазин на паузе",
    "overview.status_draft": "Черновик — магазин видите только вы",
    "overview.status_taking_orders": "Принимает заказы",

    // KPI card
    "overview.revenue_today": "Выручка сегодня",
    "overview.yesterday": "Вчера",
    "overview.orders": "Заказы",
    "overview.avg_order": "Средний чек",
    "overview.delta_same": "Как на прошлой неделе",
    "overview.delta_vs_last_week": "{value}% к прошлой неделе",
    "overview.order_one": "заказ",
    "overview.order_other": "заказов",

    // Queue card
    "overview.needs_attention": "Требуют внимания",
    "overview.all_orders": "Все заказы",
    "overview.queue_paused": "Магазин на паузе — новые заказы не поступают",
    "overview.all_handled": "Все заказы обработаны",
    "overview.action_accept": "Принять",
    "overview.action_ready": "Готово",
    "overview.action_hand_off": "Выдать",

    // Recent orders + status badges
    "overview.recent_orders": "Последние заказы",
    "overview.no_orders_today": "Сегодня заказов пока нет.",
    "overview.status_accepted": "Принят",
    "overview.status_ready": "Готов",
    "overview.status_completed": "Выполнен",
    "overview.status_canceled": "Отменён",
    "overview.status_failed": "Ошибка",
    "overview.status_open": "Открыт",
    "overview.item_one": "товар",
    "overview.item_other": "товаров",

    // Sales bars
    "overview.revenue_7d": "Выручка · 7 дней",
    "overview.revenue_chart_aria": "Выручка за последние 7 дней, пик {peak}",
    "overview.peak": "Пик",
    "overview.peak_on_day": "в {day}",

    // Top items
    "overview.popular": "Популярное",
    "overview.days_7": "7 дней",

    // First-order card
    "overview.first_order_title": "Получите первый заказ",
    "overview.first_order_subtitle":
      "Поделитесь магазином — заказы появятся прямо здесь.",
    "overview.publish_to_share":
      "Опубликуйте магазин, чтобы получить ссылку и QR-код.",
    "overview.shop_link": "Ссылка на магазин",
    "overview.qr_for_tables": "QR-код для столиков",
    "overview.qr_hint": "Распечатайте и поставьте на стойку.",
    "overview.telegram_mini_app": "Telegram Mini App",
    "overview.orders_appear_here": "Ваши заказы появятся здесь.",
    "overview.open": "Открыть",
    "overview.open_qr_codes": "Открыть QR-коды",
  },
  "uz-Latn": {
    // Page-level
    "overview.catalog_not_found": "Katalog topilmadi.",
    "overview.guest": "Mehmon",

    // Header
    "overview.title": "Umumiy ko‘rinish",
    "overview.sound_on": "Ovoz yoqilgan",
    "overview.sound_off": "Ovoz o‘chirilgan",
    "overview.open_shop": "Do‘konni ochish",
    "overview.status_paused": "Do‘kon to‘xtatilgan",
    "overview.status_draft": "Qoralama — do‘konni faqat siz ko‘rasiz",
    "overview.status_taking_orders": "Buyurtmalar qabul qilinmoqda",

    // KPI card
    "overview.revenue_today": "Bugungi tushum",
    "overview.yesterday": "Kecha",
    "overview.orders": "Buyurtmalar",
    "overview.avg_order": "O‘rtacha chek",
    "overview.delta_same": "O‘tgan haftadagidek",
    "overview.delta_vs_last_week": "o‘tgan haftaga nisbatan {value}%",
    "overview.order_one": "buyurtma",
    "overview.order_other": "buyurtma",

    // Queue card
    "overview.needs_attention": "E’tibor talab qiladi",
    "overview.all_orders": "Barcha buyurtmalar",
    "overview.queue_paused": "Do‘kon to‘xtatilgan — yangi buyurtmalar kelmayapti",
    "overview.all_handled": "Barcha buyurtmalar bajarildi",
    "overview.action_accept": "Qabul qilish",
    "overview.action_ready": "Tayyor",
    "overview.action_hand_off": "Topshirish",

    // Recent orders + status badges
    "overview.recent_orders": "So‘nggi buyurtmalar",
    "overview.no_orders_today": "Bugun hali buyurtmalar yo‘q.",
    "overview.status_accepted": "Qabul qilindi",
    "overview.status_ready": "Tayyor",
    "overview.status_completed": "Bajarildi",
    "overview.status_canceled": "Bekor qilindi",
    "overview.status_failed": "Xatolik",
    "overview.status_open": "Ochiq",
    "overview.item_one": "mahsulot",
    "overview.item_other": "mahsulot",

    // Sales bars
    "overview.revenue_7d": "Tushum · 7 kun",
    "overview.revenue_chart_aria": "So‘nggi 7 kunlik tushum, eng yuqori {peak}",
    "overview.peak": "Eng yuqori",
    "overview.peak_on_day": "{day} kuni",

    // Top items
    "overview.popular": "Ommabop",
    "overview.days_7": "7 kun",

    // First-order card
    "overview.first_order_title": "Birinchi buyurtmangizni oling",
    "overview.first_order_subtitle":
      "Do‘koningizni ulashing — buyurtmalar shu yerda paydo bo‘ladi.",
    "overview.publish_to_share":
      "Havola va QR-kod olish uchun do‘konni e’lon qiling.",
    "overview.shop_link": "Do‘kon havolasi",
    "overview.qr_for_tables": "Stollar uchun QR-kod",
    "overview.qr_hint": "Chop etib, peshtaxtaga qo‘ying.",
    "overview.telegram_mini_app": "Telegram Mini App",
    "overview.orders_appear_here": "Buyurtmalaringiz shu yerda paydo bo‘ladi.",
    "overview.open": "Ochish",
    "overview.open_qr_codes": "QR-kodlarni ochish",
  },
};
