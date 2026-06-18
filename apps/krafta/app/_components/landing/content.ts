/**
 * content.ts — landing-page copy for the three product locales (RU primary,
 * UZ Latin, EN). Mirrors the storefront's `?lang=` convention: the page root
 * resolves the active locale from searchParams and renders against the matching
 * dictionary.
 *
 * Voice (locked after the Square/Stripe/Supabase/Vercel/ElevenLabs review):
 * RU-first, one Tashkent cafe owner talking to another — warm, direct,
 * outcome-led, never translated. Emphasis comes from typography (foreground vs
 * muted two-tone), never a color accent. Geist Mono UPPERCASE micro-labels read
 * as POS/receipt grammar, not generic SaaS spec-caps.
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
    tagline: "POS · Orders · Delivery",
    features: "Features",
    how: "How it works",
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
    eyebrow: "POS and orders for Uzbekistan's cafes",
    titleLead: "Stop running orders out of notebooks and chats.",
    titlePayoff: "Build your menu and take orders the right way.",
    subtitle:
      "Krafta turns your menu into a living storefront: guests order at the table by QR, for pickup, or for delivery — and every order lands in one place you run from your phone.",
    spec: ["Free", "No signup", "RU · UZ · EN"],
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
      "Built for how Tashkent cafes actually work — not a Western template.",
    ledger: [
      { label: "Cash now", soon: false },
      { label: "Card soon", soon: true },
      { label: "Yandex courier", soon: false },
      { label: "Orders in Telegram", soon: false },
      { label: "RU · UZ · EN", soon: false },
    ],
  },
  features: {
    eyebrow: "Features",
    heading: "Counter, menu, and orders — without the mess",
    subheading:
      "One system for the menu, the orders, and the people standing in front of you.",
    mockCaption: "Every order, one screen",
    items: [
      {
        title: "Digital menu",
        body: "Categories, photos, modifiers, variations, and prices in sum. Edit once, publish everywhere.",
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
        title: "Three languages",
        body: "A storefront in RU, UZ, and EN — every guest orders in their own.",
      },
      {
        title: "All from your phone",
        body: "Change the menu and take orders from anywhere.",
      },
      {
        title: "Free to start",
        body: "Your shop is ready in minutes. No signup, no card.",
      },
    ],
  },
  how: {
    eyebrow: "How it works",
    heading: "Taking orders by tonight",
    subheading: "Three steps from spreadsheet to a shop that takes orders.",
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
    eyebrow: "Channels",
    heading: "One menu — guests reach it the way they already order",
    items: [
      {
        label: "Web catalog",
        body: "A fast storefront on your own link. No app to install.",
      },
      {
        label: "Telegram",
        body: "Your shop runs inside Telegram, where your guests already are.",
      },
      {
        label: "QR at the table",
        body: "A QR opens the menu and the order lands straight with you.",
      },
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    heading: "Start free, pay as you grow",
    subheading: "Pay for growth, not for getting started.",
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
      note: "Card payments and growth tools are on the way.",
    },
  },
  faq: {
    eyebrow: "FAQ",
    heading: "Straight answers",
    items: [
      {
        q: "What is Krafta?",
        a: "A point of sale and ordering platform for cafes, restaurants, and shops in Uzbekistan. Build a menu, take orders across channels, and run it all from your phone.",
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
        a: "Cash in person today. Card payments through Krafta Pay — in person and online — are coming.",
      },
      {
        q: "Can I do delivery?",
        a: "Yes. Set delivery zones and fees, and call a Yandex courier directly from the order.",
      },
      {
        q: "How much does it cost?",
        a: "Free to start, no card required. Paid plans arrive as your shop grows.",
      },
    ],
  },
  closing: {
    headingLead: "Menu, orders, delivery.",
    headingPayoff: "Open your cafe online today.",
  },
  footer: {
    tagline: "The point of sale your cafe actually wants.",
    productHeading: "Product",
    accountHeading: "Account",
    rights: "All rights reserved.",
  },
};

export type LandingContent = typeof en;

const ru: LandingContent = {
  nav: {
    tagline: "Касса · Заказы · Доставка",
    features: "Возможности",
    how: "Как это работает",
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
    eyebrow: "Касса и заказы для кафе Узбекистана",
    titleLead: "Хватит вести заказы в блокноте и переписке.",
    titlePayoff: "Соберите меню — и принимайте заказы как надо.",
    subtitle:
      "Krafta превращает ваше меню в живую витрину: гости заказывают в зале по QR, на самовывоз и на доставку — а каждый заказ виден в одном месте, и вы ведёте всё прямо с телефона.",
    spec: ["Бесплатно", "Без регистрации", "RU · UZ · EN"],
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
      "Сделано под то, как реально работают кафе Ташкента, — а не под западный шаблон.",
    ledger: [
      { label: "Наличные — сейчас", soon: false },
      { label: "Карта — скоро", soon: true },
      { label: "Курьер Яндекс", soon: false },
      { label: "Заказы в Telegram", soon: false },
      { label: "RU · UZ · EN", soon: false },
    ],
  },
  features: {
    eyebrow: "Возможности",
    heading: "Стойка, меню и заказы — без бардака",
    subheading: "Одна система для меню, заказов и тех, кто стоит перед вами.",
    mockCaption: "Все заказы на одном экране",
    items: [
      {
        title: "Цифровое меню",
        body: "Категории, фото, модификаторы, варианты и цены в сумах. Меняете один раз — обновляется везде.",
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
        title: "Три языка",
        body: "Витрина на RU, UZ и EN — каждый гость заказывает на своём.",
      },
      {
        title: "Всё с телефона",
        body: "Меняйте меню и принимайте заказы откуда угодно.",
      },
      {
        title: "Бесплатный старт",
        body: "Магазин готов за пару минут. Без регистрации и без карты.",
      },
    ],
  },
  how: {
    eyebrow: "Как это работает",
    heading: "К вечеру вы уже принимаете заказы",
    subheading: "Три шага от таблицы до магазина, который принимает заказы.",
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
    eyebrow: "Каналы",
    heading: "Одно меню — гость закажет там, где привык",
    items: [
      {
        label: "Веб-каталог",
        body: "Быстрая витрина на вашей ссылке. Без приложений.",
      },
      {
        label: "Telegram",
        body: "Магазин работает прямо в Telegram, где уже есть ваши гости.",
      },
      {
        label: "QR в зале",
        body: "QR на столе открывает меню — заказ сразу у вас.",
      },
    ],
  },
  pricing: {
    eyebrow: "Цены",
    heading: "Начните бесплатно, платите по мере роста",
    subheading: "Платите за рост, а не за старт.",
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
      note: "Приём карт и инструменты для роста уже в пути.",
    },
  },
  faq: {
    eyebrow: "Вопросы",
    heading: "Коротко о главном",
    items: [
      {
        q: "Что такое Krafta?",
        a: "Касса и платформа приёма заказов для кафе, ресторанов и магазинов Узбекистана. Соберите меню, принимайте заказы по всем каналам и управляйте всем с телефона.",
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
        a: "Сейчас — наличными в заведении. Приём карт через Krafta Pay — в зале и онлайн — уже скоро.",
      },
      {
        q: "Можно ли делать доставку?",
        a: "Да. Задайте зоны и тарифы доставки и вызывайте курьера Яндекс прямо из заказа.",
      },
      {
        q: "Сколько это стоит?",
        a: "Бесплатно для старта, без карты. Платные тарифы появятся по мере роста магазина.",
      },
    ],
  },
  closing: {
    headingLead: "Меню, заказы, доставка.",
    headingPayoff: "Откройте кафе онлайн уже сегодня.",
  },
  footer: {
    tagline: "Касса, которую ваше кафе действительно хочет.",
    productHeading: "Продукт",
    accountHeading: "Аккаунт",
    rights: "Все права защищены.",
  },
};

const uz: LandingContent = {
  nav: {
    tagline: "Kassa · Buyurtmalar · Yetkazib berish",
    features: "Imkoniyatlar",
    how: "Qanday ishlaydi",
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
    eyebrow: "Oʻzbekiston kafelari uchun kassa va buyurtmalar",
    titleLead: "Buyurtmalarni bloknot va yozishmalarda yuritishni bas qiling.",
    titlePayoff: "Menyu yigʻing — va buyurtmalarni qoyilmaqom qabul qiling.",
    subtitle:
      "Krafta menyuingizni jonli vitrinaga aylantiradi: mehmonlar zalda QR orqali, olib ketishga va yetkazib berishga buyurtma beradi — har bir buyurtma bir joyda koʻrinadi, va siz hammasini toʻgʻridan-toʻgʻri telefondan boshqarasiz.",
    spec: ["Bepul", "Roʻyxatsiz", "RU · UZ · EN"],
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
      "Toshkent kafelari aslida qanday ishlasa, oʻshanga moslab yaratilgan — gʻarb shabloni emas.",
    ledger: [
      { label: "Naqd — hozir", soon: false },
      { label: "Karta — tez orada", soon: true },
      { label: "Yandex kuryeri", soon: false },
      { label: "Telegram’da buyurtmalar", soon: false },
      { label: "RU · UZ · EN", soon: false },
    ],
  },
  features: {
    eyebrow: "Imkoniyatlar",
    heading: "Peshtaxta, menyu va buyurtmalar — chalkashliksiz",
    subheading:
      "Menyu, buyurtmalar va oldingizdagi mehmonlar uchun yagona tizim.",
    mockCaption: "Har bir buyurtma — bitta ekranda",
    items: [
      {
        title: "Raqamli menyu",
        body: "Kategoriyalar, rasmlar, modifikatorlar, variantlar va soʻmdagi narxlar. Bir marta tahrirlang — hamma joyda yangilanadi.",
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
        title: "Uch til",
        body: "RU, UZ va EN’dagi vitrina — har bir mehmon oʻz tilida buyurtma beradi.",
      },
      {
        title: "Hammasi telefondan",
        body: "Menyuni oʻzgartiring va istalgan joydan buyurtmalarni qabul qiling.",
      },
      {
        title: "Bepul boshlash",
        body: "Doʻkon bir necha daqiqada tayyor. Roʻyxatsiz va kartasiz.",
      },
    ],
  },
  how: {
    eyebrow: "Qanday ishlaydi",
    heading: "Kechgacha buyurtma qabul qila boshlaysiz",
    subheading: "Jadvaldan buyurtma qabul qiluvchi doʻkongacha — uch qadam.",
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
    eyebrow: "Kanallar",
    heading: "Bitta menyu — mehmon uni odatdagidek topadi",
    items: [
      {
        label: "Web katalog",
        body: "Oʻz havolangizdagi tezkor vitrina. Ilovasiz.",
      },
      {
        label: "Telegram",
        body: "Doʻkoningiz mehmonlaringiz allaqachon boʻlgan Telegram ichida ishlaydi.",
      },
      {
        label: "Zaldagi QR",
        body: "Stoldagi QR menyuni ochadi — buyurtma toʻgʻri sizga keladi.",
      },
    ],
  },
  pricing: {
    eyebrow: "Narxlar",
    heading: "Bepul boshlang, oʻsish bilan toʻlang",
    subheading: "Boshlash uchun emas, oʻsish uchun toʻlang.",
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
      note: "Karta toʻlovlari va oʻsish vositalari yoʻlda.",
    },
  },
  faq: {
    eyebrow: "Savollar",
    heading: "Asosiysi haqida qisqacha",
    items: [
      {
        q: "Krafta nima?",
        a: "Oʻzbekistondagi kafe, restoran va doʻkonlar uchun kassa va buyurtma platformasi. Menyu yarating, barcha kanallar boʻyicha buyurtma qabul qiling va hammasini telefondan boshqaring.",
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
        a: "Hozircha joyida naqd pul bilan. Krafta Pay orqali karta toʻlovlari — zalda va onlayn — tez orada.",
      },
      {
        q: "Yetkazib berish mumkinmi?",
        a: "Ha. Yetkazib berish hududlari va tariflarini belgilang hamda buyurtmadan toʻgʻri Yandex kuryerini chaqiring.",
      },
      {
        q: "Bu qancha turadi?",
        a: "Boshlash bepul, kartasiz. Doʻkoningiz oʻsgani sari pulli tariflar paydo boʻladi.",
      },
    ],
  },
  closing: {
    headingLead: "Menyu, buyurtmalar, yetkazib berish.",
    headingPayoff: "Kafengizni bugun onlayn oching.",
  },
  footer: {
    tagline: "Kafengiz haqiqatan istagan kassa.",
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
