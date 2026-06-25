/**
 * content.ts — landing-page copy for the three product locales (RU primary,
 * UZ Latin, EN). Mirrors the storefront's `?lang=` convention: the page root
 * resolves the active locale from searchParams and renders against the matching
 * dictionary.
 *
 * Voice (locked after the Square/Stripe/Supabase/Vercel/ElevenLabs review, then
 * repositioned to the "Commerce OS" direction — Variant A / "The Counter OS"):
 * RU-first, one Tashkent operator talking to another — confident, direct,
 * outcome-led, never translated. The framing is infrastructure ("операционная
 * система торговли"), not "a small tool". Emphasis comes from typography
 * (foreground vs muted two-tone) and Geist Mono UPPERCASE micro-labels read as
 * POS/receipt grammar — never a color accent (DESIGN.md).
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
): LandingLocale {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isLandingLocale(value) ? value : DEFAULT_LANDING_LOCALE;
}

/** Locale-independent demo constants (numbers stay out of the copy tables). */
export const DEMO_ORDER_NUMBER = "#0042";
export const DEMO_DELIVERY_FEE = 15000;

const en = {
  nav: {
    tagline: "Commerce OS for local business",
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
    titleLead: "The future of",
    titlePayoff: "local commerce",
    subtitle:
      "One system to sell: a storefront your guests love, every order in one place, QR and payments built in — run from your phone.",
    spec: ["Free to start", "No signup", "RU · UZ · EN"],
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
      "Not a marketplace. Your storefront — your own brand, in light and dark.",
    ledger: [
      { label: "Cash now", soon: false },
      { label: "Card soon", soon: true },
      { label: "Yandex courier", soon: false },
      { label: "Orders in Telegram", soon: false },
      { label: "RU · UZ · EN", soon: false },
    ],
  },
  problem: {
    eyebrow: "01 / Problem",
    heading: "Local commerce still runs on chaos",
    fragments: ["Chats", "Calls", "Notebooks", "Lost orders"],
    note: "The problem was never a missing website. It was a missing system.",
  },
  features: {
    eyebrow: "02 / Operating system",
    heading: "Everything you need to sell",
    subheading:
      "Menu, orders, QR, and translations — one system, not a pile of apps.",
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
        body: "The whole catalog in RU, UZ, and EN — ready for more than one market.",
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
        body: "Add items, photos, and prices. In Russian, Uzbek, and English.",
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
    heading: "Payments without integration pain",
    subheading: "Local providers today. Global payments next.",
    providers: ["Payme", "Click", "Uzum", "Stripe"],
    storefrontLabel: "Storefront",
    flowNote:
      "Payments are part of the infrastructure — not a plugin you wire up yourself.",
  },
  ai: {
    eyebrow: "05 / AI",
    heading: "The next interface is conversation",
    subheading: "Customers ask. Krafta builds the order.",
    searchPlaceholder: "Ask Vintage Coffee…",
    queries: [
      "Show me low-calorie dishes",
      "Anything without lactose?",
      "What do I usually order here?",
    ],
    suggestionMeta: "Suggested · 320 kcal",
    suggestionName: "Granola with coconut yogurt",
    suggestionPrice: 42000,
    personalNote:
      "Preferences, allergies, diet, order history — Krafta remembers, and commerce becomes personal.",
  },
  pricing: {
    eyebrow: "07 / Pricing",
    heading: "Infrastructure, not commission",
    subheading: "We don't take a cut of every sale.",
    free: {
      name: "Free",
      price: "0",
      period: "to start",
      features: [
        "Digital menu in RU / UZ / EN",
        "Web catalog + Telegram ordering",
        "Dine-in, pickup & delivery",
        "Phone dashboard",
      ],
      cta: "Create your shop",
    },
    pro: {
      name: "Pro",
      badge: "Coming soon",
      features: [
        "Krafta Pay — cards in person & online",
        "Advanced analytics & reporting",
        "Team roles & multiple venues",
      ],
      note: "Card payments and growth tools are on the way — a flat fee, never a percentage of your sales.",
    },
  },
  faq: {
    eyebrow: "FAQ",
    heading: "Straight answers",
    items: [
      {
        q: "What is Krafta?",
        a: "An operating system for local commerce — storefront, orders, QR, and (soon) payments for cafes, restaurants, and shops in Uzbekistan. Build a menu, take orders across channels, and run it all from your phone.",
      },
      {
        q: "Do my guests need to install an app?",
        a: "No. They order from a web link or inside Telegram. Nothing to download.",
      },
      {
        q: "Which languages are supported?",
        a: "Russian, Uzbek (Latin), and English. Your storefront shows each guest their own language.",
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
        a: "Free to start, no card required. Paid plans arrive as your shop grows — infrastructure pricing, not commission.",
      },
    ],
  },
  closing: {
    headingLead: "Krafta starts as a storefront.",
    headingPayoff: "Then becomes commerce OS.",
  },
  footer: {
    tagline: "The operating system for local commerce.",
    productHeading: "Product",
    accountHeading: "Account",
    rights: "All rights reserved.",
  },
};

