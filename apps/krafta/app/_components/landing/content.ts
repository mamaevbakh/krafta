/**
 * content.ts — landing-page copy for the three product locales (RU primary,
 * UZ Latin, EN). Mirrors the storefront's `?lang=` convention: the page root
 * resolves the active locale from searchParams and renders against the matching
 * dictionary.
 *
 * Voice (locked after the Square/Stripe/Supabase/Vercel/ElevenLabs review, then
 * repositioned to the "Commerce OS" direction — Variant A / "The Counter OS",
 * then de-jargoned for the real ICP): RU-first, one Tashkent operator talking
 * to another — confident, direct, outcome-led, never translated. The real
 * buyer is a 30-50 y/o cafe/shop owner, not a SaaS buyer — so "infrastructure"
 * / "operating system" / "interface" / "integration" are banned from visible
 * copy (they don't parse as a benefit to this reader). Say the concrete thing
 * instead: not "infrastructure, not commission" but "we don't take 20% of
 * every order". Emphasis comes from typography (foreground vs muted two-tone)
 * and Geist Mono UPPERCASE micro-labels read as POS/receipt grammar — never a
 * color accent (DESIGN.md).
 *
 * Numbered mono eyebrows (`01 / …`) are the Variant A spec-sheet motif: the
 * scroll reads like the modules of one system.
 *
 * Shape is derived from the English object via `typeof`, so RU and UZ are
 * compile-time checked to carry exactly the same keys.
 */

export const LANDING_LOCALES = ["ru", "uz", "en"] as const;
export type LandingLocale = (typeof LANDING_LOCALES)[number];

/** Russian is primary — most existing Tashkent merchants operate in RU. */
export const DEFAULT_LANDING_LOCALE: LandingLocale = "ru";

export const LANDING_LOCALE_LABELS: Record<LandingLocale, string> = {
  ru: "Русский",
  uz: "Oʻzbekcha",
  en: "English",
};

export function isLandingLocale(value: unknown): value is LandingLocale {
  return (
    typeof value === "string" &&
    (LANDING_LOCALES as readonly string[]).includes(value)
  );
}

export function resolveLandingLocale(
  raw: string | string[] | undefined | null,
  fallback: LandingLocale = DEFAULT_LANDING_LOCALE,
): LandingLocale {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isLandingLocale(value) ? value : fallback;
}

/**
 * Post-Soviet / "CIS-region" countries — colloquial, not the strict current
 * CIS membership (includes UA, GE, which formally left, since the audience —
 * Russian-speaking Central Asia/Caucasus — still matches). Visitors here
 * default to RU unless their device explicitly says otherwise.
 */
const CIS_REGION_COUNTRIES = new Set([
  "RU", "UZ", "KZ", "KG", "TJ", "TM", "AZ", "AM", "BY", "MD", "UA", "GE",
]);

function primaryAcceptLanguage(header: string | null): string | null {
  const first = header?.split(",")[0]?.trim().split(";")[0]?.trim();
  return first ? (first.split("-")[0]?.toLowerCase() ?? null) : null;
}

/**
 * Picks the default locale for a first-time visitor with no `?lang=` in the
 * URL — device language wins when it's one we ship, otherwise we fall back to
 * geo: CIS-region IPs get RU (the primary market language), everyone else
 * (Europe, US, elsewhere) gets EN. Vercel sets `x-vercel-ip-country` at the
 * edge in production; it's absent locally, where we fall through to `accept-
 * language` and finally the RU default.
 */
export function resolveDefaultLandingLocale(headersList: {
  get(name: string): string | null;
}): LandingLocale {
  const deviceLang = primaryAcceptLanguage(headersList.get("accept-language"));
  if (isLandingLocale(deviceLang)) return deviceLang;

  const country = headersList.get("x-vercel-ip-country");
  if (country && CIS_REGION_COUNTRIES.has(country.toUpperCase())) {
    return "ru";
  }
  if (country) return "en";

  return DEFAULT_LANDING_LOCALE;
}

/**
 * We only take payment inside Uzbekistan today (cash; card rails are still
 * "soon"). A visitor from anywhere else structurally can't pay us, so the
 * pricing section shows their tier as free rather than gating a signup behind
 * a price we can't collect. No geo signal (local dev, or a header Vercel
 * didn't set) defaults to "domestic" so pricing never silently gives paid
 * tiers away for free.
 */
export function isUzbekistanVisitor(headersList: {
  get(name: string): string | null;
}): boolean {
  const country = headersList.get("x-vercel-ip-country");
  return !country || country.toUpperCase() === "UZ";
}

/** Locale-independent demo constants (numbers stay out of the copy tables). */
export const DEMO_ORDER_NUMBER = "#0042";
export const DEMO_DELIVERY_FEE = 15000;

