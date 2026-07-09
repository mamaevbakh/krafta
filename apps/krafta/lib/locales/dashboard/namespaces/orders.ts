/**
 * orders — dashboard "orders" surface strings. (Stub — to be filled during migration.)
 *
 * Contract: export { en, ru, "uz-Latn" } objects of flat dotted keys prefixed
 * "orders.". English is canonical (defines the key union); ru / uz-Latn are
 * type-checked against it in ../catalog.ts. Use {var} placeholders for runtime
 * values. See ./common.ts for the full contract.
 */

export const orders = {
  en: {
    // List page
    "orders.title": "Orders",
    "orders.subtitle":
      "Live queue from the customer-facing catalog. Drafts (in-flight carts) are hidden.",
    "orders.catalog_not_found": "Catalog not found.",
    "orders.customer_guest": "Guest",
    "orders.search_placeholder": "Search by order reference…",

    // Sound toggle
    "orders.sound_off_hint": "Sound is off — click to ring on new orders",
    "orders.sound_on_hint": "Sound is on — click to mute",
    "orders.sound_muted": "Muted",
    "orders.sound_on": "Sound on",

    // Filter tabs
    "orders.tab_open": "Open",
    "orders.tab_completed": "Completed",
    "orders.tab_canceled": "Canceled",

    // Table columns
    "orders.col_order": "Order",
    "orders.col_when": "When",
    "orders.col_mode": "Mode",
    "orders.col_customer": "Customer",
    "orders.col_items": "Items",
    "orders.col_total": "Total",
    "orders.col_state": "State",

    // Fulfillment modes
    "orders.mode_dine_in": "Dine-in",
    "orders.mode_pickup": "Pickup",
    "orders.mode_delivery": "Delivery",
    "orders.mode_digital": "Digital",

    // Order / fulfillment statuses
    "orders.status_new": "New",
    "orders.status_accepted": "Accepted",
    "orders.status_ready": "Ready",
    "orders.status_completed": "Completed",
    "orders.status_canceled": "Canceled",
    "orders.status_failed": "Failed",
    "orders.status_open": "Open",
    "orders.status_draft": "Draft",

    // Detail sheet
    "orders.detail_title": "Order {reference}",
    "orders.detail_title_empty": "Order",
    "orders.detail_empty_hint": "Pick an order from the list to see its details.",
    "orders.detail_unavailable": "This order is no longer available.",

    // Actions block
    "orders.actions_label": "Actions",
    "orders.action_accept": "Accept",
    "orders.action_mark_ready": "Mark ready",
    "orders.action_mark_delivered": "Mark delivered",
    "orders.action_mark_picked_up": "Mark picked up",
    "orders.action_close_bill": "Close bill",

    // Cancel dialog
    "orders.cancel_title": "Cancel this order?",
    "orders.cancel_description":
      "The customer will see the order as canceled. Optionally tell them why.",
    "orders.cancel_reason_placeholder": "Reason (optional)",
    "orders.cancel_keep": "Keep order",
    "orders.cancel_confirm": "Cancel order",

    // Detail line labels
    "orders.detail_table": "Table",
    "orders.detail_table_value": "Table {label}",
    "orders.detail_party_size": "Party size",
    "orders.detail_course": "Course",
    "orders.detail_when": "When",
    "orders.detail_name": "Name",
    "orders.detail_phone": "Phone",
    "orders.detail_email": "Email",
    "orders.detail_note": "Note",
    "orders.detail_curbside": "Curbside",
    "orders.detail_address": "Address",
    "orders.detail_recipient": "Recipient",
    "orders.detail_provider": "Provider",
    "orders.detail_source": "Source",
    "orders.detail_method": "Method",
    "orders.detail_amount": "Amount",
    "orders.detail_collected": "Collected",

    // Timing
    "orders.pickup_asap": "As soon as ready",
    "orders.delivery_asap": "As soon as possible",

    // Timestamp ladder
    "orders.ts_placed": "Placed",
    "orders.ts_accepted": "Accepted",
    "orders.ts_ready": "Ready",
    "orders.ts_picked_up": "Picked up",
    "orders.ts_canceled": "Canceled",
    "orders.ts_courier_assigned": "Courier assigned",
    "orders.ts_delivered": "Delivered",

    // Sections
    "orders.section_customer": "Customer",
    "orders.section_payment": "Payment",
    "orders.section_items": "Items",
    "orders.subtotal": "Subtotal",

    // Order sources
    "orders.source_web": "Web",
    "orders.source_tma": "Telegram",
    "orders.source_qr_scan": "QR scan",
    "orders.source_dashboard": "Dashboard",

    // Payment
    "orders.payment_cash_collected": "Cash collected",
    "orders.payment_cash_pay_at": "Cash — pay at {location}",
    "orders.pay_at_table": "the table",
    "orders.pay_at_counter": "the counter",
    "orders.pay_at_delivery": "delivery",
    "orders.payment_cash_recorded": "Cash recorded",
    "orders.payment_mark_collected": "Mark cash collected",

    // New-order alert
    "orders.alert_new_order": "New order",
    "orders.alert_new_dine_in": "New dine-in order",
    "orders.alert_new_pickup": "New pickup order",
    "orders.alert_new_delivery": "New delivery order",
    "orders.alert_description": "A customer just placed an order.",
    "orders.alert_view": "View",

    // Server-action errors
    "orders.error_fulfillment_not_found": "Fulfillment not found.",
    "orders.error_fulfillment_mismatch":
      "Fulfillment does not belong to this order.",
    "orders.error_invalid_transition": "Cannot {action} from state {state}.",
  },
  ru: {
    // List page
    "orders.title": "Заказы",
    "orders.subtitle":
      "Живая очередь из клиентского каталога. Черновики (корзины в процессе оформления) скрыты.",
    "orders.catalog_not_found": "Каталог не найден.",
    "orders.customer_guest": "Гость",
    "orders.search_placeholder": "Поиск по номеру заказа…",

    // Sound toggle
    "orders.sound_off_hint": "Звук выключен — нажмите, чтобы получать сигнал о новых заказах",
    "orders.sound_on_hint": "Звук включён — нажмите, чтобы выключить",
    "orders.sound_muted": "Без звука",
    "orders.sound_on": "Со звуком",

    // Filter tabs
    "orders.tab_open": "Открытые",
    "orders.tab_completed": "Завершённые",
    "orders.tab_canceled": "Отменённые",

    // Table columns
    "orders.col_order": "Заказ",
    "orders.col_when": "Когда",
    "orders.col_mode": "Способ",
    "orders.col_customer": "Клиент",
    "orders.col_items": "Позиции",
    "orders.col_total": "Итого",
    "orders.col_state": "Статус",

    // Fulfillment modes
    "orders.mode_dine_in": "В зале",
    "orders.mode_pickup": "Самовывоз",
    "orders.mode_delivery": "Доставка",
    "orders.mode_digital": "Цифровой",

    // Order / fulfillment statuses
    "orders.status_new": "Новый",
    "orders.status_accepted": "Принят",
    "orders.status_ready": "Готов",
    "orders.status_completed": "Завершён",
    "orders.status_canceled": "Отменён",
    "orders.status_failed": "Ошибка",
    "orders.status_open": "Открыт",
    "orders.status_draft": "Черновик",

    // Detail sheet
    "orders.detail_title": "Заказ {reference}",
    "orders.detail_title_empty": "Заказ",
    "orders.detail_empty_hint": "Выберите заказ из списка, чтобы увидеть детали.",
    "orders.detail_unavailable": "Этот заказ больше недоступен.",

    // Actions block
    "orders.actions_label": "Действия",
    "orders.action_accept": "Принять",
    "orders.action_mark_ready": "Отметить готовым",
    "orders.action_mark_delivered": "Отметить доставленным",
    "orders.action_mark_picked_up": "Отметить выданным",
    "orders.action_close_bill": "Закрыть счёт",

    // Cancel dialog
    "orders.cancel_title": "Отменить этот заказ?",
    "orders.cancel_description":
      "Клиент увидит, что заказ отменён. При желании укажите причину.",
    "orders.cancel_reason_placeholder": "Причина (необязательно)",
    "orders.cancel_keep": "Оставить заказ",
    "orders.cancel_confirm": "Отменить заказ",

    // Detail line labels
    "orders.detail_table": "Стол",
    "orders.detail_table_value": "Стол {label}",
    "orders.detail_party_size": "Гостей",
    "orders.detail_course": "Подача",
    "orders.detail_when": "Когда",
    "orders.detail_name": "Имя",
    "orders.detail_phone": "Телефон",
    "orders.detail_email": "Эл. почта",
    "orders.detail_note": "Примечание",
    "orders.detail_curbside": "У машины",
    "orders.detail_address": "Адрес",
    "orders.detail_recipient": "Получатель",
    "orders.detail_provider": "Служба",
    "orders.detail_source": "Источник",
    "orders.detail_method": "Способ оплаты",
    "orders.detail_amount": "Сумма",
    "orders.detail_collected": "Получено",

    // Timing
    "orders.pickup_asap": "Как только будет готово",
    "orders.delivery_asap": "Как можно скорее",

    // Timestamp ladder
    "orders.ts_placed": "Оформлен",
    "orders.ts_accepted": "Принят",
    "orders.ts_ready": "Готов",
    "orders.ts_picked_up": "Выдан",
    "orders.ts_canceled": "Отменён",
    "orders.ts_courier_assigned": "Курьер назначен",
    "orders.ts_delivered": "Доставлен",

    // Sections
    "orders.section_customer": "Клиент",
    "orders.section_payment": "Оплата",
    "orders.section_items": "Позиции",
    "orders.subtotal": "Подытог",

    // Order sources
    "orders.source_web": "Веб",
    "orders.source_tma": "Telegram",
    "orders.source_qr_scan": "QR-скан",
    "orders.source_dashboard": "Панель",

    // Payment
    "orders.payment_cash_collected": "Наличные получены",
    "orders.payment_cash_pay_at": "Наличные — оплата {location}",
    "orders.pay_at_table": "у стола",
    "orders.pay_at_counter": "у кассы",
    "orders.pay_at_delivery": "при доставке",
    "orders.payment_cash_recorded": "Наличные записаны",
    "orders.payment_mark_collected": "Отметить получение наличных",

    // New-order alert
    "orders.alert_new_order": "Новый заказ",
    "orders.alert_new_dine_in": "Новый заказ в зале",
    "orders.alert_new_pickup": "Новый заказ на самовывоз",
    "orders.alert_new_delivery": "Новый заказ на доставку",
    "orders.alert_description": "Клиент только что оформил заказ.",
    "orders.alert_view": "Посмотреть",

    // Server-action errors
    "orders.error_fulfillment_not_found": "Обработка заказа не найдена.",
    "orders.error_fulfillment_mismatch": "Обработка не относится к этому заказу.",
    "orders.error_invalid_transition":
      "Невозможно выполнить «{action}» из состояния «{state}».",
  },
  "uz-Latn": {
    // List page
    "orders.title": "Buyurtmalar",
    "orders.subtitle":
      "Mijozlar katalogidan jonli navbat. Qoralamalar (rasmiylashtirilayotgan savatlar) yashirilgan.",
    "orders.catalog_not_found": "Katalog topilmadi.",
    "orders.customer_guest": "Mehmon",
    "orders.search_placeholder": "Buyurtma raqami bo‘yicha qidirish…",

    // Sound toggle
    "orders.sound_off_hint":
      "Ovoz o‘chirilgan — yangi buyurtmalar haqida signal olish uchun bosing",
    "orders.sound_on_hint": "Ovoz yoqilgan — o‘chirish uchun bosing",
    "orders.sound_muted": "Ovozsiz",
    "orders.sound_on": "Ovozli",

    // Filter tabs
    "orders.tab_open": "Ochiq",
    "orders.tab_completed": "Yakunlangan",
    "orders.tab_canceled": "Bekor qilingan",

    // Table columns
    "orders.col_order": "Buyurtma",
    "orders.col_when": "Qachon",
    "orders.col_mode": "Usul",
    "orders.col_customer": "Mijoz",
    "orders.col_items": "Mahsulotlar",
    "orders.col_total": "Jami",
    "orders.col_state": "Holat",

    // Fulfillment modes
    "orders.mode_dine_in": "Zalda",
    "orders.mode_pickup": "Olib ketish",
    "orders.mode_delivery": "Yetkazib berish",
    "orders.mode_digital": "Raqamli",

    // Order / fulfillment statuses
    "orders.status_new": "Yangi",
    "orders.status_accepted": "Qabul qilindi",
    "orders.status_ready": "Tayyor",
    "orders.status_completed": "Yakunlandi",
    "orders.status_canceled": "Bekor qilindi",
    "orders.status_failed": "Xatolik",
    "orders.status_open": "Ochiq",
    "orders.status_draft": "Qoralama",

    // Detail sheet
    "orders.detail_title": "Buyurtma {reference}",
    "orders.detail_title_empty": "Buyurtma",
    "orders.detail_empty_hint":
      "Tafsilotlarni ko‘rish uchun ro‘yxatdan buyurtmani tanlang.",
    "orders.detail_unavailable": "Bu buyurtma endi mavjud emas.",

    // Actions block
    "orders.actions_label": "Amallar",
    "orders.action_accept": "Qabul qilish",
    "orders.action_mark_ready": "Tayyor deb belgilash",
    "orders.action_mark_delivered": "Yetkazildi deb belgilash",
    "orders.action_mark_picked_up": "Berildi deb belgilash",
    "orders.action_close_bill": "Hisobni yopish",

    // Cancel dialog
    "orders.cancel_title": "Bu buyurtma bekor qilinsinmi?",
    "orders.cancel_description":
      "Mijoz buyurtma bekor qilinganini ko‘radi. Xohlasangiz, sababini ko‘rsating.",
    "orders.cancel_reason_placeholder": "Sabab (ixtiyoriy)",
    "orders.cancel_keep": "Buyurtmani qoldirish",
    "orders.cancel_confirm": "Buyurtmani bekor qilish",

    // Detail line labels
    "orders.detail_table": "Stol",
    "orders.detail_table_value": "Stol {label}",
    "orders.detail_party_size": "Mehmonlar soni",
    "orders.detail_course": "Navbat",
    "orders.detail_when": "Qachon",
    "orders.detail_name": "Ism",
    "orders.detail_phone": "Telefon",
    "orders.detail_email": "Email",
    "orders.detail_note": "Izoh",
    "orders.detail_curbside": "Mashina yonida",
    "orders.detail_address": "Manzil",
    "orders.detail_recipient": "Qabul qiluvchi",
    "orders.detail_provider": "Xizmat",
    "orders.detail_source": "Manba",
    "orders.detail_method": "To‘lov usuli",
    "orders.detail_amount": "Summa",
    "orders.detail_collected": "Qabul qilindi",

    // Timing
    "orders.pickup_asap": "Tayyor bo‘lishi bilan",
    "orders.delivery_asap": "Imkon qadar tezroq",

    // Timestamp ladder
    "orders.ts_placed": "Rasmiylashtirildi",
    "orders.ts_accepted": "Qabul qilindi",
    "orders.ts_ready": "Tayyor",
    "orders.ts_picked_up": "Berildi",
    "orders.ts_canceled": "Bekor qilindi",
    "orders.ts_courier_assigned": "Kuryer tayinlandi",
    "orders.ts_delivered": "Yetkazildi",

    // Sections
    "orders.section_customer": "Mijoz",
    "orders.section_payment": "To‘lov",
    "orders.section_items": "Mahsulotlar",
    "orders.subtotal": "Oraliq jami",

    // Order sources
    "orders.source_web": "Veb",
    "orders.source_tma": "Telegram",
    "orders.source_qr_scan": "QR skan",
    "orders.source_dashboard": "Boshqaruv paneli",

    // Payment
    "orders.payment_cash_collected": "Naqd olindi",
    "orders.payment_cash_pay_at": "Naqd — {location} to‘lanadi",
    "orders.pay_at_table": "stolda",
    "orders.pay_at_counter": "kassada",
    "orders.pay_at_delivery": "yetkazishda",
    "orders.payment_cash_recorded": "Naqd qayd etildi",
    "orders.payment_mark_collected": "Naqd olindi deb belgilash",

    // New-order alert
    "orders.alert_new_order": "Yangi buyurtma",
    "orders.alert_new_dine_in": "Zalda yangi buyurtma",
    "orders.alert_new_pickup": "Olib ketishga yangi buyurtma",
    "orders.alert_new_delivery": "Yetkazishga yangi buyurtma",
    "orders.alert_description": "Mijoz hozirgina buyurtma berdi.",
    "orders.alert_view": "Ko‘rish",

    // Server-action errors
    "orders.error_fulfillment_not_found": "Buyurtma bajaruvi topilmadi.",
    "orders.error_fulfillment_mismatch":
      "Bu bajaruv ushbu buyurtmaga tegishli emas.",
    "orders.error_invalid_transition":
      "«{state}» holatidan «{action}» amalini bajarib bo‘lmaydi.",
  },
};
