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
    title: "Tasnif — поиск кодов ИКПУ (МХИК) своими словами",
    description:
      "Бесплатный поиск кодов ИКПУ (МХИК) по смыслу: «капучино», «стрижка», «подгузники». Коды упаковки для чека, штрихкоды и отключённые коды.",
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
    permalink: "Страница кода",
  },
  code: {
    back: "Новый поиск",
    metaTitle: "{name} — код ИКПУ {code}",
    metaDescription:
      "Код ИКПУ (МХИК) {code}: {name}. Коды упаковки для чека, единица измерения и категория «{category}».",
    notFoundTitle: "Такого кода нет в каталоге",
    notFoundHint: "Код ИКПУ — это 17 цифр. Проверьте их или найдите код по названию.",
    alternatives: "Действующие коды той же категории",
    noAlternatives: "В этой категории нет действующих кодов. Найдите подходящий по названию.",
  },
  catalog: {
    root: "Каталог",
    title: "Каталог ИКПУ",
    lead: "Национальный каталог товаров и услуг по группам. Внутри группы — классы, позиции и субпозиции, а в субпозициях — сами коды.",
    metaTitle: "Каталог кодов ИКПУ (МХИК) по группам",
    metaDescription:
      "Все группы национального каталога товаров и услуг Узбекистана. Откройте группу, класс и позицию, чтобы найти код ИКПУ (МХИК) для чека.",
    breadcrumb: "Путь по каталогу",
    browse: "Весь каталог по группам",
    level: { group: "группа", class: "класс", position: "позиция", subposition: "субпозиция" },
    children: { group: "Группы", class: "Классы", position: "Позиции", subposition: "Субпозиции" },
    codes: "Коды",
    codeCount: { one: "{count} код", few: "{count} кода", many: "{count} кодов", other: "{count} кода" },
    categoryMetaTitle: "{name} — коды ИКПУ",
    categoryMetaDescription:
      "«{name}»: {level} {code} каталога ИКПУ (МХИК). Все подкатегории и коды, которые можно указать в чеке.",
    subpositionMetaDescription:
      "{count} ИКПУ (МХИК) в категории «{name}» ({code}). Откройте код, чтобы увидеть коды упаковки и единицу измерения для чека.",
    page: "Страница {page} из {pages}",
    previous: "Назад",
    next: "Дальше",
    empty: "В этой категории сейчас нет действующих кодов.",
    notFoundTitle: "Такой категории нет в каталоге",
    notFoundHint: "Проверьте код категории или найдите нужный код по названию.",
  },
  about: {
    whatTitle: "Что такое ИКПУ",
    whatText:
      "ИКПУ, по-узбекски МХИК, — идентификационный код товара или услуги из национального каталога, который ведёт Налоговый комитет. В коде 17 цифр, и он обязателен в каждом фискальном чеке и электронном счёте-фактуре.",
    packageText:
      "Вместе с кодом в чек идёт код упаковки — единица, в которой вы продаёте товар: штука, килограмм, пачка, порция.",
    howTitle: "Как найти код",
    howText:
      "Напишите, что вы продаёте, так, как сказали бы покупателю: «капучино», «стрижка», «подгузники». Поиск понимает смысл, а не только слова каталога, поэтому находит код, даже если в каталоге он назван иначе. Искать можно на русском, узбекском (латиницей и кириллицей) и английском, а ещё по самому коду, штрихкоду товара или коду упаковки.",
    checkText:
      "Откройте результат, чтобы увидеть коды упаковки, единицу измерения и категорию. Перед тем как пробить чек, сверьте код с официальным каталогом на tasnif.soliq.uz.",
    faqTitle: "Частые вопросы",
    faq: [
      {
        q: "ИКПУ и МХИК — это одно и то же?",
        a: "Да. ИКПУ — русское сокращение, МХИК — узбекское. Это один и тот же 17-значный код из одного каталога.",
      },
      {
        q: "Это официальный сайт Налогового комитета?",
        a: "Нет. Tasnif — бесплатный независимый поиск от Krafta по открытым данным официального каталога tasnif.soliq.uz. Мы обновляем данные из официального каталога каждый день; дата последнего обновления — внизу страницы.",
      },
      {
        q: "Что такое код упаковки?",
        a: "Второе число, которое нужно чеку: единица, в которой вы продаёте товар, — штука, килограмм, пачка, порция. У каждого кода ИКПУ свой набор кодов упаковки; они есть на странице кода.",
      },
      {
        q: "Что делать, если код отключён?",
        a: "Налоговый комитет время от времени отключает коды, и отключённый код больше нельзя указывать в чеке. Tasnif помечает такой код «Код отключён» и предлагает действующие коды той же категории.",
      },
      {
        q: "Что делать, если подходящего кода нет?",
        a: "Попробуйте описать товар иначе: для чего он, из чего сделан. Если кода действительно нет, его можно запросить у Налогового комитета на tasnif.soliq.uz.",
      },
      {
        q: "Сколько это стоит?",
        a: "Нисколько. Поиск бесплатный и работает без регистрации.",
      },
    ],
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
    title: "Tasnif — MXIK (IKPU) kodlarini oʻz soʻzlaringiz bilan qidirish",
    description:
      "MXIK (IKPU) kodlarini maʼnosi boʻyicha bepul qidiring: «kapuchino», «soch olish», «taglik». Chek uchun qadoq kodlari, shtrix-kodlar va oʻchirilgan kodlar.",
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
    permalink: "Kod sahifasi",
  },
  code: {
    back: "Yangi qidiruv",
    metaTitle: "{name} — MXIK kodi {code}",
    metaDescription:
      "MXIK (IKPU) kodi {code}: {name}. Chek uchun qadoq kodlari, oʻlchov birligi va «{category}» kategoriyasi.",
    notFoundTitle: "Katalogda bunday kod yoʻq",
    notFoundHint: "MXIK kodi 17 ta raqamdan iborat. Raqamlarni tekshiring yoki kodni nomi boʻyicha qidiring.",
    alternatives: "Shu kategoriyadagi amaldagi kodlar",
    noAlternatives: "Bu kategoriyada amaldagi kodlar yoʻq. Mosini nomi boʻyicha qidiring.",
  },
  catalog: {
    root: "Katalog",
    title: "MXIK katalogi",
    lead: "Tovarlar va xizmatlar milliy katalogi guruhlar boʻyicha. Guruh ichida sinflar, pozitsiyalar va subpozitsiyalar, subpozitsiyalarda esa kodlarning oʻzi.",
    metaTitle: "MXIK (IKPU) kodlari katalogi guruhlar boʻyicha",
    metaDescription:
      "Oʻzbekiston tovarlar va xizmatlar milliy katalogining barcha guruhlari. Chek uchun MXIK (IKPU) kodini topish uchun guruh, sinf va pozitsiyani oching.",
    breadcrumb: "Katalogdagi yoʻl",
    browse: "Butun katalog guruhlar boʻyicha",
    level: { group: "guruh", class: "sinf", position: "pozitsiya", subposition: "subpozitsiya" },
    children: { group: "Guruhlar", class: "Sinflar", position: "Pozitsiyalar", subposition: "Subpozitsiyalar" },
    codes: "Kodlar",
    codeCount: { one: "{count} ta kod", few: "{count} ta kod", many: "{count} ta kod", other: "{count} ta kod" },
    categoryMetaTitle: "{name} — MXIK kodlari",
    categoryMetaDescription:
      "«{name}»: MXIK (IKPU) katalogidagi {level} {code}. Chekda koʻrsatish mumkin boʻlgan barcha kichik kategoriyalar va kodlar.",
    subpositionMetaDescription:
      "MXIK (IKPU) katalogining «{name}» ({code}) kategoriyasida {count} bor. Chek uchun qadoq kodlari va oʻlchov birligini koʻrish uchun kodni oching.",
    page: "{page}-sahifa, jami {pages}",
    previous: "Oldingi",
    next: "Keyingi",
    empty: "Bu kategoriyada hozir amaldagi kodlar yoʻq.",
    notFoundTitle: "Katalogda bunday kategoriya yoʻq",
    notFoundHint: "Kategoriya kodini tekshiring yoki kerakli kodni nomi boʻyicha qidiring.",
  },
  about: {
    whatTitle: "MXIK nima",
    whatText:
      "MXIK, ruscha IKPU, — Soliq qoʻmitasi yuritadigan milliy katalogdagi tovar yoki xizmatning identifikatsiya kodi. U 17 ta raqamdan iborat va har bir fiskal chek hamda elektron hisob-fakturada koʻrsatilishi shart.",
    packageText:
      "Kod bilan birga chekka qadoq kodi ham yoziladi — tovarni qaysi birlikda sotayotganingiz: dona, kilogramm, quti, porsiya.",
    howTitle: "Kodni qanday topish mumkin",
    howText:
      "Nima sotayotganingizni xaridorga qanday aytsangiz, shunday yozing: «kapuchino», «soch olish», «taglik». Qidiruv katalogdagi soʻzlarnigina emas, maʼnoni ham tushunadi, shuning uchun kod katalogda boshqacha nomlangan boʻlsa ham topiladi. Rus, oʻzbek (lotin va kirill) hamda ingliz tillarida, shuningdek kodning oʻzi, tovar shtrix-kodi yoki qadoq kodi boʻyicha qidirish mumkin.",
    checkText:
      "Qadoq kodlari, oʻlchov birligi va kategoriyani koʻrish uchun natijani oching. Chek chiqarishdan oldin kodni tasnif.soliq.uz rasmiy katalogi bilan solishtiring.",
    faqTitle: "Koʻp beriladigan savollar",
    faq: [
      {
        q: "MXIK va IKPU — bir narsami?",
        a: "Ha. MXIK — oʻzbekcha qisqartma, IKPU — ruscha. Bu bitta katalogdagi bitta 17 xonali kod.",
      },
      {
        q: "Bu Soliq qoʻmitasining rasmiy saytimi?",
        a: "Yoʻq. Tasnif — Krafta tomonidan tasnif.soliq.uz rasmiy katalogining ochiq maʼlumotlari asosida yaratilgan bepul mustaqil qidiruv. Maʼlumotlarni rasmiy katalogdan har kuni yangilaymiz; oxirgi yangilanish sanasi sahifa pastida.",
      },
      {
        q: "Qadoq kodi nima?",
        a: "Chek uchun kerak boʻladigan ikkinchi raqam: tovarni qaysi birlikda sotayotganingiz — dona, kilogramm, quti, porsiya. Har bir MXIK kodining oʻz qadoq kodlari bor; ular kod sahifasida koʻrsatilgan.",
      },
      {
        q: "Kod oʻchirilgan boʻlsa-chi?",
        a: "Soliq qoʻmitasi vaqti-vaqti bilan kodlarni oʻchiradi, oʻchirilgan kodni esa chekda koʻrsatib boʻlmaydi. Tasnif bunday kodni «Kod oʻchirilgan» deb belgilaydi va shu kategoriyadagi amaldagi kodlarni taklif qiladi.",
      },
      {
        q: "Mos kod boʻlmasa nima qilish kerak?",
        a: "Tovarni boshqacha tasvirlab koʻring: u nima uchun, nimadan yasalgan. Agar kod haqiqatan ham boʻlmasa, uni tasnif.soliq.uz orqali Soliq qoʻmitasidan soʻrash mumkin.",
      },
      {
        q: "Bu qancha turadi?",
        a: "Hech narsa. Qidiruv bepul va roʻyxatdan oʻtishni talab qilmaydi.",
      },
    ],
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
    title: "Tasnif — IKPU (MXIK) code search in your own words",
    description:
      "Free search by meaning for Uzbekistan's IKPU (MXIK) codes: “cappuccino”, “haircut”, “diapers”. Package codes for receipts, barcodes and switched-off codes.",
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
    permalink: "Code page",
  },
  code: {
    back: "New search",
    metaTitle: "{name} — IKPU code {code}",
    metaDescription:
      "IKPU (MXIK) code {code}: {name}. Package codes for the receipt, unit and the “{category}” category.",
    notFoundTitle: "No such code in the catalog",
    notFoundHint: "An IKPU code is 17 digits. Check them, or find the code by name.",
    alternatives: "Active codes in the same category",
    noAlternatives: "This category has no active codes. Find a fitting one by name.",
  },
  catalog: {
    root: "Catalog",
    title: "IKPU catalog",
    lead: "Uzbekistan's national catalog of goods and services, by group. Inside a group are classes, positions and sub-positions, and the sub-positions hold the codes themselves.",
    metaTitle: "IKPU (MXIK) code catalog by group",
    metaDescription:
      "Every group of Uzbekistan's national catalog of goods and services. Open a group, class and position to find the IKPU (MXIK) code for your receipt.",
    breadcrumb: "Place in the catalog",
    browse: "Browse the whole catalog",
    level: { group: "group", class: "class", position: "position", subposition: "sub-position" },
    children: { group: "Groups", class: "Classes", position: "Positions", subposition: "Sub-positions" },
    codes: "Codes",
    codeCount: { one: "{count} code", few: "{count} codes", many: "{count} codes", other: "{count} codes" },
    categoryMetaTitle: "{name} — IKPU codes",
    categoryMetaDescription:
      "“{name}”: {level} {code} of the IKPU (MXIK) catalog. Every sub-category and code you can put on a receipt.",
    subpositionMetaDescription:
      "{count} in the IKPU (MXIK) category “{name}” ({code}). Open a code to see its package codes and unit for the receipt.",
    page: "Page {page} of {pages}",
    previous: "Previous",
    next: "Next",
    empty: "This category has no active codes right now.",
    notFoundTitle: "No such category in the catalog",
    notFoundHint: "Check the category code, or find the code you need by name.",
  },
  about: {
    whatTitle: "What an IKPU code is",
    whatText:
      "IKPU (MXIK in Uzbek) is the identification code of a product or service in the national catalog kept by Uzbekistan's Tax Committee. It is 17 digits long, and every fiscal receipt and electronic invoice must carry one.",
    packageText:
      "Along with the code, a receipt needs a package code: the unit you sell in, such as a piece, a kilogram, a pack or a portion.",
    howTitle: "How to find your code",
    howText:
      "Write what you sell the way you would say it to a customer: “cappuccino”, “haircut”, “diapers”. The search understands meaning, not just the catalog's own wording, so it finds the code even when the catalog calls it something else. Search in Russian, Uzbek (Latin or Cyrillic) or English, or by the code itself, a product barcode or a package code.",
    checkText:
      "Open a result to see its package codes, unit and category. Before you issue a receipt, check the code against the official catalog at tasnif.soliq.uz.",
    faqTitle: "Questions",
    faq: [
      {
        q: "Are IKPU and MXIK the same thing?",
        a: "Yes. IKPU is the Russian abbreviation and MXIK the Uzbek one. It is the same 17-digit code from the same catalog.",
      },
      {
        q: "Is this the Tax Committee's official site?",
        a: "No. Tasnif is a free, independent search by Krafta over the open data of the official catalog at tasnif.soliq.uz. We refresh it from the official catalog every day; the date of the last update is at the bottom of the page.",
      },
      {
        q: "What is a package code?",
        a: "The second number a receipt needs: the unit you sell in, such as a piece, a kilogram, a pack or a portion. Every IKPU code has its own set of package codes, listed on the code's page.",
      },
      {
        q: "What if a code has been switched off?",
        a: "The Tax Committee switches codes off from time to time, and a switched-off code can no longer go on a receipt. Tasnif marks it “Switched-off code” and suggests active codes from the same category.",
      },
      {
        q: "What if there's no fitting code?",
        a: "Try describing the item differently: what it's for, what it's made of. If the code really doesn't exist, you can request one from the Tax Committee at tasnif.soliq.uz.",
      },
      {
        q: "How much does it cost?",
        a: "Nothing. The search is free and needs no sign-up.",
      },
    ],
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

/** Intl's name for each interface language: Uzbek is always Latin script here. */
export const INTL_LOCALE: Record<Locale, string> = { ru: "ru", uz: "uz-Latn", en: "en" }

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value)
}

type PluralForms = { one: string; few: string; many: string; other: string }

/** "1 код", "3 кода", "5 кодов": the form Russian (or any language) asks for, with {count} filled. */
export function plural(forms: PluralForms, count: number, locale: Locale): string {
  const form = new Intl.PluralRules(INTL_LOCALE[locale]).select(count)
  const template = form in forms ? forms[form as keyof PluralForms] : forms.other
  return format(template, { count: formatNumber(count, locale) })
}
