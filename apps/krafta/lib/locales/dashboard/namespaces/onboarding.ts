/**
 * onboarding — new-merchant onboarding wizard ("Snap your menu"): vertical
 * pick, shop name, logo, menu build method (upload / manual), AI menu
 * extraction, sections + items review, order modes, tables, languages, order
 * alerts, contacts, and the building / reveal theater. Also the wizard's
 * server-action return/error strings.
 *
 * Contract: export { en, ru, "uz-Latn" } objects of flat dotted keys prefixed
 * "onboarding.". English is canonical (defines the key union); ru / uz-Latn are
 * type-checked against it in ../catalog.ts. Use {var} placeholders for runtime
 * values. See ./common.ts for the full contract.
 */

export const onboarding = {
  en: {
    "onboarding.meta_title": "Create your shop — Krafta",

    "onboarding.progress_label": "Setup progress",
    "onboarding.cancel_add": "Cancel adding",
    "onboarding.remove_named": "Remove {name}",
    "onboarding.skip_for_now": "Skip for now",

    "onboarding.type.title": "What are you opening?",
    "onboarding.type.subtitle":
      "We'll suggest a starter menu you can shape in the next steps.",

    "onboarding.vertical.cafe.label": "Cafe",
    "onboarding.vertical.cafe.desc": "Coffee, pastries, counter pickup",
    "onboarding.vertical.restaurant.label": "Restaurant",
    "onboarding.vertical.restaurant.desc": "Dine-in menu, table orders, delivery",
    "onboarding.vertical.retail.label": "Retail",
    "onboarding.vertical.retail.desc": "Products with sizes and variations",

    "onboarding.name.title": "Name your shop",
    "onboarding.name.subtitle":
      "Customers see this name. You can change it anytime.",
    "onboarding.name.label": "Shop name",
    "onboarding.name.placeholder": "Chaykhana No. 1",

    "onboarding.logo.title": "Add your logo",
    "onboarding.logo.subtitle":
      "Optional — your logo sits at the top of your storefront. Skip it and we'll drop in a placeholder you can swap anytime.",
    "onboarding.logo.pick": "Upload a logo",
    "onboarding.logo.hint": "PNG, JPG, or WebP — a square image looks best.",
    "onboarding.logo.replace": "Replace",
    "onboarding.logo.preview_aria": "Selected logo preview",
    "onboarding.logo.too_large": "That image is over 5 MB — pick a smaller one.",

    "onboarding.menu_method.title": "How do you want to build your menu?",
    "onboarding.menu_method.subtitle":
      "Start from your existing menu, or build it by hand. Everything stays editable either way.",
    "onboarding.menu_method.upload.label": "Upload files",
    "onboarding.menu_method.upload.hint":
      "Photo, screenshot or PDF — we'll turn it into your catalog in seconds.",
    "onboarding.menu_method.manual.label": "Manual Catalog",
    "onboarding.menu_method.manual.hint":
      "Pick from a starter menu and add items yourself.",

    "onboarding.menu_upload.title": "Upload your menu",
    "onboarding.menu_upload.subtitle":
      "Add clear photos, screenshots or a PDF. Multiple pages are fine — we'll read them as one menu.",
    "onboarding.menu_upload.pick": "Add files",
    "onboarding.menu_upload.hint": "PNG, JPG, WebP or PDF — up to 20 files.",
    "onboarding.menu_upload.add_more": "Add more files",
    "onboarding.menu_upload.extract": "Build my menu",
    "onboarding.menu_upload.extracting": "Reading your menu…",
    "onboarding.menu_upload.extracting_hint":
      "Pulling out your sections, items and prices.",
    "onboarding.menu_upload.manual_fallback": "I'll add items manually instead",
    "onboarding.menu_upload.too_many":
      "Up to 20 files — remove one to add another.",
    "onboarding.menu_upload.too_large":
      "That file is over 12 MB — pick a smaller one.",
    "onboarding.menu_upload.too_large_total":
      "These photos are too large together — remove one or use smaller photos.",
    "onboarding.menu_upload.empty": "Add at least one photo or PDF first.",
    "onboarding.menu_upload.network_error":
      "Couldn't read the menu. Check your connection and try again.",

    "onboarding.sections.title": "Your menu sections",
    "onboarding.sections.subtitle_vertical":
      "Here's a starter set — drop what you don't need or add your own.",
    "onboarding.sections.subtitle_bare": "Add the sections your menu needs.",
    "onboarding.sections.suggested_count": "{n} suggested",
    "onboarding.sections.add_placeholder": "Add a section (e.g. Desserts)",

    "onboarding.items.title": "Your first items",
    "onboarding.items.subtitle":
      "Keep our prices or set yours — everything stays editable in your dashboard.",
    "onboarding.items.add_placeholder": "Add an item",
    "onboarding.items.include_aria": "Include {name}",
    "onboarding.items.name_aria": "Item name",
    "onboarding.items.price_aria": "Price",
    "onboarding.items.sizes_label": "Sizes",
    "onboarding.items.add_ons_label": "Add-ons",

    "onboarding.country.title": "Where are you based?",
    "onboarding.country.subtitle":
      "We'll set your currency to match — you can fine-tune it next.",
    "onboarding.country.currency_hint":
      "Currency set to {currency} — adjust it on the next step.",

    "onboarding.currency.title": "What currency?",
    "onboarding.currency.subtitle":
      "Shown on every price across your shop. Switch it for any country.",
    "onboarding.currency.sample_label": "Live sample",
    "onboarding.currency.symbol": "Symbol",
    "onboarding.currency.position": "Position",
    "onboarding.currency.before": "Before",
    "onboarding.currency.after": "After",
    "onboarding.currency.decimals": "Decimals",
    "onboarding.currency.on": "On",
    "onboarding.currency.off": "Off",
    "onboarding.currency.thousands": "Thousands",
    "onboarding.currency.space": "Space",

    "onboarding.modes.title": "How do customers order?",
    "onboarding.modes.subtitle": "Pick what you serve — or just show a catalog.",
    "onboarding.modes.at_least_one":
      "Pick at least one way to order, or choose catalog-only.",
    "onboarding.modes.or": "OR",
    "onboarding.modes.dine_in.label": "Dine-in",
    "onboarding.modes.dine_in.hint": "QR on the table, orders to the kitchen",
    "onboarding.modes.pickup.label": "Pickup",
    "onboarding.modes.pickup.hint": "Customers order ahead and collect",
    "onboarding.modes.delivery.label": "Delivery",
    "onboarding.modes.delivery.hint": "You bring it to them",
    "onboarding.modes.browse_only.label": "Just a catalog",
    "onboarding.modes.browse_only.hint": "Showcase the menu — no cart, browse only",

    "onboarding.tables.title": "How many tables?",
    "onboarding.tables.subtitle":
      "We'll prepare a printable QR code for each table.",
    "onboarding.tables.card_title": "Tables at your venue",
    "onboarding.tables.card_hint": "You can add, rename or remove tables later.",
    "onboarding.tables.fewer_aria": "Fewer tables",
    "onboarding.tables.more_aria": "More tables",

    "onboarding.languages.title": "Menu languages",
    "onboarding.languages.subtitle":
      "Suggested items ship translated in Russian, Uzbek and English. Other languages can be translated later in your dashboard.",
    "onboarding.languages.default_badge": "Default",
    "onboarding.languages.make_default": "Make default",

    "onboarding.alerts.title": "Where should new orders find you?",
    "onboarding.alerts.subtitle":
      "Pick how you'll hear about an order — you'll set it up in a moment.",
    "onboarding.alerts.telegram.label": "Telegram",
    "onboarding.alerts.telegram.hint":
      "A ping on your phone the second an order lands",
    "onboarding.alerts.dashboard.label": "I'll check the dashboard",
    "onboarding.alerts.dashboard.hint": "See new orders when you open Krafta",

    "onboarding.phone.title": "How can customers reach you?",
    "onboarding.phone.subtitle":
      "Optional — a phone number makes the shop feel open for business.",
    "onboarding.phone.label": "Phone",
    "onboarding.phone.placeholder": "+998 90 123 45 67",

    "onboarding.city.title": "Where is your shop?",
    "onboarding.city.subtitle": "Optional — so nearby customers can find you.",
    "onboarding.city.other_chip": "Other city",
    "onboarding.city.custom_label": "City",
    "onboarding.city.custom_placeholder": "Khiva",
    "onboarding.city.create": "Create my shop",
    "onboarding.city.creating": "Setting up your shop…",

    "onboarding.building.title": "Setting up your shop",
    "onboarding.building.subtitle": "A few seconds — don't close this tab.",
    "onboarding.building.stage_shop": "Creating your shop…",
    "onboarding.building.stage_menu": "Building your menu…",
    "onboarding.building.stage_translate": "Translating your items…",
    "onboarding.building.stage_tables": "Preparing table QR codes…",
    "onboarding.building.stage_almost": "Almost there…",

    "onboarding.reveal.title": "{name} — all set",
    "onboarding.reveal.subtitle":
      "This is what your customers will see. Everything stays editable.",
    "onboarding.reveal.cta": "Open my dashboard",
    "onboarding.reveal.alerts_cta": "Set up order alerts in Telegram",
    "onboarding.reveal.preview_title": "Your storefront preview",

    "onboarding.submit_network_error":
      "We couldn't set up your shop. Check your connection and try again.",

    "onboarding.err.shop_type_unknown": "Unknown shop type.",
    "onboarding.err.suggestions_unavailable": "Suggestions unavailable.",
    "onboarding.err.form_generic": "Check the form and try again.",
    "onboarding.err.menu_too_big":
      "That's a huge menu — keep it under 1000 items for now.",
    "onboarding.err.create_failed":
      "We couldn't create your shop just now. Check your connection and try again.",
    "onboarding.err.setup_failed": "We couldn't set up your shop. Try again.",
    "onboarding.err.vertical_unrecognized": "That shop type isn't recognized.",
    "onboarding.err.name_required": "Give your shop a name.",
    "onboarding.err.name_too_long":
      "Your shop name is too long — keep it under 80 characters.",
    "onboarding.err.modes_min": "Pick at least one way for customers to order.",
    "onboarding.err.tables_max": "You can set up to 50 tables.",
    "onboarding.err.locales_min": "Pick at least one language.",
    "onboarding.err.locales_max": "You can add up to 6 languages.",
    "onboarding.err.locale_one_default": "Pick one default language.",
    "onboarding.err.locale_duplicate": "You added the same language twice.",
    "onboarding.err.locale_unsupported":
      "One of the chosen languages isn't supported yet.",
    "onboarding.err.phone_too_long": "That phone number looks too long.",
    "onboarding.err.city_too_long": "That city name is too long.",

    "onboarding.menu_err.session_failed":
      "Couldn't start a session — please reload and try again.",
    "onboarding.menu_err.file_too_large": "Each file must be under 12 MB.",
    "onboarding.menu_err.bad_type": "Upload photos (PNG, JPG, WebP, HEIC) or a PDF.",
    "onboarding.menu_err.no_files": "Add at least one photo or PDF of your menu.",
    "onboarding.menu_err.no_items":
      "We couldn't find any items. Try a clearer photo, or add them manually.",
    "onboarding.menu_err.read_failed": "Couldn't read the menu: {msg}",
  },
  ru: {
    "onboarding.meta_title": "Создайте магазин — Krafta",

    "onboarding.progress_label": "Прогресс настройки",
    "onboarding.cancel_add": "Отменить добавление",
    "onboarding.remove_named": "Удалить {name}",
    "onboarding.skip_for_now": "Пропустить",

    "onboarding.type.title": "Что вы открываете?",
    "onboarding.type.subtitle":
      "Предложим стартовое меню — вы настроите его на следующих шагах.",

    "onboarding.vertical.cafe.label": "Кафе",
    "onboarding.vertical.cafe.desc": "Кофе, выпечка, выдача у стойки",
    "onboarding.vertical.restaurant.label": "Ресторан",
    "onboarding.vertical.restaurant.desc":
      "Меню в зале, заказы со столика, доставка",
    "onboarding.vertical.retail.label": "Магазин",
    "onboarding.vertical.retail.desc": "Товары с размерами и вариантами",

    "onboarding.name.title": "Название магазина",
    "onboarding.name.subtitle":
      "Это название увидят покупатели. Его можно изменить в любой момент.",
    "onboarding.name.label": "Название",
    "onboarding.name.placeholder": "Чайхана №1",

    "onboarding.logo.title": "Добавьте логотип",
    "onboarding.logo.subtitle":
      "Необязательно — логотип отображается вверху витрины. Пропустите — поставим заглушку, которую можно заменить в любой момент.",
    "onboarding.logo.pick": "Загрузить логотип",
    "onboarding.logo.hint": "PNG, JPG или WebP — лучше всего смотрится квадрат.",
    "onboarding.logo.replace": "Заменить",
    "onboarding.logo.preview_aria": "Предпросмотр выбранного логотипа",
    "onboarding.logo.too_large": "Изображение больше 5 МБ — выберите меньше.",

    "onboarding.menu_method.title": "Как соберём меню?",
    "onboarding.menu_method.subtitle":
      "Начните с готового меню или соберите вручную. В обоих случаях всё можно отредактировать.",
    "onboarding.menu_method.upload.label": "Загрузить файлы",
    "onboarding.menu_method.upload.hint":
      "Фото, скриншот или PDF — за секунды превратим в каталог.",
    "onboarding.menu_method.manual.label": "Вручную",
    "onboarding.menu_method.manual.hint":
      "Выберите из стартового меню и добавьте позиции сами.",

    "onboarding.menu_upload.title": "Загрузите меню",
    "onboarding.menu_upload.subtitle":
      "Добавьте чёткие фото, скриншоты или PDF. Несколько страниц — не проблема, прочитаем как одно меню.",
    "onboarding.menu_upload.pick": "Добавить файлы",
    "onboarding.menu_upload.hint": "PNG, JPG, WebP или PDF — до 20 файлов.",
    "onboarding.menu_upload.add_more": "Добавить ещё файлы",
    "onboarding.menu_upload.extract": "Собрать меню",
    "onboarding.menu_upload.extracting": "Читаем меню…",
    "onboarding.menu_upload.extracting_hint":
      "Выделяем разделы, позиции и цены.",
    "onboarding.menu_upload.manual_fallback": "Лучше добавлю позиции вручную",
    "onboarding.menu_upload.too_many":
      "Не больше 20 файлов — удалите один, чтобы добавить новый.",
    "onboarding.menu_upload.too_large": "Файл больше 12 МБ — выберите меньше.",
    "onboarding.menu_upload.too_large_total":
      "Фотографии слишком большие вместе — удалите одну или используйте меньшего размера.",
    "onboarding.menu_upload.empty": "Сначала добавьте хотя бы одно фото или PDF.",
    "onboarding.menu_upload.network_error":
      "Не удалось прочитать меню. Проверьте соединение и попробуйте снова.",

    "onboarding.sections.title": "Разделы меню",
    "onboarding.sections.subtitle_vertical":
      "Вот стартовый набор — уберите лишнее или добавьте своё.",
    "onboarding.sections.subtitle_bare": "Добавьте нужные разделы меню.",
    "onboarding.sections.suggested_count": "{n} предложено",
    "onboarding.sections.add_placeholder": "Добавить раздел (напр. Десерты)",

    "onboarding.items.title": "Первые позиции",
    "onboarding.items.subtitle":
      "Оставьте наши цены или задайте свои — всё можно изменить в панели.",
    "onboarding.items.add_placeholder": "Добавить позицию",
    "onboarding.items.include_aria": "Включить {name}",
    "onboarding.items.name_aria": "Название позиции",
    "onboarding.items.price_aria": "Цена",
    "onboarding.items.sizes_label": "Размеры",
    "onboarding.items.add_ons_label": "Дополнения",

    "onboarding.country.title": "Где вы находитесь?",
    "onboarding.country.subtitle":
      "Подберём валюту под вашу страну — уточните её на следующем шаге.",
    "onboarding.country.currency_hint":
      "Валюта: {currency} — изменить можно на следующем шаге.",

    "onboarding.currency.title": "Какая валюта?",
    "onboarding.currency.subtitle":
      "Отображается во всех ценах магазина. Подходит для любой страны.",
    "onboarding.currency.sample_label": "Пример",
    "onboarding.currency.symbol": "Символ",
    "onboarding.currency.position": "Расположение",
    "onboarding.currency.before": "Слева",
    "onboarding.currency.after": "Справа",
    "onboarding.currency.decimals": "Десятичные",
    "onboarding.currency.on": "Вкл.",
    "onboarding.currency.off": "Выкл.",
    "onboarding.currency.thousands": "Разделитель",
    "onboarding.currency.space": "Пробел",

    "onboarding.modes.title": "Как клиенты делают заказ?",
    "onboarding.modes.subtitle":
      "Выберите, как вы работаете — или просто покажите каталог.",
    "onboarding.modes.at_least_one":
      "Выберите хотя бы один способ заказа или только каталог.",
    "onboarding.modes.or": "ИЛИ",
    "onboarding.modes.dine_in.label": "В зале",
    "onboarding.modes.dine_in.hint": "QR на столе, заказы на кухню",
    "onboarding.modes.pickup.label": "Самовывоз",
    "onboarding.modes.pickup.hint": "Клиенты заказывают заранее и забирают",
    "onboarding.modes.delivery.label": "Доставка",
    "onboarding.modes.delivery.hint": "Вы привозите заказ",
    "onboarding.modes.browse_only.label": "Просто каталог",
    "onboarding.modes.browse_only.hint":
      "Показать меню — без корзины, только просмотр",

    "onboarding.tables.title": "Сколько столиков?",
    "onboarding.tables.subtitle":
      "Подготовим QR-код для печати на каждый столик.",
    "onboarding.tables.card_title": "Столики в заведении",
    "onboarding.tables.card_hint":
      "Столики можно добавить, переименовать или удалить позже.",
    "onboarding.tables.fewer_aria": "Меньше столиков",
    "onboarding.tables.more_aria": "Больше столиков",

    "onboarding.languages.title": "Языки меню",
    "onboarding.languages.subtitle":
      "Предложенные позиции уже переведены на русский, узбекский и английский. Другие языки можно перевести позже в панели.",
    "onboarding.languages.default_badge": "Основной",
    "onboarding.languages.make_default": "Сделать основным",

    "onboarding.alerts.title": "Куда присылать новые заказы?",
    "onboarding.alerts.subtitle":
      "Выберите, как узнавать о заказе — настроим через минуту.",
    "onboarding.alerts.telegram.label": "Telegram",
    "onboarding.alerts.telegram.hint": "Уведомление на телефон в момент заказа",
    "onboarding.alerts.dashboard.label": "Буду смотреть в панели",
    "onboarding.alerts.dashboard.hint": "Новые заказы видны при входе в Krafta",

    "onboarding.phone.title": "Как с вами связаться?",
    "onboarding.phone.subtitle":
      "Необязательно — номер телефона показывает, что магазин работает.",
    "onboarding.phone.label": "Телефон",
    "onboarding.phone.placeholder": "+998 90 123 45 67",

    "onboarding.city.title": "Где находится магазин?",
    "onboarding.city.subtitle":
      "Необязательно — чтобы клиенты рядом могли вас найти.",
    "onboarding.city.other_chip": "Другой город",
    "onboarding.city.custom_label": "Город",
    "onboarding.city.custom_placeholder": "Хива",
    "onboarding.city.create": "Создать магазин",
    "onboarding.city.creating": "Настраиваем магазин…",

    "onboarding.building.title": "Настраиваем магазин",
    "onboarding.building.subtitle": "Несколько секунд — не закрывайте вкладку.",
    "onboarding.building.stage_shop": "Создаём магазин…",
    "onboarding.building.stage_menu": "Собираем меню…",
    "onboarding.building.stage_translate": "Переводим позиции…",
    "onboarding.building.stage_tables": "Готовим QR-коды для столиков…",
    "onboarding.building.stage_almost": "Почти готово…",

    "onboarding.reveal.title": "{name} — всё готово",
    "onboarding.reveal.subtitle":
      "Вот что увидят ваши клиенты. Всё можно изменить.",
    "onboarding.reveal.cta": "Открыть панель",
    "onboarding.reveal.alerts_cta": "Настроить уведомления в Telegram",
    "onboarding.reveal.preview_title": "Предпросмотр витрины",

    "onboarding.submit_network_error":
      "Не удалось настроить магазин. Проверьте соединение и попробуйте снова.",

    "onboarding.err.shop_type_unknown": "Неизвестный тип магазина.",
    "onboarding.err.suggestions_unavailable": "Подсказки недоступны.",
    "onboarding.err.form_generic": "Проверьте форму и попробуйте снова.",
    "onboarding.err.menu_too_big":
      "Очень большое меню — пока оставьте до 1000 позиций.",
    "onboarding.err.create_failed":
      "Не удалось создать магазин. Проверьте соединение и попробуйте снова.",
    "onboarding.err.setup_failed":
      "Не удалось настроить магазин. Попробуйте снова.",
    "onboarding.err.vertical_unrecognized": "Такой тип магазина не распознан.",
    "onboarding.err.name_required": "Укажите название магазина.",
    "onboarding.err.name_too_long":
      "Название слишком длинное — до 80 символов.",
    "onboarding.err.modes_min": "Выберите хотя бы один способ заказа.",
    "onboarding.err.tables_max": "Можно указать до 50 столиков.",
    "onboarding.err.locales_min": "Выберите хотя бы один язык.",
    "onboarding.err.locales_max": "Можно добавить до 6 языков.",
    "onboarding.err.locale_one_default": "Выберите один основной язык.",
    "onboarding.err.locale_duplicate": "Вы добавили один и тот же язык дважды.",
    "onboarding.err.locale_unsupported":
      "Один из выбранных языков пока не поддерживается.",
    "onboarding.err.phone_too_long": "Номер телефона слишком длинный.",
    "onboarding.err.city_too_long": "Название города слишком длинное.",

    "onboarding.menu_err.session_failed":
      "Не удалось начать сессию — обновите страницу и попробуйте снова.",
    "onboarding.menu_err.file_too_large": "Каждый файл должен быть меньше 12 МБ.",
    "onboarding.menu_err.bad_type":
      "Загрузите фото (PNG, JPG, WebP, HEIC) или PDF.",
    "onboarding.menu_err.no_files":
      "Добавьте хотя бы одно фото или PDF меню.",
    "onboarding.menu_err.no_items":
      "Не нашли ни одной позиции. Попробуйте более чёткое фото или добавьте вручную.",
    "onboarding.menu_err.read_failed": "Не удалось прочитать меню: {msg}",
  },
  "uz-Latn": {
    "onboarding.meta_title": "Do‘koningizni yarating — Krafta",

    "onboarding.progress_label": "Sozlash jarayoni",
    "onboarding.cancel_add": "Qo‘shishni bekor qilish",
    "onboarding.remove_named": "{name}ni olib tashlash",
    "onboarding.skip_for_now": "Hozircha o‘tkazib yuborish",

    "onboarding.type.title": "Nima ochyapsiz?",
    "onboarding.type.subtitle":
      "Boshlang‘ich menyu taklif qilamiz — keyingi qadamlarda uni sozlaysiz.",

    "onboarding.vertical.cafe.label": "Kafe",
    "onboarding.vertical.cafe.desc": "Kofe, pishiriqlar, peshtaxtadan olib ketish",
    "onboarding.vertical.restaurant.label": "Restoran",
    "onboarding.vertical.restaurant.desc":
      "Zalda menyu, stoldan buyurtma, yetkazib berish",
    "onboarding.vertical.retail.label": "Do‘kon",
    "onboarding.vertical.retail.desc": "O‘lcham va variantlarga ega mahsulotlar",

    "onboarding.name.title": "Do‘koningiz nomi",
    "onboarding.name.subtitle":
      "Bu nomni mijozlar ko‘radi. Uni istalgan vaqtda o‘zgartirishingiz mumkin.",
    "onboarding.name.label": "Nomi",
    "onboarding.name.placeholder": "Choyxona №1",

    "onboarding.logo.title": "Logotip qo‘shing",
    "onboarding.logo.subtitle":
      "Ixtiyoriy — logotip vitrinangiz tepasida ko‘rinadi. O‘tkazib yuborsangiz, istalgan vaqtda almashtira oladigan vaqtinchalik rasm qo‘yamiz.",
    "onboarding.logo.pick": "Logotip yuklash",
    "onboarding.logo.hint": "PNG, JPG yoki WebP — kvadrat rasm eng chiroyli ko‘rinadi.",
    "onboarding.logo.replace": "Almashtirish",
    "onboarding.logo.preview_aria": "Tanlangan logotip ko‘rinishi",
    "onboarding.logo.too_large": "Rasm 5 MB dan katta — kichikroqini tanlang.",

    "onboarding.menu_method.title": "Menyuni qanday tuzamiz?",
    "onboarding.menu_method.subtitle":
      "Tayyor menyudan boshlang yoki qo‘lda tuzing. Har ikkalasida ham hammasini tahrirlash mumkin.",
    "onboarding.menu_method.upload.label": "Fayllarni yuklash",
    "onboarding.menu_method.upload.hint":
      "Foto, skrinshot yoki PDF — bir necha soniyada katalogga aylantiramiz.",
    "onboarding.menu_method.manual.label": "Qo‘lda",
    "onboarding.menu_method.manual.hint":
      "Boshlang‘ich menyudan tanlang va mahsulotlarni o‘zingiz qo‘shing.",

    "onboarding.menu_upload.title": "Menyuni yuklang",
    "onboarding.menu_upload.subtitle":
      "Aniq foto, skrinshot yoki PDF qo‘shing. Bir nechta sahifa bo‘lsa ham mayli — ularni yagona menyu sifatida o‘qiymiz.",
    "onboarding.menu_upload.pick": "Fayl qo‘shish",
    "onboarding.menu_upload.hint": "PNG, JPG, WebP yoki PDF — 20 tagacha fayl.",
    "onboarding.menu_upload.add_more": "Yana fayl qo‘shish",
    "onboarding.menu_upload.extract": "Menyuni tuzish",
    "onboarding.menu_upload.extracting": "Menyuni o‘qiyapmiz…",
    "onboarding.menu_upload.extracting_hint":
      "Bo‘limlar, mahsulotlar va narxlarni ajratyapmiz.",
    "onboarding.menu_upload.manual_fallback":
      "Yaxshisi mahsulotlarni qo‘lda qo‘shaman",
    "onboarding.menu_upload.too_many":
      "20 tadan ko‘p emas — yangisini qo‘shish uchun bittasini olib tashlang.",
    "onboarding.menu_upload.too_large": "Fayl 12 MB dan katta — kichikroqini tanlang.",
    "onboarding.menu_upload.too_large_total":
      "Rasmlar birgalikda juda katta — bittasini olib tashlang yoki kichikroqlarini ishlating.",
    "onboarding.menu_upload.empty": "Avval kamida bitta foto yoki PDF qo‘shing.",
    "onboarding.menu_upload.network_error":
      "Menyuni o‘qib bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring.",

    "onboarding.sections.title": "Menyu bo‘limlari",
    "onboarding.sections.subtitle_vertical":
      "Mana boshlang‘ich to‘plam — keraksizini olib tashlang yoki o‘zingiznikini qo‘shing.",
    "onboarding.sections.subtitle_bare": "Menyuingizga kerakli bo‘limlarni qo‘shing.",
    "onboarding.sections.suggested_count": "{n} ta taklif",
    "onboarding.sections.add_placeholder": "Bo‘lim qo‘shish (masalan, Shirinliklar)",

    "onboarding.items.title": "Birinchi mahsulotlar",
    "onboarding.items.subtitle":
      "Bizning narxlarni qoldiring yoki o‘zingiznikini kiriting — hammasini boshqaruv panelida o‘zgartirish mumkin.",
    "onboarding.items.add_placeholder": "Mahsulot qo‘shish",
    "onboarding.items.include_aria": "{name}ni qo‘shish",
    "onboarding.items.name_aria": "Mahsulot nomi",
    "onboarding.items.price_aria": "Narx",
    "onboarding.items.sizes_label": "O‘lchamlar",
    "onboarding.items.add_ons_label": "Qo‘shimchalar",

    "onboarding.country.title": "Qayerdasiz?",
    "onboarding.country.subtitle":
      "Valyutani mamlakatingizga moslab tanlaymiz — keyingi qadamda aniqlashtirasiz.",
    "onboarding.country.currency_hint":
      "Valyuta: {currency} — keyingi qadamda o‘zgartirishingiz mumkin.",

    "onboarding.currency.title": "Qaysi valyuta?",
    "onboarding.currency.subtitle":
      "Do‘koningizdagi barcha narxlarda ko‘rinadi. Istalgan mamlakat uchun almashtiring.",
    "onboarding.currency.sample_label": "Namuna",
    "onboarding.currency.symbol": "Belgi",
    "onboarding.currency.position": "Joylashuvi",
    "onboarding.currency.before": "Chapda",
    "onboarding.currency.after": "O‘ngda",
    "onboarding.currency.decimals": "Kasr qismi",
    "onboarding.currency.on": "Yoniq",
    "onboarding.currency.off": "O‘chiq",
    "onboarding.currency.thousands": "Ajratgich",
    "onboarding.currency.space": "Bo‘sh joy",

    "onboarding.modes.title": "Mijozlar qanday buyurtma beradi?",
    "onboarding.modes.subtitle":
      "Qanday ishlashingizni tanlang — yoki shunchaki katalogni ko‘rsating.",
    "onboarding.modes.at_least_one":
      "Kamida bitta buyurtma usulini yoki faqat katalogni tanlang.",
    "onboarding.modes.or": "YOKI",
    "onboarding.modes.dine_in.label": "Zalda",
    "onboarding.modes.dine_in.hint": "Stolda QR, buyurtmalar oshxonaga",
    "onboarding.modes.pickup.label": "Olib ketish",
    "onboarding.modes.pickup.hint": "Mijozlar oldindan buyurtma berib, olib ketishadi",
    "onboarding.modes.delivery.label": "Yetkazib berish",
    "onboarding.modes.delivery.hint": "Buyurtmani o‘zingiz yetkazasiz",
    "onboarding.modes.browse_only.label": "Faqat katalog",
    "onboarding.modes.browse_only.hint": "Menyuni ko‘rsatish — savatsiz, faqat ko‘rish",

    "onboarding.tables.title": "Nechta stol?",
    "onboarding.tables.subtitle":
      "Har bir stol uchun chop etsa bo‘ladigan QR-kod tayyorlaymiz.",
    "onboarding.tables.card_title": "Joyingizdagi stollar",
    "onboarding.tables.card_hint":
      "Stollarni keyinroq qo‘shish, nomini o‘zgartirish yoki o‘chirish mumkin.",
    "onboarding.tables.fewer_aria": "Kamroq stol",
    "onboarding.tables.more_aria": "Ko‘proq stol",

    "onboarding.languages.title": "Menyu tillari",
    "onboarding.languages.subtitle":
      "Taklif etilgan mahsulotlar rus, o‘zbek va ingliz tillariga tarjima qilingan. Boshqa tillarni keyinroq boshqaruv panelida tarjima qilishingiz mumkin.",
    "onboarding.languages.default_badge": "Asosiy",
    "onboarding.languages.make_default": "Asosiy qilish",

    "onboarding.alerts.title": "Yangi buyurtmalar qayerga kelsin?",
    "onboarding.alerts.subtitle":
      "Buyurtma haqida qanday xabar olishni tanlang — hozir sozlaymiz.",
    "onboarding.alerts.telegram.label": "Telegram",
    "onboarding.alerts.telegram.hint":
      "Buyurtma tushishi bilan telefoningizga bildirishnoma",
    "onboarding.alerts.dashboard.label": "Panelda ko‘rib turaman",
    "onboarding.alerts.dashboard.hint":
      "Yangi buyurtmalar Krafta’ga kirganda ko‘rinadi",

    "onboarding.phone.title": "Siz bilan qanday bog‘lanish mumkin?",
    "onboarding.phone.subtitle":
      "Ixtiyoriy — telefon raqami do‘kon ochiq ekanini bildiradi.",
    "onboarding.phone.label": "Telefon",
    "onboarding.phone.placeholder": "+998 90 123 45 67",

    "onboarding.city.title": "Do‘koningiz qayerda?",
    "onboarding.city.subtitle":
      "Ixtiyoriy — yaqin atrofdagi mijozlar sizni topishi uchun.",
    "onboarding.city.other_chip": "Boshqa shahar",
    "onboarding.city.custom_label": "Shahar",
    "onboarding.city.custom_placeholder": "Xiva",
    "onboarding.city.create": "Do‘konni yaratish",
    "onboarding.city.creating": "Do‘kon sozlanmoqda…",

    "onboarding.building.title": "Do‘koningiz sozlanmoqda",
    "onboarding.building.subtitle": "Bir necha soniya — bu oynani yopmang.",
    "onboarding.building.stage_shop": "Do‘kon yaratilmoqda…",
    "onboarding.building.stage_menu": "Menyu tuzilmoqda…",
    "onboarding.building.stage_translate": "Mahsulotlar tarjima qilinmoqda…",
    "onboarding.building.stage_tables": "Stollar uchun QR-kodlar tayyorlanmoqda…",
    "onboarding.building.stage_almost": "Deyarli tayyor…",

    "onboarding.reveal.title": "{name} tayyor",
    "onboarding.reveal.subtitle":
      "Mijozlaringiz mana shuni ko‘radi. Hammasini o‘zgartirish mumkin.",
    "onboarding.reveal.cta": "Boshqaruv panelini ochish",
    "onboarding.reveal.alerts_cta":
      "Telegram’da buyurtma bildirishnomalarini sozlash",
    "onboarding.reveal.preview_title": "Vitrina ko‘rinishi",

    "onboarding.submit_network_error":
      "Do‘konni sozlab bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring.",

    "onboarding.err.shop_type_unknown": "Noma'lum do‘kon turi.",
    "onboarding.err.suggestions_unavailable": "Tavsiyalar mavjud emas.",
    "onboarding.err.form_generic": "Formani tekshirib, qayta urinib ko‘ring.",
    "onboarding.err.menu_too_big":
      "Menyu juda katta — hozircha 1000 tagacha mahsulot qoldiring.",
    "onboarding.err.create_failed":
      "Hozir do‘konni yaratib bo‘lmadi. Aloqani tekshirib, qayta urinib ko‘ring.",
    "onboarding.err.setup_failed":
      "Do‘konni sozlab bo‘lmadi. Qayta urinib ko‘ring.",
    "onboarding.err.vertical_unrecognized": "Bunday do‘kon turi tanilmadi.",
    "onboarding.err.name_required": "Do‘koningizga nom bering.",
    "onboarding.err.name_too_long": "Nom juda uzun — 80 belgigacha bo‘lsin.",
    "onboarding.err.modes_min": "Kamida bitta buyurtma usulini tanlang.",
    "onboarding.err.tables_max": "50 tagacha stol belgilash mumkin.",
    "onboarding.err.locales_min": "Kamida bitta tilni tanlang.",
    "onboarding.err.locales_max": "6 tagacha til qo‘shish mumkin.",
    "onboarding.err.locale_one_default": "Bitta asosiy tilni tanlang.",
    "onboarding.err.locale_duplicate": "Bir xil tilni ikki marta qo‘shdingiz.",
    "onboarding.err.locale_unsupported":
      "Tanlangan tillardan biri hali qo‘llab-quvvatlanmaydi.",
    "onboarding.err.phone_too_long": "Telefon raqami juda uzun.",
    "onboarding.err.city_too_long": "Shahar nomi juda uzun.",

    "onboarding.menu_err.session_failed":
      "Sessiyani boshlab bo‘lmadi — sahifani yangilab, qayta urinib ko‘ring.",
    "onboarding.menu_err.file_too_large": "Har bir fayl 12 MB dan kichik bo‘lishi kerak.",
    "onboarding.menu_err.bad_type": "Foto (PNG, JPG, WebP, HEIC) yoki PDF yuklang.",
    "onboarding.menu_err.no_files":
      "Menyuning kamida bitta foto yoki PDF faylini qo‘shing.",
    "onboarding.menu_err.no_items":
      "Hech qanday mahsulot topilmadi. Aniqroq foto sinab ko‘ring yoki qo‘lda qo‘shing.",
    "onboarding.menu_err.read_failed": "Menyuni o‘qib bo‘lmadi: {msg}",
  },
};
