/**
 * billing — plan / subscription / Krafta Pay billing UI strings.
 *
 * Contract: export { en, ru, "uz-Latn" } objects of flat dotted keys prefixed
 * "billing.". English is canonical (defines the key union); ru / uz-Latn are
 * type-checked against it in ../catalog.ts. Use {var} placeholders for runtime
 * values. See ./common.ts for the full contract.
 */

export const billing = {
  en: {
    "billing.heading": "Subscription & plan management",
    "billing.catalog_label": "Catalog {slug}",
    "billing.org_not_found": "Organization not found.",
    "billing.manage_billing": "Manage Billing",
    "billing.view_plans": "View Plans",
    "billing.plans_and_billing": "Plans & Billing",

    "billing.metric.access": "Access",
    "billing.metric.current_plan": "Current Plan",
    "billing.metric.subscription_status": "Subscription Status",
    "billing.metric.access_ends": "Access Ends",
    "billing.metric.next_billing": "Next Billing Date",

    "billing.not_subscribed": "Not subscribed",
    "billing.not_available": "n/a",
    "billing.status_none": "none",

    "billing.entitlement.active": "Active",
    "billing.entitlement.ending_soon": "Ending Soon",
    "billing.entitlement.none": "No Active Subscription",

    "billing.desc.cancel_at_period_end": "Subscription is set to cancel at period end ({date}).",
    "billing.desc.renews_on": "Your access renews on {date}.",
    "billing.desc.active": "Subscription is active.",
    "billing.desc.grace_until": "Access remains available until {date}.",
    "billing.desc.grace_no_date": "Subscription is canceled but may still be within an access window.",
    "billing.desc.locked_status": "No active access. Latest subscription status: {status}.",
    "billing.desc.locked_none": "Choose a plan to activate builder and catalog publishing features.",

    "billing.banner.success_title": "Checkout completed",
    "billing.banner.success_desc": "Your subscription status will refresh automatically after payment is confirmed.",
    "billing.banner.cancel_title": "Checkout canceled",
    "billing.banner.cancel_desc": "No changes were made to your subscription.",
    "billing.banner.error_title": "Billing action failed",

    "billing.plans_heading": "Plans",
    "billing.plans_subtitle": "Choose a plan for this organization. The current plan is clearly marked and cannot be re-purchased.",
    "billing.current_badge": "Current: {name}",
    "billing.no_plans": "No active plans available right now.",

    "billing.action.current": "Current plan",
    "billing.action.choose": "Choose {name}",
    "billing.action.switch": "Switch to {name}",
    "billing.current": "Current",

    "billing.cadence": "Billing cadence",
    "billing.months_count": "{count} month(s)",
    "billing.trial": "Trial",
    "billing.trial_days": "{days} days",
    "billing.no_trial": "No trial",
    "billing.cancel_note": "This subscription is scheduled to cancel at period end. Use Manage Billing to resume or change it.",

    "billing.interval.monthly": "monthly",
    "billing.interval.every_months": "every {count} months",

    "billing.error.missing_fields": "Missing required fields",
    "billing.error.forbidden": "Forbidden",
    "billing.error.already_on_plan": "You are already on this plan. Use Manage Billing for payment method or cancellation changes.",
    "billing.error.https_required": "Uzum requires HTTPS return URLs. Set KRAFTA_APP_URL to an https:// domain (e.g. tunnel or production URL).",
    "billing.error.checkout_failed": "Failed to create checkout session",
    "billing.error.plans_load_failed": "Couldn't load plans right now.",
  },
  ru: {
    "billing.heading": "Подписка и тариф",
    "billing.catalog_label": "Каталог {slug}",
    "billing.org_not_found": "Организация не найдена.",
    "billing.manage_billing": "Управление оплатой",
    "billing.view_plans": "Смотреть тарифы",
    "billing.plans_and_billing": "Тарифы и оплата",

    "billing.metric.access": "Доступ",
    "billing.metric.current_plan": "Текущий тариф",
    "billing.metric.subscription_status": "Статус подписки",
    "billing.metric.access_ends": "Окончание доступа",
    "billing.metric.next_billing": "Следующее списание",

    "billing.not_subscribed": "Без подписки",
    "billing.not_available": "н/д",
    "billing.status_none": "нет",

    "billing.entitlement.active": "Активна",
    "billing.entitlement.ending_soon": "Скоро закончится",
    "billing.entitlement.none": "Нет активной подписки",

    "billing.desc.cancel_at_period_end": "Подписка будет отменена в конце периода ({date}).",
    "billing.desc.renews_on": "Доступ продлевается {date}.",
    "billing.desc.active": "Подписка активна.",
    "billing.desc.grace_until": "Доступ сохраняется до {date}.",
    "billing.desc.grace_no_date": "Подписка отменена, но доступ может ещё некоторое время действовать.",
    "billing.desc.locked_status": "Активного доступа нет. Последний статус подписки: {status}.",
    "billing.desc.locked_none": "Выберите тариф, чтобы включить конструктор и публикацию каталога.",

    "billing.banner.success_title": "Оплата завершена",
    "billing.banner.success_desc": "Статус подписки обновится автоматически после подтверждения платежа.",
    "billing.banner.cancel_title": "Оплата отменена",
    "billing.banner.cancel_desc": "Изменения в подписку не внесены.",
    "billing.banner.error_title": "Не удалось выполнить действие",

    "billing.plans_heading": "Тарифы",
    "billing.plans_subtitle": "Выберите тариф для этой организации. Текущий тариф отмечен и не может быть куплен повторно.",
    "billing.current_badge": "Текущий: {name}",
    "billing.no_plans": "Сейчас нет доступных тарифов.",

    "billing.action.current": "Текущий тариф",
    "billing.action.choose": "Выбрать {name}",
    "billing.action.switch": "Перейти на {name}",
    "billing.current": "Текущий",

    "billing.cadence": "Периодичность оплаты",
    "billing.months_count": "{count} мес.",
    "billing.trial": "Пробный период",
    "billing.trial_days": "{days} дн.",
    "billing.no_trial": "Без пробного периода",
    "billing.cancel_note": "Эта подписка будет отменена в конце периода. Откройте «Управление оплатой», чтобы возобновить или изменить её.",

    "billing.interval.monthly": "ежемесячно",
    "billing.interval.every_months": "каждые {count} мес.",

    "billing.error.missing_fields": "Заполнены не все обязательные поля",
    "billing.error.forbidden": "Доступ запрещён",
    "billing.error.already_on_plan": "Вы уже на этом тарифе. Для смены способа оплаты или отмены откройте «Управление оплатой».",
    "billing.error.https_required": "Uzum требует HTTPS для адресов возврата. Укажите в KRAFTA_APP_URL домен с https:// (например, туннель или продакшн-URL).",
    "billing.error.checkout_failed": "Не удалось создать сессию оплаты",
    "billing.error.plans_load_failed": "Не удалось загрузить тарифы.",
  },
  "uz-Latn": {
    "billing.heading": "Obuna va tarif",
    "billing.catalog_label": "Katalog {slug}",
    "billing.org_not_found": "Tashkilot topilmadi.",
    "billing.manage_billing": "To‘lovni boshqarish",
    "billing.view_plans": "Tariflarni ko‘rish",
    "billing.plans_and_billing": "Tariflar va to‘lov",

    "billing.metric.access": "Ruxsat",
    "billing.metric.current_plan": "Joriy tarif",
    "billing.metric.subscription_status": "Obuna holati",
    "billing.metric.access_ends": "Ruxsat tugashi",
    "billing.metric.next_billing": "Keyingi to‘lov",

    "billing.not_subscribed": "Obuna yo‘q",
    "billing.not_available": "—",
    "billing.status_none": "yo‘q",

    "billing.entitlement.active": "Faol",
    "billing.entitlement.ending_soon": "Tez orada tugaydi",
    "billing.entitlement.none": "Faol obuna yo‘q",

    "billing.desc.cancel_at_period_end": "Obuna davr oxirida bekor qilinadi ({date}).",
    "billing.desc.renews_on": "Ruxsat {date} da yangilanadi.",
    "billing.desc.active": "Obuna faol.",
    "billing.desc.grace_until": "Ruxsat {date} gacha saqlanadi.",
    "billing.desc.grace_no_date": "Obuna bekor qilingan, lekin ruxsat hali biroz vaqt amal qilishi mumkin.",
    "billing.desc.locked_status": "Faol ruxsat yo‘q. So‘nggi obuna holati: {status}.",
    "billing.desc.locked_none": "Konstruktor va katalogni chop etish imkoniyatlarini yoqish uchun tarif tanlang.",

    "billing.banner.success_title": "To‘lov yakunlandi",
    "billing.banner.success_desc": "To‘lov tasdiqlangach, obuna holati avtomatik yangilanadi.",
    "billing.banner.cancel_title": "To‘lov bekor qilindi",
    "billing.banner.cancel_desc": "Obunangizga o‘zgartirish kiritilmadi.",
    "billing.banner.error_title": "Amalni bajarib bo‘lmadi",

    "billing.plans_heading": "Tariflar",
    "billing.plans_subtitle": "Bu tashkilot uchun tarif tanlang. Joriy tarif belgilangan va uni qayta sotib bo‘lmaydi.",
    "billing.current_badge": "Joriy: {name}",
    "billing.no_plans": "Hozircha mavjud tariflar yo‘q.",

    "billing.action.current": "Joriy tarif",
    "billing.action.choose": "{name} tanlash",
    "billing.action.switch": "{name} tarifiga o‘tish",
    "billing.current": "Joriy",

    "billing.cadence": "To‘lov davri",
    "billing.months_count": "{count} oy",
    "billing.trial": "Sinov muddati",
    "billing.trial_days": "{days} kun",
    "billing.no_trial": "Sinovsiz",
    "billing.cancel_note": "Bu obuna davr oxirida bekor qilinadi. Uni tiklash yoki o‘zgartirish uchun «To‘lovni boshqarish»ni oching.",

    "billing.interval.monthly": "oylik",
    "billing.interval.every_months": "har {count} oyda",

    "billing.error.missing_fields": "Majburiy maydonlar to‘ldirilmagan",
    "billing.error.forbidden": "Ruxsat yo‘q",
    "billing.error.already_on_plan": "Siz allaqachon shu tarifdasiz. To‘lov usulini o‘zgartirish yoki bekor qilish uchun «To‘lovni boshqarish»ni oching.",
    "billing.error.https_required": "Uzum qaytish manzillari uchun HTTPS talab qiladi. KRAFTA_APP_URL’ga https:// domenini kiriting (masalan, tunnel yoki prod URL).",
    "billing.error.checkout_failed": "To‘lov sessiyasini yaratib bo‘lmadi",
    "billing.error.plans_load_failed": "Tariflarni yuklab bo‘lmadi.",
  },
};
