/**
 * catalog.ts — the Krafta Pay merchant UI copy, in three languages.
 *
 * English is the canonical column: it is the source the other two were written
 * against, and the fallback when a key is missing. Russian is what most
 * merchants will actually read.
 *
 * The Russian and Uzbek are written natively, not translated word-for-word from
 * the English. "Recovered revenue" is not «Восстановленный доход» — a merchant
 * does not think of it as revenue being restored, they think of it as money
 * that was going to be lost and came back. Uzbek uses the modern Latin script
 * with the correct oʻ/gʻ glyphs.
 *
 * Financial and legal terms stay in the form Uzbek merchants actually use:
 * ИНН and ПИНФЛ are Cyrillic in all three languages because that is how they
 * appear on the documents merchants are copying from.
 */

import type { PayLocale } from "./locale";

const EN = {
  // ── chrome ──────────────────────────────────────────────────────────────
  "nav.overview": "Overview",
  "nav.group.payments": "Payments",
  "nav.group.developers": "Developers",
  "nav.providers": "Providers",
  "nav.plans": "Plans",
  "nav.subscriptions": "Subscriptions",
  "nav.taxCodes": "Tax codes",
  "nav.apiKeys": "API keys",
  "nav.webhooks": "Webhooks",
  "nav.logs": "Logs",
  "nav.docs": "Docs",
  "nav.signOut": "Sign out",
  "nav.openMenu": "Open menu",
  "nav.closeMenu": "Close menu",
  "nav.switchOrg": "Switch organization",
  "nav.language": "Language",
  "env.test": "Test mode",
  "env.live": "Live",

  // ── overview + metrics ──────────────────────────────────────────────────
  "overview.title": "Overview",
  "overview.subtitle": "Create a payment link or finish setting up {name}.",
  "metrics.window": "Last {days} days",
  "metrics.allSubscriptions": "All subscriptions",
  "metrics.recovered.title": "Recovered revenue",
  "metrics.recovered.description":
    "Collected on charges that failed the first time and would otherwise have been lost.",
  "metrics.recovered.summary": "{recovered} of {total} failed charges recovered",
  "metrics.recovered.rate": "{rate}% recovery rate",
  "metrics.recovered.none": "No failed charges in this window.",
  "metrics.mrr": "MRR",
  "metrics.mrr.hint": "Active subscriptions, normalized to monthly.",
  "metrics.activeSubscribers": "Active subscribers",
  "metrics.activeSubscribers.pastDue": "{count} past due",
  "metrics.activeSubscribers.nonePastDue": "None past due.",
  "metrics.churn": "Churn",
  "metrics.churn.hint": "Canceled in the last {days} days.",

  // ── setup steps ─────────────────────────────────────────────────────────
  "setup.connectProvider.title": "Connect a provider",
  "setup.connectProvider.description": "Add Atmos to accept cards inline.",
  "setup.createPlan.title": "Create a plan",
  "setup.createPlan.description": "Define subscription pricing.",
  "setup.apiKeys.title": "Get API keys",
  "setup.apiKeys.description": "Call the Checkout API from your app.",

  // ── payment link ────────────────────────────────────────────────────────
  "paymentLink.title": "Create a payment link",
  "paymentLink.subtitle": "Generate a hosted checkout URL the customer pays on Krafta Pay.",
  "paymentLink.what": "create a payment link",
  "paymentLink.amount": "Amount",
  "paymentLink.description": "Description",
  "paymentLink.descriptionPlaceholder": "What is this charge for?",
  "paymentLink.submit": "Create link",
  "paymentLink.created.title": "Payment link created",
  "paymentLink.created.description": "Share this URL with the customer to collect payment.",

  // ── page headers ────────────────────────────────────────────────────────
  "page.providers.title": "Providers",
  "page.providers.subtitle": "Connect the acquirer that will actually charge your customers.",
  "page.plans.title": "Plans",
  "page.plans.subtitle": "What you charge, how often, and in which currency.",
  "page.taxCodes.title": "Tax codes",
  "page.taxCodes.subtitle": "SPIC and package codes used to issue fiscal receipts.",
  "page.apiKeys.title": "API keys",
  "page.apiKeys.subtitle": "Test and live keys for the merchant API. Both work at once.",
  "page.webhooks.title": "Webhooks",
  "page.webhooks.subtitle":
    "Krafta Pay tells your app when a subscription renews, fails, or recovers — so you can grant or revoke access without polling.",
  "page.logs.title": "Logs",
  "page.logs.subtitle":
    "Inspect checkout, webhook, callback, and provider logs for payment debugging.",

  // ── onboarding: common ──────────────────────────────────────────────────
  "onboarding.progress": "Setup progress",
  "onboarding.back": "Back",
  "onboarding.continue": "Continue",
  "onboarding.skip": "Skip",

  // ── onboarding: business type ───────────────────────────────────────────
  "onboarding.type.title": "What kind of business is this?",
  "onboarding.type.subtitle": "So we can set up the right defaults.",
  "onboarding.type.telegram": "Telegram bot or paid channel",
  "onboarding.type.telegram.description": "Subscriptions for channel access or a bot service",
  "onboarding.type.edtech": "Online school or courses",
  "onboarding.type.edtech.description": "Monthly course access, cohort renewals",
  "onboarding.type.saas": "SaaS or IT product",
  "onboarding.type.saas.description": "Recurring plans for a web or mobile product",
  "onboarding.type.fitness": "Gym, club or coworking",
  "onboarding.type.fitness.description": "Memberships billed every month",
  "onboarding.type.media": "Media or content",
  "onboarding.type.media.description": "Paywalls, premium tiers, supporter plans",
  "onboarding.type.services": "Agency or professional services",
  "onboarding.type.services.description": "Retainers and recurring client billing",
  "onboarding.type.other": "Something else",
  "onboarding.type.other.description": "Tell us later — this only tailors your setup",

  // ── onboarding: company ─────────────────────────────────────────────────
  "onboarding.company.title": "Your business details",
  "onboarding.company.subtitle": "This is what your customers see on the payment page.",
  "onboarding.company.name": "Company name",
  "onboarding.company.namePlaceholder": "Aladeen Coffee",
  "onboarding.company.legalForm": "Legal form",
  "onboarding.legalForm.legal_entity": "Legal entity",
  "onboarding.legalForm.legal_entity.description": "ООО, АО — a registered company",
  "onboarding.legalForm.individual_entrepreneur": "Individual entrepreneur",
  "onboarding.legalForm.individual_entrepreneur.description": "ИП — registered in your own name",
  "onboarding.legalForm.self_employed": "Self-employed",
  "onboarding.legalForm.self_employed.description": "Самозанятый — identified by ПИНФЛ",
  "onboarding.company.taxHint": "{digits} digits. Needed to issue fiscal receipts for your charges.",
  "onboarding.company.taxRequired": "Enter your {label}.",
  "onboarding.company.taxLength": "{label} is {expected} digits. You entered {actual}.",

  // ── onboarding: billing model ───────────────────────────────────────────
  "onboarding.billing.title": "What will you charge for?",
  "onboarding.billing.subtitle": "You can do both later — this just sets your starting point.",
  "onboarding.billing.subscriptions": "Recurring subscriptions",
  "onboarding.billing.subscriptions.description": "Charge the same customer every month",
  "onboarding.billing.one_off": "One-off payments",
  "onboarding.billing.one_off.description": "Send a payment link, get paid once",
  "onboarding.billing.both": "Both",
  "onboarding.billing.both.description": "Subscriptions plus the occasional one-off charge",

  // ── onboarding: contact ─────────────────────────────────────────────────
  "onboarding.contact.title": "How do we reach you?",
  "onboarding.contact.subtitle": "For anything urgent about your payouts or a failing charge.",
  "onboarding.contact.phone": "Phone",
  "onboarding.contact.telegram": "Telegram",
  "onboarding.contact.telegramHint": "Username or number. Usually the fastest way to reach you.",

  // ── onboarding: provider ────────────────────────────────────────────────
  "onboarding.provider.title": "Do you have a payment provider yet?",
  "onboarding.provider.subtitle":
    "You bring your own merchant account — the money settles directly to you.",
  "onboarding.provider.atmos": "Yes — Atmos",
  "onboarding.provider.atmos.description": "Cards are collected on your checkout page, no redirect",
  "onboarding.provider.uzum": "Yes — Uzum",
  "onboarding.provider.uzum.description": "Customers attach a card on Uzum, then we charge it",
  "onboarding.provider.both": "Yes — both",
  "onboarding.provider.both.description": "You can offer either at checkout",
  "onboarding.provider.none": "Not yet",
  "onboarding.provider.none.description": "We'll show you how to get one",

  // ── onboarding: done ────────────────────────────────────────────────────
  "onboarding.done.title": "{name} is set up",
  "onboarding.done.hasProvider":
    "One thing left — add your provider credentials and you can take your first payment.",
  "onboarding.done.connectProvider": "Connect your provider",
  "onboarding.done.skipForNow": "Skip for now",
  "onboarding.done.noProvider":
    "You'll need a merchant account with a payment provider before you can charge anyone. Krafta Pay runs the billing; the money settles straight into your own account.",
  "onboarding.done.atmosTitle": "Getting an Atmos account",
  "onboarding.done.atmosBody":
    "Atmos is the fastest to start with — cards are collected on your checkout page with no redirect. Apply with your {label} and company details, then paste the keys they give you into Providers.",
  "onboarding.done.goToDashboard": "Go to the dashboard",
  "onboarding.welcome.title": "Welcome to Krafta Pay",
  "onboarding.welcome.subtitle": "A few questions, then you can connect a provider and start billing.",

  // ── onboarding: errors ──────────────────────────────────────────────────
  "onboarding.error.exists": "You already have an account. Reload the page.",
  "onboarding.error.nameRequired": "Enter your company name.",
  "onboarding.error.taxInvalid": "That tax number doesn't look right. Check the digits and try again.",
  "onboarding.error.taxSchema":
    "Tax setup is missing on our side. Contact support — this is not something you can fix.",
  "onboarding.error.network": "Couldn't reach the server. Check your connection and try again.",
  "onboarding.error.generic": "Couldn't finish setup. Try again.",
} as const;