const en = {
  nav: {
    features: "System",
    how: "Get started",
    channels: "Channels",
    pricing: "Pricing",
    faq: "FAQ",
  },
  actions: {
    createShop: "Create your shop",
    signIn: "Sign in",
    viewDemo: "Open demo",
    dashboard: "Open dashboard",
  },
  hero: {
    eyebrow: "Storefront · Orders · QR · Payments · AI",
    titleLead: "Your storefront. Your brand.",
    titlePayoff: "Your customers.",
    subtitle:
      "Sell direct — don't hand your customer and a cut to a marketplace. Menu, payments, and delivery in one link. Build it in an evening, no commission.",
    spec: ["Free to start", "No signup", "Any language"],
  },
  demo: {
    shopName: "Vintage Coffee",
    shopMeta: "Tashkent",
    menuLabel: "Menu",
    orderTitle: "New order",
    orderEmpty: "Tap an item — it lands here",
    totalLabel: "Total",
    addAria: "Add",
    deliveryFeeLabel: "Delivery",
    keepLine: "No commission · you keep it all",
    channels: [
      { key: "dinein", label: "Dine-in · QR", context: "Table 7" },
      { key: "pickup", label: "Pickup", context: "Ready by 18:30" },
      { key: "delivery", label: "Delivery", context: "Chilanzar, 12" },
    ],
    items: [
      { name: "Cappuccino", price: 22000 },
      { name: "Vanilla raf", price: 28000 },
      { name: "Cheesecake", price: 32000 },
      { name: "Tiramisu", price: 30000 },
    ],
  },
  proof: {
    statement:
      "Not a marketplace. Your storefront — your own brand, your own name.",
    ledger: [
      { label: "Cash now", soon: false },
      { label: "Card soon", soon: true },
      { label: "Yandex courier", soon: false },
      { label: "Orders in Telegram", soon: false },
      { label: "Menu in any language", soon: false },
    ],
  },
  problem: {
    eyebrow: "01 / Problem",
    heading: "Your business still runs on chaos",
    messages: [
      { channel: "telegram", label: "Telegram", text: "hey, are you open? want to order 2 lattes for pickup", time: "12:14" },
      { channel: "instagram", label: "Instagram", text: "do u guys deliver to Chilonzor today?", time: "12:19" },
      { channel: "call", label: "Missed call", text: "+998 90 · 0:00", time: "12:21" },
      { channel: "notebook", label: "Notebook", text: "Table 4 — plov ×2, no onion", time: "12:24" },
      { channel: "whatsapp", label: "WhatsApp", text: "can I change my order from before? forgot the drink", time: "12:31" },
    ],
    note: "The problem was never a missing website. It was a missing system.",
    contrast:
      "A marketplace takes your customer and a cut of every sale. Your storefront leaves you both.",
  },
  features: {
    eyebrow: "02 / One system",
    heading: "One system instead of ten apps",
    subheading:
      "Menu, orders, QR, delivery, and translations — in one place, at hand.",
    mockCaption: "Every order, one screen",
    items: [
      {
        title: "Menu & catalog",
        body: "Categories, photos, modifiers, variations, and prices in sum. Built for real menus and real products.",
      },
      {
        title: "Every order, one screen",
        body: "Dine-in, pickup, and delivery — every order shows up at once, nothing slips through.",
      },
      {
        title: "Delivery built in",
        body: "Zones, fees, and a Yandex courier called straight from the order.",
      },
      {
        title: "Translations in one click",
        body: "Your whole menu in any language — RU, UZ, EN and beyond. A guest from anywhere reads it in theirs.",
      },
      {
        title: "Run it from your phone",
        body: "Change the menu and take orders from anywhere.",
      },
      {
        title: "QR as a sales channel",
        body: "A QR at the table or for pickup opens the storefront and brings the order.",
      },
    ],
  },
  how: {
    eyebrow: "06 / Get started",
    heading: "Taking orders by tonight",
    subheading: "Three steps from spreadsheet to a system that takes orders.",
    steps: [
      {
        title: "Create your shop",
        body: "Pick a type and a name. A draft is ready instantly — no signup.",
      },
      {
        title: "Build your menu",
        body: "Add items, photos, and prices — translated into any language.",
      },
      {
        title: "Share your link",
        body: "Send the link or connect Telegram — and start taking orders.",
      },
    ],
  },
  channels: {
    eyebrow: "03 / Channels",
    heading: "One menu — guests reach it the way they already order",
    items: [
      {
        label: "Web catalog",
        body: "A fast storefront on your own link. No app to install.",
      },
      {
        label: "Telegram",
        body: "Your shop and order alerts run inside Telegram — where you already work.",
      },
      {
        label: "QR at the table",
        body: "A QR opens the menu and the order lands straight with you.",
      },
    ],
  },
  payments: {
    eyebrow: "04 / Payments",
    heading: "Every payment method, one place",
    soonLabel: "Soon",
    subheading: "Uzbekistan first, then everywhere else.",
    providers: ["Payme", "Click", "Uzum", "Stripe"],
    storefrontLabel: "Storefront",
    flowNote: "Whatever your guest pays with, it lands in your Krafta account.",
  },
  ai: {
    eyebrow: "05 / AI",
    soonLabel: "Soon",
    heading: "The next way to order is just talking",
    subheading: "Customers ask. Krafta builds the order.",
    searchPlaceholder: "Ask Vintage Coffee…",
    queriesLabel: "Guests ask",
    queries: [
      "Show me low-calorie dishes",
      "Anything without lactose?",
      "What do I usually order here?",
    ],
    suggestionMeta: "Suggested · 320 kcal",
    suggestionName: "Granola with coconut yogurt",
    suggestionPrice: 42000,
    personalNote:
      "Preferences, allergies, diet, order history — Krafta remembers for the guest and suggests what they'll order.",
  },
  dashboard: {
    eyebrow: "Your side",
    heading: "Everything under control — on one screen",
    subheading:
      "A guest orders in the storefront — it lands with you instantly. Dine-in, pickup, and delivery, totals and statuses, Telegram alerts. Nothing slips through.",
    ordersUrl: "krafta.org/orders",
    ordersAlt: "Krafta orders dashboard — the live queue",
    libraryUrl: "krafta.org/items",
    libraryAlt: "Krafta menu editor",
  },
  pricing: {
    eyebrow: "07 / Pricing",
    heading: "We don't take 20% of every order",
    subheading: "One flat price a month — no matter how much you sell.",
    internationalNote: "We don't bill outside Uzbekistan yet — free until we do.",
    free: {
      name: "Free",
      price: "0",
      period: "to start",
      features: [
        "Menu in any language",
        "Orders straight to Telegram",
        "Pickup & browsable catalog",
        "Run it from your phone",
      ],
      cta: "Create your shop",
    },
    pro: {
      name: "Pro",
      price: "250,000",
      period: "UZS / mo",
      priceUsd: "$20/mo",
      badge: "Popular",
      includes: "Everything in Free, plus",
      features: [
        "Dine-in — QR on tables → kitchen",
        "Delivery — zones, fees & Yandex courier",
        "Every order on one screen",
        "Basic analytics",
      ],
      cta: "Create your shop",
    },
    business: {
      name: "Business",
      price: "490,000",
      period: "UZS / mo",
      priceUsd: "$39/mo",
      includes: "Everything in Pro, plus",
      features: [
        "Krafta Pay — cards in person & online (soon)",
        "AI ordering assistant (soon)",
        "Multiple venues & team roles",
        "Advanced analytics & reporting",
        "Priority support",
      ],
      note: "Founding shops get Business features at the Pro price — locked.",
    },
  },
  faq: {
    eyebrow: "FAQ",
    heading: "Straight answers",
    items: [
      {
        q: "What is Krafta?",
        a: "Everything you need to sell without a marketplace: an online storefront, a QR menu, order management, and (soon) card payments — for cafes, restaurants, and shops in Uzbekistan. Build a menu, take orders from any channel, and run it all from your phone.",
      },
      {
        q: "Do my guests need to install an app?",
        a: "No. They order from a web link or inside Telegram. Nothing to download.",
      },
      {
        q: "Which languages are supported?",
        a: "Your menu can be translated into any language — so a guest from anywhere reads it in theirs. Krafta itself — the dashboard and storefront — works in Russian, Uzbek (Latin), and English.",
      },
      {
        q: "How do I take payment?",
        a: "Cash in person today. Card payments through Krafta Pay — in person and online — are coming, billed as a flat fee, never a percentage of your sales.",
      },
      {
        q: "Can I do delivery?",
        a: "Yes. Set delivery zones and fees, and call a Yandex courier directly from the order.",
      },
      {
        q: "How much does it cost?",
        a: "Free to start, no card required. Paid plans arrive as your shop grows — a flat monthly price, never a percentage of your sales.",
      },
    ],
  },
  closing: {
    headingLead: "Krafta starts as a storefront.",
    headingPayoff: "Then runs your whole shop.",
  },
  footer: {
    tagline: "Storefront, orders, and QR menu — no commission.",
    productHeading: "Product",
    accountHeading: "Account",
    rights: "All rights reserved.",
  },
};

