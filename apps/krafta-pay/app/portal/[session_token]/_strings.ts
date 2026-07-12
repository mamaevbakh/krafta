// Localized copy for the hosted customer portal. Russian is the default (the
// primary audience is Uzbek merchants); Uzbek (Latin) and English follow.
//
// The locale is resolved from the portal session metadata (`locale`) or a
// `?lang=` query param, defaulting to `ru`.

export type PortalLocale = "ru" | "uz" | "en";

export function resolvePortalLocale(input?: string | null): PortalLocale {
  const value = String(input ?? "").toLowerCase();
  if (value.startsWith("uz")) return "uz";
  if (value.startsWith("en")) return "en";
  return "ru";
}

export function getPortalStrings(locale: PortalLocale) {
  return STRINGS[locale];
}

export function localeTag(locale: PortalLocale): string {
  if (locale === "en") return "en-GB";
  if (locale === "uz") return "uz-Latn-UZ";
  return "ru-RU";
}

type StatusTone = "success" | "warning" | "destructive" | "muted";

const SUB_STATUS: Record<string, { ru: string; uz: string; en: string; tone: StatusTone }> = {
  active: { ru: "Активна", uz: "Faol", en: "Active", tone: "success" },
  trialing: { ru: "Пробный период", uz: "Sinov muddati", en: "Trial", tone: "success" },
  past_due: { ru: "Просрочена", uz: "Muddati o‘tgan", en: "Past due", tone: "warning" },
  unpaid: { ru: "Не оплачена", uz: "To‘lanmagan", en: "Unpaid", tone: "warning" },
  incomplete: { ru: "Не завершена", uz: "Tugallanmagan", en: "Incomplete", tone: "warning" },
  paused: { ru: "Приостановлена", uz: "To‘xtatilgan", en: "Paused", tone: "muted" },
  canceled: { ru: "Отменена", uz: "Bekor qilingan", en: "Canceled", tone: "muted" },
  cancelled: { ru: "Отменена", uz: "Bekor qilingan", en: "Canceled", tone: "muted" },
};

const INVOICE_STATUS: Record<string, { ru: string; uz: string; en: string; tone: StatusTone }> = {
  paid: { ru: "Оплачено", uz: "To‘langan", en: "Paid", tone: "success" },
  succeeded: { ru: "Оплачено", uz: "To‘langan", en: "Paid", tone: "success" },
  open: { ru: "Ожидает оплаты", uz: "To‘lov kutilmoqda", en: "Open", tone: "warning" },
  processing: { ru: "В обработке", uz: "Qayta ishlanmoqda", en: "Processing", tone: "warning" },
  draft: { ru: "Черновик", uz: "Qoralama", en: "Draft", tone: "muted" },
  void: { ru: "Аннулирован", uz: "Bekor qilingan", en: "Void", tone: "muted" },
  uncollectible: { ru: "Не оплачен", uz: "To‘lanmagan", en: "Uncollectible", tone: "destructive" },
  failed: { ru: "Ошибка", uz: "Xatolik", en: "Failed", tone: "destructive" },
};

export function subStatusMeta(status: string | null | undefined, locale: PortalLocale) {
  const key = String(status ?? "").toLowerCase();
  const entry = SUB_STATUS[key];
  if (entry) return { label: entry[locale], tone: entry.tone as StatusTone };
  return { label: status ? String(status) : "—", tone: "muted" as StatusTone };
}

export function invoiceStatusMeta(status: string | null | undefined, locale: PortalLocale) {
  const key = String(status ?? "").toLowerCase();
  const entry = INVOICE_STATUS[key];
  if (entry) return { label: entry[locale], tone: entry.tone as StatusTone };
  return { label: status ? String(status) : "—", tone: "muted" as StatusTone };
}

