/**
 * Hand-rolled, bounded-key catalogue, the same shape Krafta AI uses: one object
 * per locale, so a missing key is a type error rather than English leaking into
 * an Uzbek screen. Strings only (no functions), so a dictionary can be handed
 * from a server component to a client component as props.
 *
 * Russian is the default: most merchants and accountants who deal with IKPU
 * codes work in Russian. Uzbek is Latin script. Uzbek Cyrillic is not an
 * interface language (same call as the main app), but searching in Cyrillic
 * Uzbek works, and code details show the official Cyrillic name.
 *
 * Placeholders are written {like_this} and filled with `format()`.
 */

export const LOCALES = ["ru", "uz", "en"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "ru"
export const LOCALE_COOKIE = "tasnif_locale"

export function isLocale(value: string | null | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "")
}

export const LOCALE_SHORT: Record<Locale, string> = { ru: "RU", uz: "UZ", en: "EN" }
export const LOCALE_NAMES: Record<Locale, string> = { ru: "Русский", uz: "Oʻzbekcha", en: "English" }

const ru = {
  meta: {
    title: "Поиск ИКПУ — tasnif.krafta.uz",
    description:
      "Бесплатный поиск кодов ИКПУ своими словами: на русском, узбекском и английском. Коды упаковки для чека, штрихкоды и отключённые коды.",
  },
  header: { home: "На главную", language: "Язык" },
  search: {
    title: "Поиск ИКПУ",
    lead: "Опишите товар или услугу своими словами — на русском, узбекском или английском. Или вставьте код, штрихкод или код упаковки.",
    label: "Что вы продаёте?",
    placeholder: "Например: капучино, подгузники, стрижка",
    clear: "Очистить",
    examples: "Попробуйте",
    example1: "капучино",
    example2: "плов",
    example3: "подгузники",
    example4: "стрижка",
    example5: "4780083550024",
    searching: "Ищем…",
    count: "Найдено: {count}",
    nothingTitle: "Ничего не нашли",
    nothingHint:
      "Попробуйте другое слово или опишите, что это и для чего. Если подходящего кода в каталоге нет, его можно запросить у Налогового комитета.",
    requestCode: "Запросить код на tasnif.soliq.uz",
    errorTitle: "Поиск сейчас не отвечает",
    errorHint: "Попробуйте ещё раз через минуту.",
    retry: "Повторить",
    filterLabel: "Показать",
    filterAll: "Все",
    filterGoods: "Товары",
    filterService: "Услуги",
    filterCatering: "Кафе и рестораны",
  },
  result: {
    copy: "Скопировать код {code}",
    copied: "Код {code} скопирован",
    kindGoods: "Товар",
    kindService: "Услуга",
    kindCatering: "Готовится в кафе или ресторане",
    branded: "Конкретная марка",
    inactive: "Код отключён",
    matchIkpu: "Точный код",
    matchBarcode: "Найдено по штрихкоду",
    matchPackage: "Найдено по коду упаковки",
    matchPrefix: "Код из этой категории",
    matchSameCategory: "Действующий код той же категории",
    showDetails: "Подробнее",
    hideDetails: "Скрыть",
    fallbackName: "Официального названия на этом языке нет, показано на русском",
  },
  details: {
    loading: "Загружаем…",
    error: "Не удалось загрузить подробности.",
    path: "Категория",
    packages: "Коды упаковки для чека",
    packageCode: "Код",
    packageName: "Упаковка или единица",
    originFixed: "Задан Налоговым комитетом",
    originUser: "Создан бизнесом",
    noPackages: "Для этого кода в официальной выгрузке нет кодов упаковки.",
    units: "Единица измерения",
    barcode: "Штрихкод",
    benefit: "Льгота",
    brand: "Марка",
    nameUzCyrl: "Название на узбекском (кириллица)",
    inactiveNotice: "Этот код отключён Налоговым комитетом. Выберите действующий код той же категории.",
    official: "Открыть на tasnif.soliq.uz",
  },
  footer: {
    unofficial: "Неофициальный сервис. Не является сайтом Налогового комитета Республики Узбекистан.",
    check: "Перед выставлением чека сверяйте код с официальным каталогом.",
    source: "Данные",
    synced: "Каталог обновлён {date}",
  },
}

type Dictionary = typeof ru