export type LandingContent = typeof en;

const ru: LandingContent = {
  nav: {
    features: "Система",
    how: "Запуск",
    channels: "Каналы",
    pricing: "Цены",
    faq: "Вопросы",
  },
  actions: {
    createShop: "Создать магазин",
    signIn: "Войти",
    viewDemo: "Открыть демо",
    dashboard: "Открыть панель",
  },
  hero: {
    eyebrow: "Витрина · Заказы · QR · Оплата · AI",
    titleLead: "Своя витрина. Свой бренд.",
    titlePayoff: "Свои клиенты.",
    subtitle:
      "Продавайте напрямую — не отдавайте клиента и процент маркетплейсу. Меню, оплата и доставка в одной ссылке. Соберите за вечер, без комиссии.",
    spec: ["Бесплатный старт", "Без регистрации", "Любой язык"],
  },
  demo: {
    shopName: "Vintage Coffee",
    shopMeta: "Ташкент",
    menuLabel: "Меню",
    orderTitle: "Новый заказ",
    orderEmpty: "Нажмите на позицию — заказ появится здесь",
    totalLabel: "Итого",
    addAria: "Добавить",
    deliveryFeeLabel: "Доставка",
    keepLine: "Без комиссии · вся выручка ваша",
    channels: [
      { key: "dinein", label: "Зал · QR", context: "Стол 7" },
      { key: "pickup", label: "Самовывоз", context: "Готово к 18:30" },
      { key: "delivery", label: "Доставка", context: "Чиланзар, 12" },
    ],
    items: [
      { name: "Капучино", price: 22000 },
      { name: "Раф ванильный", price: 28000 },
      { name: "Чизкейк", price: 32000 },
      { name: "Тирамису", price: 30000 },
    ],
  },
  proof: {
    statement:
      "Не маркетплейс. Ваша витрина — со своим брендом и своим именем.",
    ledger: [
      { label: "Наличные — сейчас", soon: false },
      { label: "Карта — скоро", soon: true },
      { label: "Курьер Яндекс", soon: false },
      { label: "Заказы в Telegram", soon: false },
      { label: "Меню на любом языке", soon: false },
    ],
  },
  problem: {
    eyebrow: "01 / Проблема",
    heading: "Ваш бизнес всё ещё держится на хаосе",
    messages: [
      { channel: "telegram", label: "Telegram", text: "здравствуйте, а можно 2 капучино навынос?", time: "12:14" },
      { channel: "instagram", label: "Instagram", text: "а доставка в Чиланзар сегодня работает?", time: "12:19" },
      { channel: "call", label: "Пропущенный звонок", text: "+998 90 · 0:00", time: "12:21" },
      { channel: "notebook", label: "Блокнот", text: "Стол 4 — плов ×2, без лука", time: "12:24" },
      { channel: "whatsapp", label: "WhatsApp", text: "можно поменять заказ? забыла добавить напиток", time: "12:31" },
    ],
    note: "Дело не в отсутствии сайта. Дело в отсутствии системы.",
    contrast:
      "Маркетплейс заберёт клиента и процент с каждой продажи. Витрина оставляет и то, и другое вам.",
  },
  features: {
    eyebrow: "02 / Одна система",
    heading: "Одна система вместо десятка приложений",
    subheading:
      "Меню, заказы, QR, доставка и переводы — в одном месте, под рукой.",
    mockCaption: "Все заказы на одном экране",
    items: [
      {
        title: "Меню и каталог",
        body: "Категории, фото, модификаторы, варианты и цены в сумах. Под реальные меню и реальные товары.",
      },
      {
        title: "Все заказы на одном экране",
        body: "Зал, самовывоз и доставка — каждый заказ виден сразу, ничего не теряется.",
      },
      {
        title: "Доставка внутри",
        body: "Зоны, тарифы и вызов курьера Яндекс прямо из заказа.",
      },
      {
        title: "Переводы в один клик",
        body: "Весь каталог на любом языке — RU, UZ, EN и дальше. Гость из любой страны читает меню на своём.",
      },
      {
        title: "Управление с телефона",
        body: "Меняйте меню и принимайте заказы откуда угодно.",
      },
      {
        title: "QR как канал продаж",
        body: "QR на столе и на вынос открывает витрину и приносит заказ.",
      },
    ],
  },
  how: {
    eyebrow: "06 / Запуск",
    heading: "К вечеру вы уже принимаете заказы",
    subheading: "Три шага от таблицы до системы, которая принимает заказы.",
    steps: [
      {
        title: "Создайте магазин",
        body: "Выберите тип и название. Черновик готов сразу — без регистрации.",
      },
      {
        title: "Соберите меню",
        body: "Добавьте позиции, фото и цены — с переводом на любой язык.",
      },
      {
        title: "Поделитесь ссылкой",
        body: "Отправьте ссылку или подключите Telegram — и принимайте заказы.",
      },
    ],
  },
  channels: {
    eyebrow: "03 / Каналы",
    heading: "Одно меню — гость закажет там, где привык",
    items: [
      {
        label: "Веб-каталог",
        body: "Быстрая витрина на вашей ссылке. Без приложений.",
      },
      {
        label: "Telegram",
        body: "Магазин и уведомления о заказах — прямо в Telegram, где вы уже работаете.",
      },
      {
        label: "QR в зале",
        body: "QR на столе открывает меню — заказ сразу у вас.",
      },
    ],
  },
  payments: {
    eyebrow: "04 / Платежи",
    heading: "Любой способ оплаты — в одном месте",
    soonLabel: "Скоро",
    subheading: "Сначала — внутри Узбекистана, потом — весь мир.",
    providers: ["Payme", "Click", "Uzum", "Stripe"],
    storefrontLabel: "Витрина",
    flowNote: "Чем бы гость ни оплатил, деньги приходят в ваш аккаунт Krafta.",
  },
  ai: {
    eyebrow: "05 / AI",
    soonLabel: "Скоро",
    heading: "Следующий способ заказа — просто разговор",
    subheading: "Гость спрашивает — Krafta собирает заказ.",
    searchPlaceholder: "Спросите Vintage Coffee…",
    queriesLabel: "Гости спрашивают",
    queries: [
      "Покажи блюда без лактозы",
      "Что-нибудь лёгкое, до 400 ккал",
      "Что я обычно здесь беру?",
    ],
    suggestionMeta: "Подойдёт · 320 ккал",
    suggestionName: "Гранола с кокосовым йогуртом",
    suggestionPrice: 42000,
    personalNote:
      "Предпочтения, аллергии, диета, история заказов — Krafta помнит за гостя и подбирает то, что он закажет.",
  },
  dashboard: {
    eyebrow: "Ваша сторона",
    heading: "Всё под контролем — на одном экране",
    subheading:
      "Гость заказывает в витрине — заказ тут же у вас. Зал, самовывоз и доставка, суммы и статусы, уведомления в Telegram. Ничего не теряется.",
    ordersUrl: "krafta.org/orders",
    ordersAlt: "Панель заказов Krafta — живая очередь",
    libraryUrl: "krafta.org/items",
    libraryAlt: "Редактор меню Krafta",
  },
  pricing: {
    eyebrow: "07 / Цены",
    heading: "Мы не берём 20% с каждого заказа",
    subheading: "Фиксированная цена в месяц — сколько бы вы ни продавали.",
    internationalNote:
      "Мы пока не принимаем оплату за пределами Узбекистана — бесплатно, пока не начнём.",
    free: {
      name: "Бесплатно",
      price: "0",
      period: "для старта",
      features: [
        "Меню на любом языке",
        "Заказы сразу в Telegram",
        "Самовывоз и каталог для просмотра",
        "Управление с телефона",
      ],
      cta: "Создать магазин",
    },
    pro: {
      name: "Pro",
      price: "250,000",
      period: "сум / мес",
      priceUsd: "$20/мес",
      badge: "Популярный",
      includes: "Всё из Free, плюс",
      features: [
        "Зал — QR на столах → на кухню",
        "Доставка — зоны, тарифы и курьер Яндекса",
        "Все заказы на одном экране",
        "Базовая аналитика",
      ],
      cta: "Создать магазин",
    },
    business: {
      name: "Business",
      price: "490,000",
      period: "сум / мес",
      priceUsd: "$39/мес",
      includes: "Всё из Pro, плюс",
      features: [
        "Krafta Pay — оплата картой в зале и онлайн (скоро)",
        "AI-ассистент заказов (скоро)",
        "Несколько точек и роли команды",
        "Расширенная аналитика и отчёты",
        "Приоритетная поддержка",
      ],
      note: "Для первых заведений функции Business — по цене Pro, навсегда.",
    },
  },
  faq: {
    eyebrow: "Вопросы",
    heading: "Коротко о главном",
    items: [
      {
        q: "Что такое Krafta?",
        a: "Всё, что нужно, чтобы продавать напрямую, без маркетплейса: витрина, QR-меню, приём заказов и (скоро) оплата картой — для кафе, ресторанов и магазинов Узбекистана. Соберите меню, принимайте заказы по всем каналам и управляйте всем с телефона.",
      },
      {
        q: "Нужно ли гостям устанавливать приложение?",
        a: "Нет. Они заказывают по веб-ссылке или прямо в Telegram. Ничего скачивать не нужно.",
      },
      {
        q: "Какие языки поддерживаются?",
        a: "Меню можно перевести на любой язык — и гость из любой страны прочитает его на своём. Сама Krafta — панель и витрина — работает на русском, узбекском (латиница) и английском.",
      },
      {
        q: "Как принимать оплату?",
        a: "Сейчас — наличными в заведении. Приём карт через Krafta Pay — в зале и онлайн — уже скоро, с фиксированной платой, а не процентом с продаж.",
      },
      {
        q: "Можно ли делать доставку?",
        a: "Да. Задайте зоны и тарифы доставки и вызывайте курьера Яндекс прямо из заказа.",
      },
      {
        q: "Сколько это стоит?",
        a: "Бесплатно для старта, без карты. Платные тарифы появятся по мере роста — фиксированная плата в месяц, а не процент с продаж.",
      },
    ],
  },
  closing: {
    headingLead: "Krafta начинается с витрины.",
    headingPayoff: "Дальше — ведёт весь бизнес.",
  },
  footer: {
    tagline: "Витрина, заказы и QR-меню — без комиссии.",
    productHeading: "Продукт",
    accountHeading: "Аккаунт",
    rights: "Все права защищены.",
  },
};