export type PayMessageKey = keyof typeof EN;

type Catalog = Record<PayMessageKey, string>;

const RU: Catalog = {
  "nav.overview": "Обзор",
  "nav.group.payments": "Платежи",
  "nav.group.developers": "Разработчикам",
  "nav.providers": "Провайдеры",
  "nav.plans": "Тарифы",
  "nav.subscriptions": "Подписки",
  "nav.taxCodes": "Налоговые коды",
  "nav.apiKeys": "API-ключи",
  "nav.webhooks": "Вебхуки",
  "nav.logs": "Логи",
  "nav.docs": "Документация",
  "nav.signOut": "Выйти",
  "nav.openMenu": "Открыть меню",
  "nav.closeMenu": "Закрыть меню",
  "nav.switchOrg": "Сменить организацию",
  "nav.language": "Язык",
  "env.test": "Тестовый режим",
  "env.live": "Рабочий режим",

  "overview.title": "Обзор",
  "overview.subtitle": "Создайте ссылку на оплату или завершите настройку «{name}».",
  "metrics.window": "За {days} дней",
  "metrics.allSubscriptions": "Все подписки",
  // Not «восстановленный доход» — merchants think of this as money that was
  // about to be lost and came back, not as revenue being restored.
  "metrics.recovered.title": "Спасённые платежи",
  "metrics.recovered.description":
    "Списано по платежам, которые сорвались с первого раза и иначе были бы потеряны.",
  "metrics.recovered.summary": "Спасено {recovered} из {total} сорвавшихся списаний",
  "metrics.recovered.rate": "{rate}% возврата",
  "metrics.recovered.none": "За этот период сорвавшихся списаний не было.",
  "metrics.mrr": "MRR",
  "metrics.mrr.hint": "Активные подписки в пересчёте на месяц.",
  "metrics.activeSubscribers": "Активные подписчики",
  "metrics.activeSubscribers.pastDue": "{count} с просрочкой",
  "metrics.activeSubscribers.nonePastDue": "Просрочек нет.",
  "metrics.churn": "Отток",
  "metrics.churn.hint": "Отменили за последние {days} дней.",

  "setup.connectProvider.title": "Подключить провайдера",
  "setup.connectProvider.description": "Добавьте Atmos, чтобы принимать карты прямо на странице.",
  "setup.createPlan.title": "Создать тариф",
  "setup.createPlan.description": "Задайте стоимость подписки.",
  "setup.apiKeys.title": "Получить API-ключи",
  "setup.apiKeys.description": "Вызывайте Checkout API из своего приложения.",

  "paymentLink.title": "Создать ссылку на оплату",
  "paymentLink.subtitle": "Сгенерируйте страницу оплаты — клиент платит на Krafta Pay.",
  "paymentLink.what": "создать ссылку на оплату",
  "paymentLink.amount": "Сумма",
  "paymentLink.description": "Описание",
  "paymentLink.descriptionPlaceholder": "За что это списание?",
  "paymentLink.submit": "Создать ссылку",
  "paymentLink.created.title": "Ссылка создана",
  "paymentLink.created.description": "Отправьте её клиенту, чтобы получить оплату.",

  "page.providers.title": "Провайдеры",
  "page.providers.subtitle": "Подключите эквайринг, который будет списывать деньги с ваших клиентов.",
  "page.plans.title": "Тарифы",
  "page.plans.subtitle": "Сколько вы берёте, как часто и в какой валюте.",
  "page.taxCodes.title": "Налоговые коды",
  "page.taxCodes.subtitle": "ИКПУ и коды упаковки для фискальных чеков.",
  "page.apiKeys.title": "API-ключи",
  "page.apiKeys.subtitle": "Тестовые и рабочие ключи. Работают одновременно.",
  "page.webhooks.title": "Вебхуки",
  "page.webhooks.subtitle":
    "Krafta Pay сообщает вашему приложению, когда подписка продлилась, сорвалась или восстановилась — чтобы выдавать и отзывать доступ без опроса API.",
  "page.logs.title": "Логи",
  "page.logs.subtitle":
    "Смотрите логи оплаты, вебхуков, колбэков и провайдера, чтобы разобраться в проблеме.",

  "onboarding.progress": "Прогресс настройки",
  "onboarding.back": "Назад",
  "onboarding.continue": "Продолжить",
  "onboarding.skip": "Пропустить",

  "onboarding.type.title": "Чем вы занимаетесь?",
  "onboarding.type.subtitle": "Чтобы сразу настроить всё под вас.",
  "onboarding.type.telegram": "Telegram-бот или платный канал",
  "onboarding.type.telegram.description": "Подписка на доступ к каналу или сервису бота",
  "onboarding.type.edtech": "Онлайн-школа или курсы",
  "onboarding.type.edtech.description": "Ежемесячный доступ к курсу, продление потоков",
  "onboarding.type.saas": "SaaS или IT-продукт",
  "onboarding.type.saas.description": "Регулярные тарифы для веб- или мобильного продукта",
  "onboarding.type.fitness": "Зал, клуб или коворкинг",
  "onboarding.type.fitness.description": "Абонементы со списанием раз в месяц",
  "onboarding.type.media": "Медиа или контент",
  "onboarding.type.media.description": "Пейволы, премиум-тарифы, поддержка от читателей",
  "onboarding.type.services": "Агентство или услуги",
  "onboarding.type.services.description": "Абонентское обслуживание и регулярные счета клиентам",
  "onboarding.type.other": "Что-то другое",
  "onboarding.type.other.description": "Расскажете позже — это влияет только на настройки",

  "onboarding.company.title": "Данные бизнеса",
  "onboarding.company.subtitle": "Это увидят ваши клиенты на странице оплаты.",
  "onboarding.company.name": "Название компании",
  "onboarding.company.namePlaceholder": "Aladeen Coffee",
  "onboarding.company.legalForm": "Форма собственности",
  "onboarding.legalForm.legal_entity": "Юридическое лицо",
  "onboarding.legalForm.legal_entity.description": "ООО, АО — зарегистрированная компания",
  "onboarding.legalForm.individual_entrepreneur": "Индивидуальный предприниматель",
  "onboarding.legalForm.individual_entrepreneur.description": "ИП — оформлен на вас лично",
  "onboarding.legalForm.self_employed": "Самозанятый",
  "onboarding.legalForm.self_employed.description": "Идентификация по ПИНФЛ",
  "onboarding.company.taxHint": "{digits} цифр. Нужен для фискальных чеков по вашим списаниям.",
  "onboarding.company.taxRequired": "Укажите {label}.",
  "onboarding.company.taxLength": "В {label} должно быть {expected} цифр. Вы ввели {actual}.",

  "onboarding.billing.title": "За что будете брать деньги?",
  "onboarding.billing.subtitle": "Позже можно и то и другое — сейчас это просто точка старта.",
  "onboarding.billing.subscriptions": "Регулярные подписки",
  "onboarding.billing.subscriptions.description": "Списываете с одного клиента каждый месяц",
  "onboarding.billing.one_off": "Разовые платежи",
  "onboarding.billing.one_off.description": "Отправили ссылку — получили оплату один раз",
  "onboarding.billing.both": "И то и другое",
  "onboarding.billing.both.description": "Подписки плюс разовые списания",

  "onboarding.contact.title": "Как с вами связаться?",
  "onboarding.contact.subtitle": "На случай срочного — по выплатам или сорвавшемуся списанию.",
  "onboarding.contact.phone": "Телефон",
  "onboarding.contact.telegram": "Telegram",
  "onboarding.contact.telegramHint": "Юзернейм или номер. Обычно так до вас быстрее всего дозвониться.",

  "onboarding.provider.title": "У вас уже есть платёжный провайдер?",
  "onboarding.provider.subtitle":
    "Эквайринг ваш собственный — деньги приходят напрямую вам.",
  "onboarding.provider.atmos": "Да — Atmos",
  "onboarding.provider.atmos.description": "Карту вводят прямо на вашей странице, без редиректа",
  "onboarding.provider.uzum": "Да — Uzum",
  "onboarding.provider.uzum.description": "Клиент привязывает карту в Uzum, дальше списываем мы",
  "onboarding.provider.both": "Да — оба",
  "onboarding.provider.both.description": "На оплате можно предложить любой",
  "onboarding.provider.none": "Пока нет",
  "onboarding.provider.none.description": "Покажем, как его получить",

  "onboarding.done.title": "«{name}» настроена",
  "onboarding.done.hasProvider":
    "Остался один шаг — добавьте ключи провайдера, и можно принимать первый платёж.",
  "onboarding.done.connectProvider": "Подключить провайдера",
  "onboarding.done.skipForNow": "Позже",
  "onboarding.done.noProvider":
    "Чтобы списывать деньги, нужен договор с платёжным провайдером. Krafta Pay ведёт биллинг, а деньги приходят сразу на ваш счёт.",
  "onboarding.done.atmosTitle": "Как получить Atmos",
  "onboarding.done.atmosBody":
    "С Atmos проще всего начать — карту вводят прямо на вашей странице, без редиректа. Подайте заявку с {label} и данными компании, потом вставьте выданные ключи в раздел «Провайдеры».",
  "onboarding.done.goToDashboard": "Перейти в панель",
  "onboarding.welcome.title": "Добро пожаловать в Krafta Pay",
  "onboarding.welcome.subtitle":
    "Несколько вопросов — и можно подключать провайдера и выставлять счета.",

  "onboarding.error.exists": "У вас уже есть аккаунт. Обновите страницу.",
  "onboarding.error.nameRequired": "Укажите название компании.",
  "onboarding.error.taxInvalid": "Номер выглядит неверно. Проверьте цифры и попробуйте снова.",
  "onboarding.error.taxSchema":
    "На нашей стороне не настроены налоговые данные. Напишите в поддержку — сами вы это не почините.",
  "onboarding.error.network": "Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.",
  "onboarding.error.generic": "Не удалось завершить настройку. Попробуйте снова.",
};