const STRINGS = {
  ru: {
    pageTitle: "Управление подпиской",
    trust: (brand: string) =>
      `${brand} использует Krafta Pay для выставления счетов и управления подпиской.`,
    backTo: (brand: string) => `Вернуться в ${brand}`,
    processedBy: "Обработка платежей — Krafta Pay",
    terms: "Условия",
    privacy: "Конфиденциальность",
    themeToggle: "Переключить тему",
    backShort: "Назад",

    currentSubscription: "Текущая подписка",
    paymentMethod: "Способ оплаты",
    billingInfo: "Платёжная информация",
    invoiceHistory: "История счетов",

    perMonth: "мес",
    perMonths: (n: number) => `${n} мес`,
    autoRenew: "Автоматическое продление по карте",
    showDetails: "Показать подробности",
    planAmount: "Стоимость тарифа",
    subscriptionSince: "Оформлена",
    currentPeriod: "Оплаченный период",
    nextBilling: "Следующее списание",
    cancelScheduled: (date: string) => `Подписка будет отменена ${date}`,
    pendingPlanChange: (plan: string, date: string) =>
      `Запланирован переход на тариф «${plan}» — ${date}`,

    changePlan: "Сменить план",
    changePlanTo: "Новый тариф",
    whenApply: "Когда применить",
    applyPeriodEnd: "В конце текущего периода",
    applyNow: "Сейчас",
    confirmChange: "Подтвердить смену",
    cancelSub: "Отменить подписку",
    cancelHint: "Доступ сохранится до конца оплаченного периода.",
    cancelConfirm: "Да, отменить в конце периода",
    cancellationScheduled: "Отмена запланирована",

    addCard: "Добавить способ оплаты",
    updateCard: "Изменить способ оплаты",
    defaultBadge: "По умолчанию",
    expires: "Срок действия",
    noPaymentMethods: "Способ оплаты пока не добавлен.",

    email: "Электронная почта",
    phone: "Телефон",

    colDate: "Дата",
    colPlan: "Тариф",
    colAmount: "Сумма",
    colStatus: "Статус",
    noInvoices: "Счетов пока нет.",
    noSubscriptions: "У вас нет активных подписок.",

    sessionUnavailableTitle: "Сессия недоступна",
    sessionUnavailableBody:
      "Срок действия этой ссылки истёк или она недействительна. Откройте управление оплатой в приложении заново.",
  },
  uz: {
    pageTitle: "Obunani boshqarish",
    trust: (brand: string) =>
      `${brand} hisob-fakturalar va obunani boshqarish uchun Krafta Pay’dan foydalanadi.`,
    backTo: (brand: string) => `${brand}ga qaytish`,
    processedBy: "To‘lovlarni Krafta Pay amalga oshiradi",
    terms: "Shartlar",
    privacy: "Maxfiylik",
    themeToggle: "Mavzuni almashtirish",
    backShort: "Orqaga",

    currentSubscription: "Joriy obuna",
    paymentMethod: "To‘lov usuli",
    billingInfo: "To‘lov ma’lumotlari",
    invoiceHistory: "Hisob-fakturalar tarixi",

    perMonth: "oy",
    perMonths: (n: number) => `${n} oy`,
    autoRenew: "Karta orqali avtomatik uzaytirish",
    showDetails: "Batafsil ko‘rsatish",
    planAmount: "Tarif narxi",
    subscriptionSince: "Boshlangan",
    currentPeriod: "To‘langan davr",
    nextBilling: "Keyingi to‘lov",
    cancelScheduled: (date: string) => `Obuna ${date} da bekor qilinadi`,
    pendingPlanChange: (plan: string, date: string) =>
      `«${plan}» tarifiga o‘tish rejalashtirilgan — ${date}`,

    changePlan: "Tarifni o‘zgartirish",
    changePlanTo: "Yangi tarif",
    whenApply: "Qachon qo‘llanilsin",
    applyPeriodEnd: "Joriy davr oxirida",
    applyNow: "Hozir",
    confirmChange: "O‘zgartirishni tasdiqlash",
    cancelSub: "Obunani bekor qilish",
    cancelHint: "Kirish to‘langan davr oxirigacha saqlanadi.",
    cancelConfirm: "Ha, davr oxirida bekor qilish",
    cancellationScheduled: "Bekor qilish rejalashtirilgan",

    addCard: "To‘lov usulini qo‘shish",
    updateCard: "To‘lov usulini o‘zgartirish",
    defaultBadge: "Asosiy",
    expires: "Amal qilish muddati",
    noPaymentMethods: "Hozircha to‘lov usuli qo‘shilmagan.",

    email: "Elektron pochta",
    phone: "Telefon",

    colDate: "Sana",
    colPlan: "Tarif",
    colAmount: "Summa",
    colStatus: "Holat",
    noInvoices: "Hozircha hisob-fakturalar yo‘q.",
    noSubscriptions: "Sizda faol obuna yo‘q.",

    sessionUnavailableTitle: "Sessiya mavjud emas",
    sessionUnavailableBody:
      "Bu havolaning muddati tugagan yoki u yaroqsiz. Ilovadan to‘lovni boshqarishni qayta oching.",
  },
  en: {
    pageTitle: "Manage subscription",
    trust: (brand: string) =>
      `${brand} partners with Krafta Pay for billing and subscription management.`,
    backTo: (brand: string) => `Back to ${brand}`,
    processedBy: "Payments processed by Krafta Pay",
    terms: "Terms",
    privacy: "Privacy",
    themeToggle: "Toggle theme",
    backShort: "Back",

    currentSubscription: "Current subscription",
    paymentMethod: "Payment method",
    billingInfo: "Billing information",
    invoiceHistory: "Invoice history",

    perMonth: "mo",
    perMonths: (n: number) => `${n} mo`,
    autoRenew: "Renews automatically on your card",
    showDetails: "Show details",
    planAmount: "Plan amount",
    subscriptionSince: "Started",
    currentPeriod: "Current period",
    nextBilling: "Next billing date",
    cancelScheduled: (date: string) => `Subscription will cancel on ${date}`,
    pendingPlanChange: (plan: string, date: string) =>
      `Plan change to “${plan}” scheduled — ${date}`,

    changePlan: "Change plan",
    changePlanTo: "New plan",
    whenApply: "When to apply",
    applyPeriodEnd: "At the end of the current period",
    applyNow: "Immediately",
    confirmChange: "Confirm change",
    cancelSub: "Cancel subscription",
    cancelHint: "You keep access until the end of the paid period.",
    cancelConfirm: "Yes, cancel at period end",
    cancellationScheduled: "Cancellation scheduled",

    addCard: "Add payment method",
    updateCard: "Update payment method",
    defaultBadge: "Default",
    expires: "Expires",
    noPaymentMethods: "No payment method added yet.",

    email: "Email",
    phone: "Phone",

    colDate: "Date",
    colPlan: "Plan",
    colAmount: "Amount",
    colStatus: "Status",
    noInvoices: "No invoices yet.",
    noSubscriptions: "You have no active subscriptions.",

    sessionUnavailableTitle: "Session unavailable",
    sessionUnavailableBody:
      "This portal link has expired or is invalid. Open billing management again from the app.",
  },
} as const;