const uz: LandingContent = {
  nav: {
    features: "Tizim",
    how: "Boshlash",
    channels: "Kanallar",
    pricing: "Narxlar",
    faq: "Savollar",
  },
  actions: {
    createShop: "Doʻkon yaratish",
    signIn: "Kirish",
    viewDemo: "Demoni ochish",
    dashboard: "Boshqaruvga oʻtish",
  },
  hero: {
    eyebrow: "Vitrina · Buyurtmalar · QR · Toʻlov · AI",
    titleLead: "Oʻz vitrinangiz. Oʻz brendingiz.",
    titlePayoff: "Oʻz mijozlaringiz.",
    subtitle:
      "Toʻgʻridan-toʻgʻri soting — mijoz va foizni marketpleysga bermang. Menyu, toʻlov va yetkazib berish bitta havolada. Bir kechada yigʻing, komissiyasiz.",
    spec: ["Bepul boshlash", "Roʻyxatsiz", "Istalgan til"],
  },
  demo: {
    shopName: "Vintage Coffee",
    shopMeta: "Toshkent",
    menuLabel: "Menyu",
    orderTitle: "Yangi buyurtma",
    orderEmpty: "Mahsulotni bosing — u shu yerda paydo boʻladi",
    totalLabel: "Jami",
    addAria: "Qoʻshish",
    deliveryFeeLabel: "Yetkazib berish",
    keepLine: "Komissiyasiz · butun tushum sizniki",
    channels: [
      { key: "dinein", label: "Zal · QR", context: "7-stol" },
      { key: "pickup", label: "Olib ketish", context: "18:30 ga tayyor" },
      { key: "delivery", label: "Yetkazib berish", context: "Chilonzor, 12" },
    ],
    items: [
      { name: "Kapuchino", price: 22000 },
      { name: "Vanilli raf", price: 28000 },
      { name: "Chizkeyk", price: 32000 },
      { name: "Tiramisu", price: 30000 },
    ],
  },
  proof: {
    statement:
      "Marketpleys emas. Sizning vitrinangiz — oʻz brendingiz va oʻz nomingiz bilan.",
    ledger: [
      { label: "Naqd — hozir", soon: false },
      { label: "Karta — tez orada", soon: true },
      { label: "Yandex kuryeri", soon: false },
      { label: "Telegram’da buyurtmalar", soon: false },
      { label: "Menyu istalgan tilda", soon: false },
    ],
  },
  problem: {
    eyebrow: "01 / Muammo",
    heading: "Sizning biznesingiz hamon chalkashlikka tayanadi",
    messages: [
      { channel: "telegram", label: "Telegram", text: "salom, 2 ta kapuchino olib ketishga boʻladimi?", time: "12:14" },
      { channel: "instagram", label: "Instagram", text: "Chilonzorga yetkazib berasizmi bugun?", time: "12:19" },
      { channel: "call", label: "Javobsiz qoʻngʻiroq", text: "+998 90 · 0:00", time: "12:21" },
      { channel: "notebook", label: "Bloknot", text: "4-stol — osh ×2, piyozsiz", time: "12:24" },
      { channel: "whatsapp", label: "WhatsApp", text: "buyurtmani oʻzgartirsam boʻladimi? ichimlikni qoʻshishni unutibman", time: "12:31" },
    ],
    note: "Gap sayt yoʻqligida emas. Gap tizim yoʻqligida.",
    contrast:
      "Marketpleys mijozni va har bir sotuvdan foizni oladi. Vitrina ikkalasini ham sizga qoldiradi.",
  },
  features: {
    eyebrow: "02 / Bitta tizim",
    heading: "Oʻnta ilova oʻrniga bitta tizim",
    subheading:
      "Menyu, buyurtmalar, QR, yetkazib berish va tarjimalar — bir joyda, qoʻl ostida.",
    mockCaption: "Har bir buyurtma — bitta ekranda",
    items: [
      {
        title: "Menyu va katalog",
        body: "Kategoriyalar, rasmlar, modifikatorlar, variantlar va soʻmdagi narxlar. Haqiqiy menyu va haqiqiy mahsulotlar uchun.",
      },
      {
        title: "Har bir buyurtma — bitta ekranda",
        body: "Zal, olib ketish va yetkazib berish — har bir buyurtma darhol koʻrinadi, hech narsa yoʻqolmaydi.",
      },
      {
        title: "Ichki yetkazib berish",
        body: "Hududlar, tariflar va buyurtmadan toʻgʻri Yandex kuryerini chaqirish.",
      },
      {
        title: "Bir bosishda tarjimalar",
        body: "Butun menyu istalgan tilda — RU, UZ, EN va undan keyin. Istalgan davlatdan kelgan mehmon oʻz tilida oʻqiydi.",
      },
      {
        title: "Telefondan boshqaring",
        body: "Menyuni oʻzgartiring va istalgan joydan buyurtmalarni qabul qiling.",
      },
      {
        title: "QR — sotuv kanali",
        body: "Stoldagi va olib ketish uchun QR vitrinani ochadi va buyurtmani keltiradi.",
      },
    ],
  },
  how: {
    eyebrow: "06 / Boshlash",
    heading: "Kechgacha buyurtma qabul qila boshlaysiz",
    subheading: "Jadvaldan buyurtma qabul qiluvchi tizimgacha — uch qadam.",
    steps: [
      {
        title: "Doʻkon yarating",
        body: "Tur va nomni tanlang. Qoralama darhol tayyor — roʻyxatsiz.",
      },
      {
        title: "Menyu yigʻing",
        body: "Mahsulotlar, rasmlar va narxlarni qoʻshing — istalgan tilga tarjima bilan.",
      },
      {
        title: "Havola ulashing",
        body: "Havolani yuboring yoki Telegram’ni ulang — va buyurtma qabul qiling.",
      },
    ],
  },
  channels: {
    eyebrow: "03 / Kanallar",
    heading: "Bitta menyu — mehmon uni odatdagidek topadi",
    items: [
      {
        label: "Web katalog",
        body: "Oʻz havolangizdagi tezkor vitrina. Ilovasiz.",
      },
      {
        label: "Telegram",
        body: "Doʻkon va buyurtma bildirishnomalari — toʻgʻri Telegram’da, siz allaqachon ishlaydigan joyda.",
      },
      {
        label: "Zaldagi QR",
        body: "Stoldagi QR menyuni ochadi — buyurtma toʻgʻri sizga keladi.",
      },
    ],
  },
  payments: {
    eyebrow: "04 / Toʻlovlar",
    heading: "Har qanday toʻlov usuli — bir joyda",
    soonLabel: "Tez orada",
    subheading: "Avval Oʻzbekiston ichida, keyin butun dunyoda.",
    providers: ["Payme", "Click", "Uzum", "Stripe"],
    storefrontLabel: "Vitrina",
    flowNote: "Mehmon nima bilan toʻlamasin, pul Krafta hisobingizga tushadi.",
  },
  ai: {
    eyebrow: "05 / AI",
    soonLabel: "Tez orada",
    heading: "Buyurtma berishning keyingi usuli — suhbat",
    subheading: "Mehmon soʻraydi — Krafta buyurtmani yigʻadi.",
    searchPlaceholder: "Vintage Coffee’dan soʻrang…",
    queriesLabel: "Mehmonlar soʻraydi",
    queries: [
      "Laktozasiz taomlarni koʻrsat",
      "Yengilroq nimadir, 400 kkalgacha",
      "Men odatda bu yerda nima olaman?",
    ],
    suggestionMeta: "Mos keladi · 320 kkal",
    suggestionName: "Kokos yogurtli granola",
    suggestionPrice: 42000,
    personalNote:
      "Afzalliklar, allergiya, parhez, buyurtmalar tarixi — Krafta mehmon oʻrniga eslab qoladi va u buyurtma qiladigan narsani taklif qiladi.",
  },
  dashboard: {
    eyebrow: "Sizning tomoningiz",
    heading: "Hammasi nazorat ostida — bitta ekranda",
    subheading:
      "Mehmon vitrinada buyurtma beradi — u darhol sizga tushadi. Zal, olib ketish va yetkazib berish, summalar va holatlar, Telegram bildirishnomalari. Hech narsa yoʻqolmaydi.",
    ordersUrl: "krafta.org/orders",
    ordersAlt: "Krafta buyurtmalar paneli — jonli navbat",
    libraryUrl: "krafta.org/items",
    libraryAlt: "Krafta menyu muharriri",
  },
  pricing: {
    eyebrow: "07 / Narxlar",
    heading: "Biz har bir buyurtmadan 20% olmaymiz",
    subheading: "Oyiga belgilangan narx — qancha sotmang ham.",
    internationalNote:
      "Hozircha Oʻzbekistondan tashqarida toʻlov qabul qilmaymiz — ishga tushgunimizcha bepul.",
    free: {
      name: "Bepul",
      price: "0",
      period: "boshlash uchun",
      features: [
        "Menyu istalgan tilda",
        "Buyurtmalar toʻgʻridan-toʻgʻri Telegramda",
        "Olib ketish va koʻrish uchun katalog",
        "Telefondan boshqaruv",
      ],
      cta: "Doʻkon yaratish",
    },
    pro: {
      name: "Pro",
      price: "250,000",
      period: "soʻm / oy",
      priceUsd: "$20/oy",
      badge: "Ommabop",
      includes: "Free’dagi hammasi, ustiga",
      features: [
        "Zal — stollarda QR → oshxonaga",
        "Yetkazib berish — hududlar, tariflar va Yandex kuryeri",
        "Barcha buyurtmalar bitta ekranda",
        "Asosiy tahlil",
      ],
      cta: "Doʻkon yaratish",
    },
    business: {
      name: "Business",
      price: "490,000",
      period: "soʻm / oy",
      priceUsd: "$39/oy",
      includes: "Pro’dagi hammasi, ustiga",
      features: [
        "Krafta Pay — zalda va onlayn karta (tez orada)",
        "AI buyurtma yordamchisi (tez orada)",
        "Bir nechta filial va jamoa rollari",
        "Kengaytirilgan tahlil va hisobotlar",
        "Ustuvor qoʻllab-quvvatlash",
      ],
      note: "Birinchi doʻkonlar uchun Business imkoniyatlari — Pro narxida, abadiy.",
    },
  },
  faq: {
    eyebrow: "Savollar",
    heading: "Asosiysi haqida qisqacha",
    items: [
      {
        q: "Krafta nima?",
        a: "Marketpleyssiz toʻgʻridan-toʻgʻri sotish uchun kerak boʻlgan hammasi: vitrina, QR-menyu, buyurtmalarni boshqarish va (tez orada) karta toʻlovlari — Oʻzbekistondagi kafe, restoran va doʻkonlar uchun. Menyu yarating, barcha kanallar boʻyicha buyurtma qabul qiling va hammasini telefondan boshqaring.",
      },
      {
        q: "Mehmonlarim ilova oʻrnatishi kerakmi?",
        a: "Yoʻq. Ular web havola orqali yoki Telegram ichida buyurtma beradi. Hech narsa yuklash shart emas.",
      },
      {
        q: "Qaysi tillar qoʻllab-quvvatlanadi?",
        a: "Menyuni istalgan tilga tarjima qilish mumkin — istalgan davlatdan kelgan mehmon oʻz tilida oʻqiydi. Kraftaning oʻzi — panel va vitrina — rus, oʻzbek (lotin) va ingliz tillarida ishlaydi.",
      },
      {
        q: "Toʻlovni qanday qabul qilaman?",
        a: "Hozircha joyida naqd pul bilan. Krafta Pay orqali karta toʻlovlari — zalda va onlayn — tez orada, qatʼiy toʻlov bilan, sotuvlardan foiz emas.",
      },
      {
        q: "Yetkazib berish mumkinmi?",
        a: "Ha. Yetkazib berish hududlari va tariflarini belgilang hamda buyurtmadan toʻgʻri Yandex kuryerini chaqiring.",
      },
      {
        q: "Bu qancha turadi?",
        a: "Boshlash bepul, kartasiz. Pulli tariflar oʻsish bilan paydo boʻladi — oyiga belgilangan narx, sotuvdan foiz emas.",
      },
    ],
  },
  closing: {
    headingLead: "Krafta vitrinadan boshlanadi.",
    headingPayoff: "Keyin — butun biznesingizni yuritadi.",
  },
  footer: {
    tagline: "Vitrina, buyurtmalar va QR-menyu — komissiyasiz.",
    productHeading: "Mahsulot",
    accountHeading: "Hisob",
    rights: "Barcha huquqlar himoyalangan.",
  },
};

export const LANDING_CONTENT: Record<LandingLocale, LandingContent> = {
  ru,
  uz,
  en,
};

export function getLandingContent(locale: LandingLocale): LandingContent {
  return LANDING_CONTENT[locale];
}
