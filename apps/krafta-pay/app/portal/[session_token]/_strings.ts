// Localized copy for the hosted customer portal. Russian is the default (the
// primary audience is Uzbek merchants); English is the fallback. Uzbek can be
// added as a third entry when the portal session starts carrying a UZ locale.
//
// The locale is resolved from the portal session metadata (`locale`) or a
// `?lang=` query param, defaulting to `ru`.

export type PortalLocale = "ru" | "en";

export function resolvePortalLocale(input?: string | null): PortalLocale {
  const value = String(input ?? "").toLowerCase();
  if (value.startsWith("en")) return "en";
  return "ru";
}

export function getPortalStrings(locale: PortalLocale) {
  return STRINGS[locale];
}

export function localeTag(locale: PortalLocale): string {
  return locale === "en" ? "en-GB" : "ru-RU";
}

type StatusTone = "success" | "warning" | "destructive" | "muted";

const SUB_STATUS: Record<string, { ru: string; en: string; tone: StatusTone }> = {
  active: { ru: "Активна", en: "Active", tone: "success" },
  trialing: { ru: "Пробный период", en: "Trial", tone: "success" },
  past_due: { ru: "Просрочена", en: "Past due", tone: "warning" },
  unpaid: { ru: "Не оплачена", en: "Unpaid", tone: "warning" },
  incomplete: { ru: "Не завершена", en: "Incomplete", tone: "warning" },
  paused: { ru: "Приостановлена", en: "Paused", tone: "muted" },
  canceled: { ru: "Отменена", en: "Canceled", tone: "muted" },
  cancelled: { ru: "Отменена", en: "Canceled", tone: "muted" },
};

const INVOICE_STATUS: Record<string, { ru: string; en: string; tone: StatusTone }> = {
  paid: { ru: "Оплачено", en: "Paid", tone: "success" },
  succeeded: { ru: "Оплачено", en: "Paid", tone: "success" },
  open: { ru: "Ожидает оплаты", en: "Open", tone: "warning" },
  processing: { ru: "В обработке", en: "Processing", tone: "warning" },
  draft: { ru: "Черновик", en: "Draft", tone: "muted" },
  void: { ru: "Аннулирован", en: "Void", tone: "muted" },
  uncollectible: { ru: "Не оплачен", en: "Uncollectible", tone: "destructive" },
  failed: { ru: "Ошибка", en: "Failed", tone: "destructive" },
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
  en: {
    pageTitle: "Manage subscription",
    trust: (brand: string) =>
      `${brand} partners with Krafta Pay for billing and subscription management.`,
    backTo: (brand: string) => `Back to ${brand}`,
    processedBy: "Payments processed by Krafta Pay",
    terms: "Terms",
    privacy: "Privacy",
    themeToggle: "Toggle theme",

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
