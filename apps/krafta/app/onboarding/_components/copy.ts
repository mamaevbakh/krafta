// Onboarding wizard copy — every merchant-facing string in one place.
//
// DESIGN.md (Internationalization): UI strings route through app-level locale
// modules, never hardcoded in components. This module holds one flat table per
// locale behind the SAME keys — the components read a locale-resolved table via
// getWizardCopy() and never change when a translation lands.
//
// Interpolation: tokens are `{name}`-style, resolved by fmt(). Keep values
// plain strings (no JSX, no functions) so the locale tables stay data-only.
// wizardCopyEn is the source of truth for the shape; wizardCopyRu /
// wizardCopyUzLatn are typed `: WizardCopy` so a missing or extra key fails at
// compile time.

import type { DashboardLocale } from "@/lib/locales/dashboard/locale";

export function fmt(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

const wizardCopyEn = {
  common: {
    back: "Back",
    continue: "Continue",
    progressLabel: "Setup progress",
    add: "Add",
    cancelAdd: "Cancel adding",
    logout: "Sign out",
  },
  type: {
    title: "What are you opening?",
    subtitle: "We'll suggest a starter menu you can shape in the next steps.",
  },
  name: {
    title: "Name your shop",
    subtitle: "Customers see this name. You can change it anytime.",
    label: "Shop name",
    placeholder: "Чойхона №1",
  },
  logo: {
    title: "Add your logo",
    subtitle:
      "Optional — your logo sits at the top of your storefront. Skip it and we'll drop in a placeholder you can swap anytime.",
    pick: "Upload a logo",
    hint: "PNG, JPG, or WebP — a square image looks best.",
    replace: "Replace",
    remove: "Remove",
    previewAria: "Selected logo preview",
    tooLarge: "That image is over 5 MB — pick a smaller one.",
  },
  menuMethod: {
    title: "How do you want to build your menu?",
    subtitle:
      "Start from your existing menu, or build it by hand. Everything stays editable either way.",
    options: {
      upload: {
        label: "Upload files",
        hint: "Photo, screenshot or PDF — we'll turn it into your catalog in seconds.",
      },
      manual: {
        label: "Manual Catalog",
        hint: "Pick from a starter menu and add items yourself.",
      },
    },
  },
  menuUpload: {
    title: "Upload your menu",
    subtitle:
      "Add clear photos, screenshots or a PDF. Multiple pages are fine — we'll read them as one menu.",
    pick: "Add files",
    hint: "PNG, JPG, WebP or PDF — up to 20 files.",
    addMore: "Add more files",
    fileCount: "{n} file ready",
    fileCountPlural: "{n} files ready",
    removeAria: "Remove {name}",
    extract: "Build my menu",
    extracting: "Reading your menu…",
    extractingHint: "Pulling out your sections, items and prices.",
    manualFallback: "I'll add items manually instead",
    tooMany: "Up to 20 files — remove one to add another.",
    tooLarge: "That file is over 12 MB — pick a smaller one.",
    tooLargeTotal:
      "These photos are too large together — remove one or use smaller photos.",
    empty: "Add at least one photo or PDF first.",
  },
  sections: {
    title: "Your menu sections",
    subtitleVertical: "What we'd suggest for a {vertical} — drop or add your own.",
    subtitleBare: "Drop or add your own.",
    suggestedCount: "{n} suggested",
    addPlaceholder: "Add a section (e.g. Десерты)",
  },
  items: {
    title: "Your first items",
    subtitle: "Keep our prices or set yours — everything stays editable in your dashboard.",
    addPlaceholder: "Add an item",
    includeAria: "Include {name}",
    nameAria: "Item name",
    priceAria: "Price in sums",
    currencySuffix: "сум",
    sizesLabel: "Sizes",
    addOnsLabel: "Add-ons",
  },
  country: {
    title: "Where are you based?",
    subtitle: "We'll set your currency to match — you can fine-tune it next.",
    currencyHint: "Currency set to {currency} — adjust it on the next step.",
  },
  currency: {
    title: "What currency?",
    subtitle: "Shown on every price across your shop. Switch it for any country.",
    sampleLabel: "Live sample",
    symbol: "Symbol",
    position: "Position",
    before: "Before",
    after: "After",
    decimals: "Decimals",
    on: "On",
    off: "Off",
    thousands: "Thousands",
    space: "Space",
  },
  modes: {
    title: "How do customers order?",
    subtitle: "Pick what you serve — or just show a catalog.",
    atLeastOne: "Pick at least one way to order, or choose catalog-only.",
    or: "OR",
    labels: {
      dine_in: { label: "Dine-in", hint: "QR on the table, orders to the kitchen" },
      pickup: { label: "Pickup", hint: "Customers order ahead and collect" },
      delivery: { label: "Delivery", hint: "You bring it to them" },
    },
    browseOnly: {
      label: "Just a catalog",
      hint: "Showcase the menu — no cart, browse only",
    },
  },
  tables: {
    title: "How many tables?",
    subtitle: "We'll prepare a printable QR code for each table.",
    cardTitle: "Tables at your venue",
    cardHint: "You can add, rename or remove tables later.",
    fewerAria: "Fewer tables",
    moreAria: "More tables",
  },
  languages: {
    title: "Menu languages",
    subtitle:
      "Suggested items ship translated in Russian, Uzbek and English. Other languages can be translated later in your dashboard.",
    defaultBadge: "Default",
    makeDefault: "Make default",
    removeAria: "Remove {name}",
  },
  alerts: {
    title: "Where should new orders find you?",
    subtitle: "Pick how you'll hear about an order — you'll set it up in a moment.",
    options: {
      telegram: {
        label: "Telegram",
        hint: "A ping on your phone the second an order lands",
      },
      dashboard: {
        label: "I'll check the dashboard",
        hint: "See new orders when you open Krafta",
      },
    },
  },
  phone: {
    title: "How can customers reach you?",
    subtitle: "Optional — a phone number makes the shop feel open for business.",
    label: "Phone",
    placeholder: "+998 90 123 45 67",
    skip: "Skip for now",
  },
  city: {
    title: "Where is your shop?",
    subtitle: "Optional — so nearby customers can find you.",
    otherChip: "Другой город",
    customLabel: "City",
    customPlaceholder: "Хива",
    create: "Create my shop",
    creating: "Setting up your shop…",
    skip: "Skip for now",
  },
  building: {
    title: "Setting up your shop",
    subtitle: "A few seconds — don't close this tab.",
    stages: [
      "Creating your shop…",
      "Building your menu…",
      "Translating your items…",
      "Preparing table QR codes…",
      "Almost there…",
    ],
    /** Stage index to skip when the shop has no dine-in tables. */
    tablesStageIndex: 3,
  },
  reveal: {
    title: "{name} is ready",
    subtitle: "This is what your customers will see. Everything stays editable.",
    cta: "Open my dashboard",
    /** Secondary CTA shown only when the merchant asked for Telegram alerts. */
    alertsCta: "Set up order alerts in Telegram",
  },
};

/** Shape shared by every locale table. English is the source of truth; the
 *  ru/uz tables below are checked against it. */
export type WizardCopy = typeof wizardCopyEn;

const wizardCopyRu: WizardCopy = {
  common: {
    back: "Назад",
    continue: "Продолжить",
    progressLabel: "Ход настройки",
    add: "Добавить",
    cancelAdd: "Отменить",
    logout: "Выйти",
  },
  type: {
    title: "Что вы открываете?",
    subtitle: "Мы предложим стартовое меню — доработаете его на следующих шагах.",
  },
  name: {
    title: "Назовите ваш магазин",
    subtitle: "Клиенты увидят это название. Его можно изменить в любой момент.",
    label: "Название магазина",
    placeholder: "Чойхона №1",
  },
  logo: {
    title: "Добавьте логотип",
    subtitle:
      "Необязательно — логотип отображается в верхней части вашего магазина. Пропустите — мы поставим заглушку, которую можно заменить в любой момент.",
    pick: "Загрузить логотип",
    hint: "PNG, JPG или WebP — лучше всего смотрится квадратное изображение.",
    replace: "Заменить",
    remove: "Удалить",
    previewAria: "Предпросмотр выбранного логотипа",
    tooLarge: "Изображение больше 5 МБ — выберите поменьше.",
  },
  menuMethod: {
    title: "Как вы хотите собрать меню?",
    subtitle:
      "Начните с готового меню или соберите вручную. В любом случае всё можно отредактировать.",
    options: {
      upload: {
        label: "Загрузить файлы",
        hint: "Фото, скриншот или PDF — за секунды превратим в ваш каталог.",
      },
      manual: {
        label: "Собрать вручную",
        hint: "Выберите из стартового меню и добавьте позиции сами.",
      },
    },
  },
  menuUpload: {
    title: "Загрузите меню",
    subtitle:
      "Добавьте чёткие фото, скриншоты или PDF. Несколько страниц — не проблема, прочитаем их как одно меню.",
    pick: "Добавить файлы",
    hint: "PNG, JPG, WebP или PDF — до 20 файлов.",
    addMore: "Добавить ещё файлы",
    fileCount: "{n} файл готов",
    fileCountPlural: "{n} файлов готово",
    removeAria: "Удалить {name}",
    extract: "Собрать меню",
    extracting: "Читаем ваше меню…",
    extractingHint: "Выделяем разделы, позиции и цены.",
    manualFallback: "Лучше добавлю позиции вручную",
    tooMany: "Не больше 20 файлов — удалите один, чтобы добавить другой.",
    tooLarge: "Файл больше 12 МБ — выберите поменьше.",
    tooLargeTotal:
      "Фотографии вместе слишком большие — удалите одну или используйте снимки поменьше.",
    empty: "Сначала добавьте хотя бы одно фото или PDF.",
  },
  sections: {
    title: "Разделы меню",
    subtitleVertical: "Что мы предлагаем для «{vertical}» — уберите лишнее или добавьте своё.",
    subtitleBare: "Уберите лишнее или добавьте своё.",
    suggestedCount: "{n} предложено",
    addPlaceholder: "Добавить раздел (напр. Десерты)",
  },
  items: {
    title: "Первые позиции",
    subtitle: "Оставьте наши цены или укажите свои — всё можно изменить в панели управления.",
    addPlaceholder: "Добавить позицию",
    includeAria: "Включить {name}",
    nameAria: "Название позиции",
    priceAria: "Цена в сумах",
    currencySuffix: "сум",
    sizesLabel: "Размеры",
    addOnsLabel: "Добавки",
  },
  country: {
    title: "Где вы находитесь?",
    subtitle: "Подберём подходящую валюту — настроите её на следующем шаге.",
    currencyHint: "Валюта: {currency} — измените на следующем шаге.",
  },
  currency: {
    title: "Какая валюта?",
    subtitle: "Отображается во всех ценах магазина. Подходит для любой страны.",
    sampleLabel: "Пример",
    symbol: "Символ",
    position: "Расположение",
    before: "Перед",
    after: "После",
    decimals: "Дробная часть",
    on: "Вкл",
    off: "Выкл",
    thousands: "Тысячи",
    space: "Пробел",
  },
  modes: {
    title: "Как клиенты заказывают?",
    subtitle: "Выберите, как вы работаете, — или просто покажите каталог.",
    atLeastOne: "Выберите хотя бы один способ заказа или режим «только каталог».",
    or: "ИЛИ",
    labels: {
      dine_in: { label: "В зале", hint: "QR на столе, заказы сразу на кухню" },
      pickup: { label: "Самовывоз", hint: "Клиенты заказывают заранее и забирают" },
      delivery: { label: "Доставка", hint: "Вы привозите заказ клиенту" },
    },
    browseOnly: {
      label: "Только каталог",
      hint: "Витрина меню — без корзины, только просмотр",
    },
  },
  tables: {
    title: "Сколько столов?",
    subtitle: "Подготовим QR-код для печати на каждый стол.",
    cardTitle: "Столы в заведении",
    cardHint: "Столы можно добавить, переименовать или удалить позже.",
    fewerAria: "Меньше столов",
    moreAria: "Больше столов",
  },
  languages: {
    title: "Языки меню",
    subtitle:
      "Предложенные позиции уже переведены на русский, узбекский и английский. Другие языки можно перевести позже в панели управления.",
    defaultBadge: "По умолчанию",
    makeDefault: "Сделать основным",
    removeAria: "Удалить {name}",
  },
  alerts: {
    title: "Куда присылать новые заказы?",
    subtitle: "Выберите, как узнавать о заказах, — настроим это через мгновение.",
    options: {
      telegram: {
        label: "Telegram",
        hint: "Уведомление на телефон в момент заказа",
      },
      dashboard: {
        label: "Буду смотреть в панели",
        hint: "Новые заказы видны при входе в Krafta",
      },
    },
  },
  phone: {
    title: "Как клиентам с вами связаться?",
    subtitle: "Необязательно — номер телефона показывает, что магазин открыт для заказов.",
    label: "Телефон",
    placeholder: "+998 90 123 45 67",
    skip: "Пропустить",
  },
  city: {
    title: "Где находится магазин?",
    subtitle: "Необязательно — чтобы вас находили клиенты поблизости.",
    otherChip: "Другой город",
    customLabel: "Город",
    customPlaceholder: "Хива",
    create: "Создать магазин",
    creating: "Настраиваем магазин…",
    skip: "Пропустить",
  },
  building: {
    title: "Настраиваем магазин",
    subtitle: "Несколько секунд — не закрывайте вкладку.",
    stages: [
      "Создаём магазин…",
      "Собираем меню…",
      "Переводим позиции…",
      "Готовим QR-коды для столов…",
      "Почти готово…",
    ],
    tablesStageIndex: 3,
  },
  reveal: {
    title: "{name} готов",
    subtitle: "Вот что увидят ваши клиенты. Всё можно изменить.",
    cta: "Открыть панель управления",
    alertsCta: "Настроить уведомления о заказах в Telegram",
  },
};

const wizardCopyUzLatn: WizardCopy = {
  common: {
    back: "Orqaga",
    continue: "Davom etish",
    progressLabel: "Sozlash jarayoni",
    add: "Qo‘shish",
    cancelAdd: "Bekor qilish",
    logout: "Chiqish",
  },
  type: {
    title: "Nima ochyapsiz?",
    subtitle: "Biz boshlang‘ich menyu taklif qilamiz — keyingi qadamlarda uni sozlaysiz.",
  },
  name: {
    title: "Do‘koningizni nomlang",
    subtitle: "Mijozlar shu nomni ko‘radi. Uni istalgan vaqtda o‘zgartirishingiz mumkin.",
    label: "Do‘kon nomi",
    placeholder: "Choyxona №1",
  },
  logo: {
    title: "Logotip qo‘shing",
    subtitle:
      "Ixtiyoriy — logotip do‘koningiz tepasida ko‘rinadi. O‘tkazib yuborsangiz, istalgan vaqtda almashtirsa bo‘ladigan vaqtinchalik rasm qo‘yamiz.",
    pick: "Logotip yuklash",
    hint: "PNG, JPG yoki WebP — kvadrat rasm eng yaxshi ko‘rinadi.",
    replace: "Almashtirish",
    remove: "O‘chirish",
    previewAria: "Tanlangan logotip ko‘rinishi",
    tooLarge: "Rasm 5 MB dan katta — kichikrog‘ini tanlang.",
  },
  menuMethod: {
    title: "Menyuni qanday tuzmoqchisiz?",
    subtitle:
      "Tayyor menyudan boshlang yoki qo‘lda tuzing. Har qanday holatda hammasini tahrirlash mumkin.",
    options: {
      upload: {
        label: "Fayllarni yuklash",
        hint: "Rasm, skrinshot yoki PDF — soniyalarda katalogingizga aylantiramiz.",
      },
      manual: {
        label: "Qo‘lda tuzish",
        hint: "Boshlang‘ich menyudan tanlang va mahsulotlarni o‘zingiz qo‘shing.",
      },
    },
  },
  menuUpload: {
    title: "Menyuni yuklang",
    subtitle:
      "Aniq rasmlar, skrinshotlar yoki PDF qo‘shing. Bir nechta sahifa bo‘lsa ham — ularni yagona menyu sifatida o‘qiymiz.",
    pick: "Fayllar qo‘shish",
    hint: "PNG, JPG, WebP yoki PDF — 20 tagacha fayl.",
    addMore: "Yana fayl qo‘shish",
    fileCount: "{n} ta fayl tayyor",
    fileCountPlural: "{n} ta fayl tayyor",
    removeAria: "{name}ni o‘chirish",
    extract: "Menyuni tuzish",
    extracting: "Menyuingizni o‘qiyapmiz…",
    extractingHint: "Bo‘limlar, mahsulotlar va narxlarni ajratyapmiz.",
    manualFallback: "O‘rniga mahsulotlarni qo‘lda qo‘shaman",
    tooMany: "20 tadan ortiq emas — boshqasini qo‘shish uchun bittasini o‘chiring.",
    tooLarge: "Fayl 12 MB dan katta — kichikrog‘ini tanlang.",
    tooLargeTotal:
      "Rasmlar birgalikda juda katta — bittasini o‘chiring yoki kichikroq rasmlardan foydalaning.",
    empty: "Avval kamida bitta rasm yoki PDF qo‘shing.",
  },
  sections: {
    title: "Menyu bo‘limlari",
    subtitleVertical: "«{vertical}» uchun tavsiyamiz — keraksizini olib tashlang yoki o‘zingiznikini qo‘shing.",
    subtitleBare: "Keraksizini olib tashlang yoki o‘zingiznikini qo‘shing.",
    suggestedCount: "{n} ta taklif",
    addPlaceholder: "Bo‘lim qo‘shish (masalan, Shirinliklar)",
  },
  items: {
    title: "Birinchi mahsulotlar",
    subtitle: "Bizning narxlarni qoldiring yoki o‘zingiznikini kiriting — hammasini boshqaruv panelida o‘zgartirish mumkin.",
    addPlaceholder: "Mahsulot qo‘shish",
    includeAria: "{name}ni qo‘shish",
    nameAria: "Mahsulot nomi",
    priceAria: "Narxi so‘mda",
    currencySuffix: "so‘m",
    sizesLabel: "O‘lchamlar",
    addOnsLabel: "Qo‘shimchalar",
  },
  country: {
    title: "Qayerdasiz?",
    subtitle: "Mos valyutani tanlaymiz — keyingi qadamda sozlaysiz.",
    currencyHint: "Valyuta: {currency} — keyingi qadamda o‘zgartiring.",
  },
  currency: {
    title: "Qaysi valyuta?",
    subtitle: "Do‘koningizdagi barcha narxlarda ko‘rinadi. Har qanday davlat uchun almashtiring.",
    sampleLabel: "Namuna",
    symbol: "Belgi",
    position: "Joylashuvi",
    before: "Oldin",
    after: "Keyin",
    decimals: "Kasr qismi",
    on: "Bor",
    off: "Yo‘q",
    thousands: "Minglar",
    space: "Bo‘shliq",
  },
  modes: {
    title: "Mijozlar qanday buyurtma beradi?",
    subtitle: "Qanday ishlashingizni tanlang — yoki shunchaki katalog ko‘rsating.",
    atLeastOne: "Kamida bitta buyurtma usulini tanlang yoki «faqat katalog»ni belgilang.",
    or: "YOKI",
    labels: {
      dine_in: { label: "Zalda", hint: "Stolda QR, buyurtmalar to‘g‘ridan-to‘g‘ri oshxonaga" },
      pickup: { label: "Olib ketish", hint: "Mijozlar oldindan buyurtma berib, olib ketadi" },
      delivery: { label: "Yetkazib berish", hint: "Buyurtmani mijozga yetkazasiz" },
    },
    browseOnly: {
      label: "Faqat katalog",
      hint: "Menyu vitrinasi — savatchasiz, faqat ko‘rish",
    },
  },
  tables: {
    title: "Nechta stol?",
    subtitle: "Har bir stol uchun chop etiladigan QR-kod tayyorlaymiz.",
    cardTitle: "Muassasangizdagi stollar",
    cardHint: "Stollarni keyinroq qo‘shish, nomini o‘zgartirish yoki o‘chirish mumkin.",
    fewerAria: "Kamroq stol",
    moreAria: "Ko‘proq stol",
  },
  languages: {
    title: "Menyu tillari",
    subtitle:
      "Taklif etilgan mahsulotlar rus, o‘zbek va ingliz tillariga tarjima qilingan. Boshqa tillarni keyinroq boshqaruv panelida tarjima qilish mumkin.",
    defaultBadge: "Asosiy",
    makeDefault: "Asosiy qilish",
    removeAria: "{name}ni o‘chirish",
  },
  alerts: {
    title: "Yangi buyurtmalar qayerga kelsin?",
    subtitle: "Buyurtmalar haqida qanday bilib olishni tanlang — buni bir zumda sozlaymiz.",
    options: {
      telegram: {
        label: "Telegram",
        hint: "Buyurtma tushishi bilan telefoningizga bildirishnoma",
      },
      dashboard: {
        label: "Panelda o‘zim ko‘raman",
        hint: "Yangi buyurtmalar Krafta ochilganda ko‘rinadi",
      },
    },
  },
  phone: {
    title: "Mijozlar siz bilan qanday bog‘lanadi?",
    subtitle: "Ixtiyoriy — telefon raqami do‘kon ochiq ekanini bildiradi.",
    label: "Telefon",
    placeholder: "+998 90 123 45 67",
    skip: "Hozircha o‘tkazib yuborish",
  },
  city: {
    title: "Do‘kon qayerda?",
    subtitle: "Ixtiyoriy — yaqin atrofdagi mijozlar sizni topishi uchun.",
    otherChip: "Boshqa shahar",
    customLabel: "Shahar",
    customPlaceholder: "Xiva",
    create: "Do‘kon yaratish",
    creating: "Do‘koningizni sozlayapmiz…",
    skip: "Hozircha o‘tkazib yuborish",
  },
  building: {
    title: "Do‘koningizni sozlayapmiz",
    subtitle: "Bir necha soniya — bu oynani yopmang.",
    stages: [
      "Do‘kon yaratyapmiz…",
      "Menyu tuzyapmiz…",
      "Mahsulotlarni tarjima qilyapmiz…",
      "Stollar uchun QR-kodlar tayyorlayapmiz…",
      "Deyarli tayyor…",
    ],
    tablesStageIndex: 3,
  },
  reveal: {
    title: "{name} tayyor",
    subtitle: "Mijozlaringiz shuni ko‘radi. Hammasini o‘zgartirish mumkin.",
    cta: "Boshqaruv panelini ochish",
    alertsCta: "Telegramda buyurtma bildirishnomalarini sozlash",
  },
};

/** Resolve the wizard copy table for the active dashboard locale. */
export function getWizardCopy(locale: DashboardLocale): WizardCopy {
  if (locale === "ru") return wizardCopyRu;
  if (locale === "uz-Latn") return wizardCopyUzLatn;
  return wizardCopyEn;
}

/** Back-compat: the pre-i18n default export. Prefer getWizardCopy(locale). */
export const wizardCopy = wizardCopyEn;

/** Major-city chips for the city screen — taps instead of typing. */
export const CITY_CHIPS = [
  "Ташкент",
  "Самарканд",
  "Бухара",
  "Наманган",
  "Андижон",
  "Фергана",
] as const;