const uz: Dictionary = {
  meta: {
    title: "MXIK kodini qidirish — tasnif.krafta.uz",
    description:
      "MXIK (IKPU) kodlarini oʻz soʻzlaringiz bilan bepul qidiring: rus, oʻzbek va ingliz tillarida. Chek uchun qadoq kodlari, shtrix-kodlar va oʻchirilgan kodlar.",
  },
  header: { home: "Bosh sahifa", language: "Til" },
  search: {
    title: "MXIK kodini qidirish",
    lead: "Mahsulot yoki xizmatni oʻz soʻzlaringiz bilan yozing — rus, oʻzbek yoki ingliz tilida. Yoki kod, shtrix-kod yoki qadoq kodini kiriting.",
    label: "Nima sotasiz?",
    placeholder: "Masalan: kapuchino, taglik, soch olish",
    clear: "Tozalash",
    examples: "Sinab koʻring",
    example1: "kapuchino",
    example2: "palov",
    example3: "taglik",
    example4: "soch olish",
    example5: "4780083550024",
    searching: "Qidirilmoqda…",
    count: "Topildi: {count}",
    nothingTitle: "Hech narsa topilmadi",
    nothingHint:
      "Boshqa soʻz bilan yoki bu nima va nima uchun ekanini yozib koʻring. Katalogda mos kod boʻlmasa, uni Soliq qoʻmitasidan soʻrash mumkin.",
    requestCode: "tasnif.soliq.uz saytida kod soʻrash",
    errorTitle: "Qidiruv hozir javob bermayapti",
    errorHint: "Bir daqiqadan soʻng qayta urinib koʻring.",
    retry: "Qayta urinish",
    filterLabel: "Koʻrsatish",
    filterAll: "Hammasi",
    filterGoods: "Tovarlar",
    filterService: "Xizmatlar",
    filterCatering: "Kafe va restoranlar",
  },
  result: {
    copy: "{code} kodini nusxalash",
    copied: "{code} kodi nusxalandi",
    kindGoods: "Tovar",
    kindService: "Xizmat",
    kindCatering: "Kafe yoki restoranda tayyorlanadi",
    branded: "Aniq brend",
    inactive: "Kod oʻchirilgan",
    matchIkpu: "Aniq kod",
    matchBarcode: "Shtrix-kod boʻyicha topildi",
    matchPackage: "Qadoq kodi boʻyicha topildi",
    matchPrefix: "Shu kategoriyadagi kod",
    matchSameCategory: "Shu kategoriyadagi amaldagi kod",
    showDetails: "Batafsil",
    hideDetails: "Yashirish",
    fallbackName: "Bu tilda rasmiy nom yoʻq, rus tilida koʻrsatilgan",
  },
  details: {
    loading: "Yuklanmoqda…",
    error: "Tafsilotlarni yuklab boʻlmadi.",
    path: "Kategoriya",
    packages: "Chek uchun qadoq kodlari",
    packageCode: "Kod",
    packageName: "Qadoq yoki birlik",
    originFixed: "Soliq qoʻmitasi belgilagan",
    originUser: "Biznes yaratgan",
    noPackages: "Rasmiy eksportda bu kod uchun qadoq kodlari yoʻq.",
    units: "Oʻlchov birligi",
    barcode: "Shtrix-kod",
    benefit: "Imtiyoz",
    brand: "Brend",
    nameUzCyrl: "Oʻzbekcha nomi (kirill)",
    inactiveNotice: "Bu kod Soliq qoʻmitasi tomonidan oʻchirilgan. Shu kategoriyadagi amaldagi kodni tanlang.",
    official: "tasnif.soliq.uz saytida ochish",
  },
  footer: {
    unofficial: "Norasmiy xizmat. Oʻzbekiston Respublikasi Soliq qoʻmitasining sayti emas.",
    check: "Chek chiqarishdan oldin kodni rasmiy katalog bilan solishtiring.",
    source: "Maʼlumotlar",
    synced: "Katalog yangilangan: {date}",
  },
}

const en: Dictionary = {
  meta: {
    title: "IKPU code search — tasnif.krafta.uz",
    description:
      "Free search for Uzbekistan's IKPU product and service codes in your own words, in Russian, Uzbek and English. Package codes for receipts, barcodes and switched-off codes.",
  },
  header: { home: "Home", language: "Language" },
  search: {
    title: "IKPU code search",
    lead: "Describe what you sell in your own words, in Russian, Uzbek or English. Or paste a code, barcode or package code.",
    label: "What do you sell?",
    placeholder: "For example: cappuccino, diapers, haircut",
    clear: "Clear",
    examples: "Try",
    example1: "cappuccino",
    example2: "plov",
    example3: "diapers",
    example4: "haircut",
    example5: "4780083550024",
    searching: "Searching…",
    count: "Found: {count}",
    nothingTitle: "Nothing found",
    nothingHint:
      "Try another word, or describe what it is and what it's for. If the catalog has no fitting code, you can request one from the Tax Committee.",
    requestCode: "Request a code on tasnif.soliq.uz",
    errorTitle: "Search isn't responding right now",
    errorHint: "Try again in a minute.",
    retry: "Try again",
    filterLabel: "Show",
    filterAll: "All",
    filterGoods: "Goods",
    filterService: "Services",
    filterCatering: "Cafés & restaurants",
  },
  result: {
    copy: "Copy code {code}",
    copied: "Code {code} copied",
    kindGoods: "Goods",
    kindService: "Service",
    kindCatering: "Made in a café or restaurant",
    branded: "Specific brand",
    inactive: "Switched-off code",
    matchIkpu: "Exact code",
    matchBarcode: "Found by barcode",
    matchPackage: "Found by package code",
    matchPrefix: "Code in this category",
    matchSameCategory: "Active code in the same category",
    showDetails: "Details",
    hideDetails: "Hide",
    fallbackName: "No official English name; shown in Russian",
  },
  details: {
    loading: "Loading…",
    error: "Couldn't load the details.",
    path: "Category",
    packages: "Package codes for the receipt",
    packageCode: "Code",
    packageName: "Package or unit",
    originFixed: "Set by the Tax Committee",
    originUser: "Created by a business",
    noPackages: "The official export has no package codes for this code.",
    units: "Unit",
    barcode: "Barcode",
    benefit: "Tax benefit",
    brand: "Brand",
    nameUzCyrl: "Uzbek name (Cyrillic)",
    inactiveNotice: "The Tax Committee has switched this code off. Pick an active code from the same category.",
    official: "Open on tasnif.soliq.uz",
  },
  footer: {
    unofficial: "Unofficial service. Not a website of the Tax Committee of the Republic of Uzbekistan.",
    check: "Check the code against the official catalog before issuing a receipt.",
    source: "Data",
    synced: "Catalog updated {date}",
  },
}

const DICTIONARIES: Record<Locale, Dictionary> = { ru, uz, en }

export type { Dictionary }

export function dictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale]
}

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}