export type LandingContent = typeof en;

const ru: LandingContent = {
  nav: {
    tagline: "Операционная система торговли",
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
    titleLead: "Будущее",
    titlePayoff: "локальной торговли",
    subtitle:
      "Одна система, чтобы продавать: витрина, которую любят гости, каждый заказ в одном месте, QR и оплата внутри — и всё это с телефона.",
    spec: ["Бесплатный старт", "Без регистрации", "RU · UZ · EN"],
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
      "Не маркетплейс. Ваша витрина — со своим брендом, в светлой и тёмной теме.",
    ledger: [
      { label: "Наличные — сейчас", soon: false },
      { label: "Карта — скоро", soon: true },
      { label: "Курьер Яндекс", soon: false },
      { label: "Заказы в Telegram", soon: false },
      { label: "RU · UZ · EN", soon: false },
    ],
  },
  problem: {
    eyebrow: "01 / Проблема",
    heading: "Локальная торговля всё ещё держится на хаосе",
    fragments: ["Переписки", "Звонки", "Блокнот", "Потерянные заказы"],
    note: "Дело не в отсутствии сайта. Дело в отсутствии системы.",
  },
  features: {
    eyebrow: "02 / Операционная система",
    heading: "Всё, что нужно, чтобы продавать",
    subheading:
      "Меню, заказы, QR и переводы — одна система, а не набор приложений.",
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
        body: "Весь каталог на RU, UZ и EN — готово к выходу за пределы одного рынка.",
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
        body: "Добавьте позиции, фото и цены. На русском, узбекском и английском.",
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
    heading: "Платежи без боли интеграций",
    subheading: "Локальные провайдеры — сейчас. Глобальные платежи — дальше.",
    providers: ["Payme", "Click", "Uzum", "Stripe"],
    storefrontLabel: "Витрина",
    flowNote:
      "Платежи — часть инфраструктуры, а не плагин, который вы настраиваете сами.",
  },
  ai: {
    eyebrow: "05 / AI",
    heading: "Следующий интерфейс — это разговор",
    subheading: "Гость спрашивает — Krafta собирает заказ.",
    searchPlaceholder: "Спросите Vintage Coffee…",
    queries: [
      "Покажи блюда без лактозы",
      "Что-нибудь лёгкое, до 400 ккал",
      "Что я обычно здесь беру?",
    ],
    suggestionMeta: "Подойдёт · 320 ккал",
    suggestionName: "Гранола с кокосовым йогуртом",
    suggestionPrice: 42000,
    personalNote:
      "Предпочтения, аллергии, диета, история заказов — Krafta помнит, и торговля становится персональной.",
  },
  pricing: {
    eyebrow: "07 / Цены",
    heading: "Инфраструктура, а не комиссия",
    subheading: "Мы не берём процент с каждой продажи.",
    free: {
      name: "Бесплатно",
      price: "0",
      period: "для старта",
      features: [
        "Цифровое меню на RU / UZ / EN",
        "Веб-каталог + заказы в Telegram",
        "Зал, самовывоз и доставка",
        "Панель управления на телефоне",
      ],
      cta: "Создать магазин",
    },
    pro: {
      name: "Pro",
      badge: "Скоро",
      features: [
        "Krafta Pay — приём карт в зале и онлайн",
        "Расширенная аналитика и отчёты",
        "Роли команды и несколько точек",
      ],
      note: "Приём карт и инструменты для роста уже в пути — фиксированная плата, а не процент с продаж.",
    },
  },
  faq: {
    eyebrow: "Вопросы",
    heading: "Коротко о главном",
    items: [
      {
        q: "Что такое Krafta?",
        a: "Операционная система локальной торговли — витрина, заказы, QR и (скоро) платежи для кафе, ресторанов и магазинов Узбекистана. Соберите меню, принимайте заказы по всем каналам и управляйте всем с телефона.",
      },
      {
        q: "Нужно ли гостям устанавливать приложение?",
        a: "Нет. Они заказывают по веб-ссылке или прямо в Telegram. Ничего скачивать не нужно.",
      },
      {
        q: "Какие языки поддерживаются?",
        a: "Русский, узбекский (латиница) и английский. Витрина показывает каждому гостю его язык.",
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
        a: "Бесплатно для старта, без карты. Платные тарифы появятся по мере роста — цена за инфраструктуру, а не комиссия.",
      },
    ],
  },
  closing: {
    headingLead: "Krafta начинается с витрины.",
    headingPayoff: "Дальше — операционная система торговли.",
  },
  footer: {
    tagline: "Операционная система для локальной торговли.",
    productHeading: "Продукт",
    accountHeading: "Аккаунт",
    rights: "Все права защищены.",
  },
};