const UZ: Catalog = {
  "nav.overview": "Umumiy ko‘rinish",
  "nav.group.payments": "To‘lovlar",
  "nav.group.developers": "Dasturchilarga",
  "nav.providers": "Provayderlar",
  "nav.plans": "Tariflar",
  "nav.subscriptions": "Obunalar",
  "nav.taxCodes": "Soliq kodlari",
  "nav.apiKeys": "API kalitlar",
  "nav.webhooks": "Vebxuklar",
  "nav.logs": "Loglar",
  "nav.docs": "Hujjatlar",
  "nav.signOut": "Chiqish",
  "nav.openMenu": "Menyuni ochish",
  "nav.closeMenu": "Menyuni yopish",
  "nav.switchOrg": "Tashkilotni almashtirish",
  "nav.language": "Til",
  "env.test": "Sinov rejimi",
  "env.live": "Ishchi rejim",

  "overview.title": "Umumiy ko‘rinish",
  "overview.subtitle": "To‘lov havolasini yarating yoki «{name}» sozlamalarini yakunlang.",
  "metrics.window": "So‘nggi {days} kun",
  "metrics.allSubscriptions": "Barcha obunalar",
  "metrics.recovered.title": "Qaytarilgan to‘lovlar",
  "metrics.recovered.description":
    "Birinchi urinishda o‘tmagan va aks holda yo‘qoladigan to‘lovlardan yig‘ilgan summa.",
  "metrics.recovered.summary": "{total} ta uzilgan to‘lovdan {recovered} tasi qaytarildi",
  "metrics.recovered.rate": "{rate}% qaytarish",
  "metrics.recovered.none": "Bu davrda uzilgan to‘lov bo‘lmagan.",
  "metrics.mrr": "MRR",
  "metrics.mrr.hint": "Faol obunalar oylik hisobda.",
  "metrics.activeSubscribers": "Faol obunachilar",
  "metrics.activeSubscribers.pastDue": "{count} ta muddati o‘tgan",
  "metrics.activeSubscribers.nonePastDue": "Muddati o‘tganlar yo‘q.",
  "metrics.churn": "Chiqib ketish",
  "metrics.churn.hint": "So‘nggi {days} kunda bekor qilinganlar.",

  "setup.connectProvider.title": "Provayderni ulash",
  "setup.connectProvider.description": "Kartalarni sahifada qabul qilish uchun Atmosni qo‘shing.",
  "setup.createPlan.title": "Tarif yaratish",
  "setup.createPlan.description": "Obuna narxini belgilang.",
  "setup.apiKeys.title": "API kalitlarni olish",
  "setup.apiKeys.description": "Checkout API’ni o‘z ilovangizdan chaqiring.",

  "paymentLink.title": "To‘lov havolasini yaratish",
  "paymentLink.subtitle": "To‘lov sahifasini yarating — mijoz Krafta Pay’da to‘laydi.",
  "paymentLink.what": "to‘lov havolasini yaratish",
  "paymentLink.amount": "Summa",
  "paymentLink.description": "Tavsif",
  "paymentLink.descriptionPlaceholder": "Bu to‘lov nima uchun?",
  "paymentLink.submit": "Havola yaratish",
  "paymentLink.created.title": "Havola yaratildi",
  "paymentLink.created.description": "Uni mijozga yuboring va to‘lovni oling.",

  "page.providers.title": "Provayderlar",
  "page.providers.subtitle": "Mijozlaringizdan pul yechadigan ekvayringni ulang.",
  "page.plans.title": "Tariflar",
  "page.plans.subtitle": "Qancha, qanchalik tez-tez va qaysi valyutada olasiz.",
  "page.taxCodes.title": "Soliq kodlari",
  "page.taxCodes.subtitle": "Fiskal cheklar uchun IKPU va qadoq kodlari.",
  "page.apiKeys.title": "API kalitlar",
  "page.apiKeys.subtitle": "Sinov va ishchi kalitlar. Ikkalasi bir vaqtda ishlaydi.",
  "page.webhooks.title": "Vebxuklar",
  "page.webhooks.subtitle":
    "Obuna uzaytirilganda, uzilganda yoki tiklanganda Krafta Pay ilovangizga xabar beradi — API’ni so‘rab turmasdan ruxsat berish yoki olib qo‘yish uchun.",
  "page.logs.title": "Loglar",
  "page.logs.subtitle":
    "Muammoni tushunish uchun to‘lov, vebxuk, qaytish va provayder loglarini ko‘ring.",

  "onboarding.progress": "Sozlash jarayoni",
  "onboarding.back": "Orqaga",
  "onboarding.continue": "Davom etish",
  "onboarding.skip": "O‘tkazib yuborish",

  "onboarding.type.title": "Nima bilan shug‘ullanasiz?",
  "onboarding.type.subtitle": "Sozlamalarni sizga moslab qo‘yamiz.",
  "onboarding.type.telegram": "Telegram bot yoki pullik kanal",
  "onboarding.type.telegram.description": "Kanalga yoki bot xizmatiga obuna",
  "onboarding.type.edtech": "Onlayn maktab yoki kurslar",
  "onboarding.type.edtech.description": "Kursga oylik ruxsat, oqimlarni uzaytirish",
  "onboarding.type.saas": "SaaS yoki IT mahsulot",
  "onboarding.type.saas.description": "Veb yoki mobil mahsulot uchun muntazam tariflar",
  "onboarding.type.fitness": "Zal, klub yoki kovorking",
  "onboarding.type.fitness.description": "Oyiga bir marta yechiladigan abonementlar",
  "onboarding.type.media": "Media yoki kontent",
  "onboarding.type.media.description": "Peyvollar, premium tariflar, o‘quvchilar ko‘magi",
  "onboarding.type.services": "Agentlik yoki xizmatlar",
  "onboarding.type.services.description": "Abonent xizmati va mijozlarga muntazam hisoblar",
  "onboarding.type.other": "Boshqa narsa",
  "onboarding.type.other.description": "Keyin aytasiz — bu faqat sozlamalarga ta’sir qiladi",

  "onboarding.company.title": "Biznes ma’lumotlari",
  "onboarding.company.subtitle": "Buni mijozlaringiz to‘lov sahifasida ko‘radi.",
  "onboarding.company.name": "Kompaniya nomi",
  "onboarding.company.namePlaceholder": "Aladeen Coffee",
  "onboarding.company.legalForm": "Tashkiliy-huquqiy shakl",
  "onboarding.legalForm.legal_entity": "Yuridik shaxs",
  "onboarding.legalForm.legal_entity.description": "MChJ, AJ — ro‘yxatdan o‘tgan kompaniya",
  "onboarding.legalForm.individual_entrepreneur": "Yakka tartibdagi tadbirkor",
  "onboarding.legalForm.individual_entrepreneur.description": "YTT — o‘zingizga rasmiylashtirilgan",
  "onboarding.legalForm.self_employed": "O‘zini o‘zi band qilgan",
  "onboarding.legalForm.self_employed.description": "ПИНФЛ bo‘yicha aniqlanadi",
  "onboarding.company.taxHint": "{digits} ta raqam. To‘lovlaringiz bo‘yicha fiskal chek uchun kerak.",
  "onboarding.company.taxRequired": "{label} ni kiriting.",
  "onboarding.company.taxLength": "{label} da {expected} ta raqam bo‘lishi kerak. Siz {actual} ta kiritdingiz.",

  "onboarding.billing.title": "Nima uchun pul olasiz?",
  "onboarding.billing.subtitle": "Keyin ikkalasi ham bo‘ladi — hozir bu shunchaki boshlanish nuqtasi.",
  "onboarding.billing.subscriptions": "Muntazam obunalar",
  "onboarding.billing.subscriptions.description": "Bir mijozdan har oy yechasiz",
  "onboarding.billing.one_off": "Bir martalik to‘lovlar",
  "onboarding.billing.one_off.description": "Havola yubordingiz — bir marta to‘lov oldingiz",
  "onboarding.billing.both": "Ikkalasi ham",
  "onboarding.billing.both.description": "Obunalar va vaqti-vaqti bilan bir martalik to‘lovlar",

  "onboarding.contact.title": "Siz bilan qanday bog‘lanamiz?",
  "onboarding.contact.subtitle": "To‘lovlar yoki uzilgan yechim bo‘yicha shoshilinch holat uchun.",
  "onboarding.contact.phone": "Telefon",
  "onboarding.contact.telegram": "Telegram",
  "onboarding.contact.telegramHint": "Username yoki raqam. Odatda siz bilan eng tez shu orqali bog‘lanamiz.",

  "onboarding.provider.title": "To‘lov provayderingiz bormi?",
  "onboarding.provider.subtitle": "Ekvayring o‘zingizniki — pul to‘g‘ridan-to‘g‘ri sizga tushadi.",
  "onboarding.provider.atmos": "Ha — Atmos",
  "onboarding.provider.atmos.description": "Karta to‘g‘ridan-to‘g‘ri sahifangizda kiritiladi",
  "onboarding.provider.uzum": "Ha — Uzum",
  "onboarding.provider.uzum.description": "Mijoz Uzumda kartani bog‘laydi, keyin biz yechamiz",
  "onboarding.provider.both": "Ha — ikkalasi",
  "onboarding.provider.both.description": "To‘lovda istalganini taklif qilasiz",
  "onboarding.provider.none": "Hozircha yo‘q",
  "onboarding.provider.none.description": "Qanday olishni ko‘rsatamiz",

  "onboarding.done.title": "«{name}» sozlandi",
  "onboarding.done.hasProvider":
    "Bir qadam qoldi — provayder kalitlarini qo‘shing va birinchi to‘lovni qabul qiling.",
  "onboarding.done.connectProvider": "Provayderni ulash",
  "onboarding.done.skipForNow": "Keyinroq",
  "onboarding.done.noProvider":
    "Pul yechish uchun to‘lov provayderi bilan shartnoma kerak. Krafta Pay billingni yuritadi, pul esa to‘g‘ridan-to‘g‘ri sizning hisobingizga tushadi.",
  "onboarding.done.atmosTitle": "Atmosni qanday olish mumkin",
  "onboarding.done.atmosBody":
    "Atmos bilan boshlash eng oson — karta to‘g‘ridan-to‘g‘ri sahifangizda kiritiladi. {label} va kompaniya ma’lumotlari bilan ariza bering, so‘ng berilgan kalitlarni «Provayderlar» bo‘limiga qo‘ying.",
  "onboarding.done.goToDashboard": "Panelga o‘tish",
  "onboarding.welcome.title": "Krafta Pay’ga xush kelibsiz",
  "onboarding.welcome.subtitle":
    "Bir nechta savol — so‘ng provayderni ulab, hisob chiqarishni boshlaysiz.",

  "onboarding.error.exists": "Sizda allaqachon hisob bor. Sahifani yangilang.",
  "onboarding.error.nameRequired": "Kompaniya nomini kiriting.",
  "onboarding.error.taxInvalid": "Raqam noto‘g‘ri ko‘rinadi. Tekshirib, qayta urinib ko‘ring.",
  "onboarding.error.taxSchema":
    "Bizning tomonda soliq ma’lumotlari sozlanmagan. Qo‘llab-quvvatlashga yozing — buni o‘zingiz tuzata olmaysiz.",
  "onboarding.error.network": "Serverga ulanib bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring.",
  "onboarding.error.generic": "Sozlashni yakunlab bo‘lmadi. Qayta urinib ko‘ring.",
};

export const PAY_MESSAGES: Record<PayLocale, Catalog> = {
  en: EN,
  ru: RU,
  "uz-Latn": UZ,
};