const uz: LandingContent = {
  nav: {
    tagline: "Savdo operatsion tizimi",
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
    titleLead: "Lokal savdoning",
    titlePayoff: "kelajagi",
    subtitle:
      "Sotish uchun yagona tizim: mehmonlar yoqtiradigan vitrina, har bir buyurtma bir joyda, QR va toʻlov ichida — hammasi telefondan.",
    spec: ["Bepul boshlash", "Roʻyxatsiz", "RU · UZ · EN"],
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
      "Marketpleys emas. Sizning vitrinangiz — oʻz brendingiz bilan, yorugʻ va qorongʻi temada.",
    ledger: [
      { label: "Naqd — hozir", soon: false },
      { label: "Karta — tez orada", soon: true },
      { label: "Yandex kuryeri", soon: false },
      { label: "Telegram’da buyurtmalar", soon: false },
      { label: "RU · UZ · EN", soon: false },
    ],
  },
  problem: {
    eyebrow: "01 / Muammo",
    heading: "Lokal savdo hamon chalkashlikka tayanadi",
    fragments: ["Yozishmalar", "Qoʻngʻiroqlar", "Bloknot", "Yoʻqolgan buyurtmalar"],
    note: "Gap sayt yoʻqligida emas. Gap tizim yoʻqligida.",
  },
  features: {
    eyebrow: "02 / Operatsion tizim",
    heading: "Sotish uchun kerak boʻlgan hamma narsa",
    subheading:
      "Menyu, buyurtmalar, QR va tarjimalar — yagona tizim, ilovalar uyumi emas.",
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
        body: "Butun katalog RU, UZ va EN’da — bittadan ortiq bozorga tayyor.",
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
        body: "Mahsulotlar, rasmlar va narxlarni qoʻshing. Rus, oʻzbek va ingliz tillarida.",
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
    heading: "Toʻlovlar — integratsiya azobisiz",
    subheading: "Lokal provayderlar — hozir. Global toʻlovlar — keyin.",
    providers: ["Payme", "Click", "Uzum", "Stripe"],
    storefrontLabel: "Vitrina",
    flowNote:
      "Toʻlovlar — infratuzilmaning bir qismi, oʻzingiz ulaydigan plagin emas.",
  },
  ai: {
    eyebrow: "05 / AI",
    heading: "Keyingi interfeys — bu suhbat",
    subheading: "Mehmon soʻraydi — Krafta buyurtmani yigʻadi.",
    searchPlaceholder: "Vintage Coffee’dan soʻrang…",
    queries: [
      "Laktozasiz taomlarni koʻrsat",
      "Yengilroq nimadir, 400 kkalgacha",
      "Men odatda bu yerda nima olaman?",
    ],
    suggestionMeta: "Mos keladi · 320 kkal",
    suggestionName: "Kokos yogurtli granola",
    suggestionPrice: 42000,
    personalNote:
      "Afzalliklar, allergiya, parhez, buyurtmalar tarixi — Krafta eslab qoladi, va savdo shaxsiy boʻladi.",
  },
  pricing: {
    eyebrow: "07 / Narxlar",
    heading: "Infratuzilma, komissiya emas",
    subheading: "Biz har bir sotuvdan ulush olmaymiz.",
    free: {
      name: "Bepul",
      price: "0",
      period: "boshlash uchun",
      features: [
        "RU / UZ / EN’dagi raqamli menyu",
        "Web katalog + Telegram buyurtmalari",
        "Zal, olib ketish va yetkazib berish",
        "Telefondagi boshqaruv paneli",
      ],
      cta: "Doʻkon yaratish",
    },
    pro: {
      name: "Pro",
      badge: "Tez orada",
      features: [
        "Krafta Pay — zalda va onlayn kartalar",
        "Kengaytirilgan tahlil va hisobotlar",
        "Jamoa rollari va bir nechta filial",
      ],
      note: "Karta toʻlovlari va oʻsish vositalari yoʻlda — qatʼiy toʻlov, sotuvlaringizdan foiz emas.",
    },
  },
  faq: {
    eyebrow: "Savollar",
    heading: "Asosiysi haqida qisqacha",
    items: [
      {
        q: "Krafta nima?",
        a: "Lokal savdoning operatsion tizimi — Oʻzbekistondagi kafe, restoran va doʻkonlar uchun vitrina, buyurtmalar, QR va (tez orada) toʻlovlar. Menyu yarating, barcha kanallar boʻyicha buyurtma qabul qiling va hammasini telefondan boshqaring.",
      },
      {
        q: "Mehmonlarim ilova oʻrnatishi kerakmi?",
        a: "Yoʻq. Ular web havola orqali yoki Telegram ichida buyurtma beradi. Hech narsa yuklash shart emas.",
      },
      {
        q: "Qaysi tillar qoʻllab-quvvatlanadi?",
        a: "Rus, oʻzbek (lotin) va ingliz. Vitrina har bir mehmonga oʻz tilini koʻrsatadi.",
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
        a: "Boshlash bepul, kartasiz. Pulli tariflar oʻsish bilan paydo boʻladi — infratuzilma uchun narx, komissiya emas.",
      },
    ],
  },
  closing: {
    headingLead: "Krafta vitrinadan boshlanadi.",
    headingPayoff: "Keyin — savdo operatsion tizimi.",
  },
  footer: {
    tagline: "Lokal savdo uchun operatsion tizim.",
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
