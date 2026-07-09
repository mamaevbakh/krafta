/**
 * studio — dashboard "studio" surface strings.
 *
 * Contract: export { en, ru, "uz-Latn" } objects of flat dotted keys prefixed
 * "studio.". English is canonical (defines the key union); ru / uz-Latn are
 * type-checked against it in ../catalog.ts. Use {var} placeholders for runtime
 * values. See ./common.ts for the full contract.
 */

export const studio = {
  en: {
    // Layout variant labels (rendered in the Structure/Cards inspectors)
    "studio.section_basic": "Basic",
    "studio.section_separated": "Separated",
    "studio.section_pill_tabs": "Pill Tabs",
    "studio.card_big_photo": "Big Photo",
    "studio.card_photo_row": "Photo Row",
    "studio.card_minimal": "Minimal",
    "studio.card_default": "Default",
    "studio.card_glass_blur": "Glass Blur",
    "studio.card_row_compact": "Compact Row",
    "studio.nav_sticky_tabs": "Sticky Tabs",
    "studio.nav_sticky_tabs_motion": "Sticky Tabs (Motion)",
    "studio.nav_sticky_tabs_dashboard": "Sticky Tabs (Dashboard)",
    "studio.nav_hidden": "Hidden",
    "studio.catalog_not_found": "Catalog not found for studio preview.",

    // Section switcher + inspector intros
    "studio.focus_structure": "Structure",
    "studio.focus_cards": "Cards",
    "studio.focus_brand": "Brand",
    "studio.focus_pricing": "Pricing",
    "studio.focus_cart": "Cart",
    "studio.focus_assistant": "Krafta Studio",
    "studio.structure_intro":
      "Control how the catalog is arranged before people start reading items.",
    "studio.cards_intro":
      "Tune layout and item presentation without opening several separate blocks.",
    "studio.brand_intro":
      "Token-based styling for the public catalog. These controls mirror the redesign now and backend persistence can follow later.",
    "studio.pricing_intro":
      "Format item prices and see the result update immediately.",
    "studio.cart_intro":
      "Ordering is on by default. Switch off for a browse-only menu.",
    "studio.sections_title": "Studio sections",
    "studio.sections_desc":
      "Move across structure, cards, brand, and pricing without growing the page into one long form.",
    "studio.beta": "Beta",

    // Header / save area
    "studio.open_preview": "Open preview",

    // Toasts + errors
    "studio.save_failed": "Failed to save layout",
    "studio.unknown_error": "Unknown error",
    "studio.changes_saved": "Studio changes saved",
    "studio.banner_upload_failed_generic": "Failed to upload banner image.",
    "studio.banner_light_uploaded": "Light banner uploaded",
    "studio.banner_dark_uploaded": "Dark banner uploaded",
    "studio.banner_upload_failed": "Banner upload failed",
    "studio.unknown_upload_error": "Unknown upload error",

    // Structure inspector
    "studio.field_header": "Header",
    "studio.field_section_style": "Section style",
    "studio.field_navigation": "Navigation",
    "studio.field_navigation_hint":
      "Choose how categories appear at the top of the public catalog.",
    "studio.nav_desc_tabs": "Classic category pills",
    "studio.nav_desc_tabs_motion": "Animated active pill",
    "studio.nav_desc_tabs_dashboard": "Underline treatment, closer to Studio",
    "studio.nav_desc_none": "No category bar",
    "studio.nav_desc_fallback": "Switch navigation behavior",
    "studio.state_active": "Active",
    "studio.state_switch": "Switch",

    // Compact header labels
    "studio.header_basic": "Basic",
    "studio.header_free_logo": "Free Logo",
    "studio.header_center": "Center",
    "studio.header_hero": "Hero",

    // Item detail
    "studio.item_detail_fullscreen": "Fullscreen",

    // Cards inspector
    "studio.field_card_family": "Card family",
    "studio.field_columns": "Columns",
    "studio.field_aspect_ratio": "Aspect ratio",
    "studio.field_aspect_width": "Aspect width",
    "studio.field_aspect_height": "Aspect height",
    "studio.field_item_detail": "Item detail",
    "studio.field_card_preview": "Card preview",
    "studio.card_surfaces_map_to": "Current card surfaces map to:",

    // Brand inspector
    "studio.field_core_tokens": "Core tokens",
    "studio.field_core_tokens_hint":
      "Frontend-only for now. These values help us stage the redesigned Brand panel before backend settings land.",
    "studio.brand_page_background": "Page background",
    "studio.brand_page_background_desc": "Base catalog canvas color.",
    "studio.brand_page_background_maps": "Maps to `background`",
    "studio.brand_card_surface": "Card surface",
    "studio.brand_card_surface_desc": "Primary product card body.",
    "studio.brand_card_surface_maps": "Maps to `card`",
    "studio.brand_muted_surface": "Muted surface",
    "studio.brand_muted_surface_desc":
      "Used for quiet surfaces and image placeholders.",
    "studio.brand_muted_surface_maps": "Maps to `muted`",
    "studio.brand_primary_text": "Primary text",
    "studio.brand_primary_text_desc": "Main reading color for titles and prices.",
    "studio.brand_primary_text_maps": "Maps to `foreground` / `card-foreground`",
    "studio.brand_secondary_text": "Secondary text",
    "studio.brand_secondary_text_desc": "Used for helper copy and metadata.",
    "studio.brand_secondary_text_maps": "Maps to `muted-foreground`",
    "studio.brand_border": "Border",
    "studio.brand_border_desc": "Default stroke around cards and controls.",
    "studio.brand_border_maps": "Maps to `border`",
    "studio.field_header_tokens": "Header tokens",
    "studio.field_header_light_bg": "Header light background",
    "studio.field_header_dark_bg": "Header dark background",
    "studio.placeholder_transparent_custom": "transparent / custom",
    "studio.field_logo_radius": "Logo radius",
    "studio.field_logo_ratio": "Logo ratio",
    "studio.field_logo_width": "Logo width",
    "studio.field_logo_height": "Logo height",
    "studio.banner_media": "Banner media",
    "studio.banner_media_hint":
      "Upload light and dark header banners or paste a stored path directly.",
    "studio.banner_light": "Light banner",
    "studio.banner_dark": "Dark banner",
    "studio.logo_preview": "Logo preview",
    "studio.logo_alt_original": "{name} original logo",
    "studio.no_catalog_logo": "No catalog logo in Settings yet",
    "studio.field_header_content": "Header content",
    "studio.field_header_content_hint":
      "These controls are already real and continue to affect the live preview.",
    "studio.show_logo": "Show logo",
    "studio.show_title": "Show title",
    "studio.show_description": "Show description",
    "studio.show_tags": "Show tags",
    "studio.stretch_logo": "Stretch logo",

    // Pricing inspector
    "studio.live_sample": "Live sample",
    "studio.regular_price": "Regular price",
    "studio.sale_price": "{price} sale",
    "studio.field_currency_code": "Currency code",
    "studio.field_currency_label": "Currency label",
    "studio.field_position": "Position",
    "studio.position_before": "Before",
    "studio.position_after": "After",
    "studio.field_decimals": "Decimals",
    "studio.field_thousands": "Thousands",
    "studio.field_decimal": "Decimal",
    "studio.sep_space": "Space",
    "studio.sep_comma": "Comma",
    "studio.sep_dot": "Dot",
    "studio.on": "On",
    "studio.off": "Off",
    "studio.pricing_realtime_note":
      "Changes update the catalog cards on the right in real time.",

    // Cart inspector
    "studio.enable_cart": "Enable cart",
    "studio.enable_cart_desc":
      "Floating cart button + Add-to-cart CTA on item details.",
    "studio.cart_footer_note":
      "On by default. Customers add items and check out using the order modes you enable under Settings → Venue. Turn this off only for a browse-only menu (no cart, no Add-to-cart).",

    // Banner upload field
    "studio.clear": "Clear",
    "studio.no_image_selected": "No image selected",
    "studio.banner_preview_alt": "{label} preview",

    // Preview frame
    "studio.device_desktop": "Desktop",
    "studio.device_tablet": "Tablet",
    "studio.device_mobile": "Mobile",
    "studio.live_preview": "Live preview",
    "studio.live_preview_desc":
      "The inspector on the left updates this preview immediately.",
    "studio.preview_iframe_title": "Catalog preview",

    // AI agent panel (design assistant)
    "studio.agent_suggestion_review": "Review my shop and suggest improvements",
    "studio.agent_suggestion_big_photos": "Switch my product cards to big photos",
    "studio.agent_suggestion_centered_header": "Use a centered header",
    "studio.agent_suggestion_three_columns": "Turn the grid to 3 columns",
    "studio.tool_read_shop": "Read your shop",
    "studio.tool_updated_design": "Updated your design",
    "studio.tool_searched_menu": "Searched your menu",
    "studio.agent_subtitle": "Your AI design partner for {name}",
    "studio.agent_empty_title": "Let's shape your shop",
    "studio.agent_empty_desc":
      "Ask about your layout, categories, branding, or how to merchandise your items. I read your live shop and give advice specific to it.",
    "studio.thinking": "Thinking…",
    "studio.agent_input_placeholder": "Ask Krafta Studio about your shop…",
    "studio.agent_footer_note":
      "Beta · I can restyle your shop — review in preview, then Save.",

    // AI codegen panel (shop builder)
    "studio.codegen_suggestion_dark_minimal": "Make the shop dark and minimal",
    "studio.codegen_suggestion_hero": "Add a hero with a bold headline",
    "studio.codegen_suggestion_larger_cards": "Use larger product cards",
    "studio.codegen_suggestion_about_page": "Add an About page",
    "studio.tool_edited_file": "Edited a file",
    "studio.tool_ran_command": "Ran a command",
    "studio.tool_refreshed_preview": "Refreshed the preview",
    "studio.codegen_subtitle": "Build {name} by describing it — the AI writes the code",
    "studio.codegen_empty_title": "Describe your shop",
    "studio.codegen_empty_desc":
      "Tell me how it should look and what pages it needs. I build it in real code on Krafta's commerce engine, and you'll see it live on the right.",
    "studio.working_on_shop": "Working on your shop…",
    "studio.codegen_input_placeholder": "Describe a change to your shop…",
    "studio.codegen_footer_note": "Beta · the AI edits real code.",
    "studio.live_badge": "Live",
    "studio.published_temp_title":
      "Published to a temporary URL — {target} didn't provision. Click Update to retry.",
    "studio.subdomain_fallback": "subdomain",
    "studio.published_temp_badge": "Published · temporary link",
    "studio.republish_title": "Re-publish the latest version",
    "studio.publish_title": "Publish your shop to the web",
    "studio.publishing": "Publishing…",
    "studio.update": "Update",
    "studio.publish": "Publish",
    "studio.refresh_preview": "Refresh preview",
    "studio.open_new_tab": "Open in a new tab",
    "studio.open_preview_new_tab": "Open preview in a new tab",
    "studio.publish_failed_banner":
      "Publish failed: {error} — click {action} to try again.",
    "studio.publish_generic_error": "Publishing failed. Please try again.",
    "studio.shop_will_appear": "Your shop will appear here",
    "studio.building_shop": "Building your shop…",
    "studio.codegen_preview_hint":
      "Describe a change in the chat and the AI builds it — the live preview shows up here.",
    "studio.codegen_preview_iframe_title": "Live preview of {name}",
    "studio.publish_command":
      "Publish my shop to the web and give me the public link.",
  },
  ru: {
    // Layout variant labels
    "studio.section_basic": "Базовый",
    "studio.section_separated": "С разделителями",
    "studio.section_pill_tabs": "Вкладки-таблетки",
    "studio.card_big_photo": "Большое фото",
    "studio.card_photo_row": "Фото в ряд",
    "studio.card_minimal": "Минимализм",
    "studio.card_default": "По умолчанию",
    "studio.card_glass_blur": "Стекло с размытием",
    "studio.card_row_compact": "Компактный ряд",
    "studio.nav_sticky_tabs": "Закреплённые вкладки",
    "studio.nav_sticky_tabs_motion": "Закреплённые вкладки (анимация)",
    "studio.nav_sticky_tabs_dashboard": "Закреплённые вкладки (Dashboard)",
    "studio.nav_hidden": "Скрыто",
    "studio.catalog_not_found": "Каталог для предпросмотра в Studio не найден.",

    // Section switcher + inspector intros
    "studio.focus_structure": "Структура",
    "studio.focus_cards": "Карточки",
    "studio.focus_brand": "Бренд",
    "studio.focus_pricing": "Цены",
    "studio.focus_cart": "Корзина",
    "studio.focus_assistant": "Krafta Studio",
    "studio.structure_intro":
      "Настройте, как выстроен каталог, прежде чем покупатели начнут читать позиции.",
    "studio.cards_intro":
      "Настройте раскладку и вид позиций, не открывая несколько отдельных блоков.",
    "studio.brand_intro":
      "Оформление публичного каталога на основе токенов. Пока это превью нового дизайна — сохранение на бэкенде добавим позже.",
    "studio.pricing_intro":
      "Форматируйте цены и сразу видите результат.",
    "studio.cart_intro":
      "Заказы включены по умолчанию. Отключите для меню только для просмотра.",
    "studio.sections_title": "Разделы Studio",
    "studio.sections_desc":
      "Переключайтесь между структурой, карточками, брендом и ценами, не превращая страницу в одну длинную форму.",
    "studio.beta": "Бета",

    // Header / save area
    "studio.open_preview": "Открыть предпросмотр",

    // Toasts + errors
    "studio.save_failed": "Не удалось сохранить оформление",
    "studio.unknown_error": "Неизвестная ошибка",
    "studio.changes_saved": "Изменения в Studio сохранены",
    "studio.banner_upload_failed_generic":
      "Не удалось загрузить изображение баннера.",
    "studio.banner_light_uploaded": "Светлый баннер загружен",
    "studio.banner_dark_uploaded": "Тёмный баннер загружен",
    "studio.banner_upload_failed": "Не удалось загрузить баннер",
    "studio.unknown_upload_error": "Неизвестная ошибка загрузки",

    // Structure inspector
    "studio.field_header": "Шапка",
    "studio.field_section_style": "Стиль разделов",
    "studio.field_navigation": "Навигация",
    "studio.field_navigation_hint":
      "Выберите, как категории отображаются вверху публичного каталога.",
    "studio.nav_desc_tabs": "Классические таблетки категорий",
    "studio.nav_desc_tabs_motion": "Анимированная активная таблетка",
    "studio.nav_desc_tabs_dashboard": "Подчёркивание, ближе к стилю Studio",
    "studio.nav_desc_none": "Без панели категорий",
    "studio.nav_desc_fallback": "Сменить поведение навигации",
    "studio.state_active": "Активно",
    "studio.state_switch": "Выбрать",

    // Compact header labels
    "studio.header_basic": "Базовая",
    "studio.header_free_logo": "Свободный логотип",
    "studio.header_center": "По центру",
    "studio.header_hero": "Обложка",

    // Item detail
    "studio.item_detail_fullscreen": "На весь экран",

    // Cards inspector
    "studio.field_card_family": "Тип карточек",
    "studio.field_columns": "Колонки",
    "studio.field_aspect_ratio": "Соотношение сторон",
    "studio.field_aspect_width": "Ширина",
    "studio.field_aspect_height": "Высота",
    "studio.field_item_detail": "Детали позиции",
    "studio.field_card_preview": "Превью карточки",
    "studio.card_surfaces_map_to": "Текущие поверхности карточки соответствуют:",

    // Brand inspector
    "studio.field_core_tokens": "Основные токены",
    "studio.field_core_tokens_hint":
      "Пока только на фронтенде. Эти значения помогают подготовить обновлённую панель бренда до появления настроек на бэкенде.",
    "studio.brand_page_background": "Фон страницы",
    "studio.brand_page_background_desc": "Базовый цвет полотна каталога.",
    "studio.brand_page_background_maps": "Соответствует `background`",
    "studio.brand_card_surface": "Поверхность карточки",
    "studio.brand_card_surface_desc": "Основной фон карточки товара.",
    "studio.brand_card_surface_maps": "Соответствует `card`",
    "studio.brand_muted_surface": "Приглушённая поверхность",
    "studio.brand_muted_surface_desc":
      "Для спокойных поверхностей и заглушек изображений.",
    "studio.brand_muted_surface_maps": "Соответствует `muted`",
    "studio.brand_primary_text": "Основной текст",
    "studio.brand_primary_text_desc":
      "Основной цвет текста для заголовков и цен.",
    "studio.brand_primary_text_maps":
      "Соответствует `foreground` / `card-foreground`",
    "studio.brand_secondary_text": "Второстепенный текст",
    "studio.brand_secondary_text_desc":
      "Для вспомогательного текста и метаданных.",
    "studio.brand_secondary_text_maps": "Соответствует `muted-foreground`",
    "studio.brand_border": "Граница",
    "studio.brand_border_desc":
      "Обводка вокруг карточек и элементов управления по умолчанию.",
    "studio.brand_border_maps": "Соответствует `border`",
    "studio.field_header_tokens": "Токены шапки",
    "studio.field_header_light_bg": "Светлый фон шапки",
    "studio.field_header_dark_bg": "Тёмный фон шапки",
    "studio.placeholder_transparent_custom": "прозрачный / свой",
    "studio.field_logo_radius": "Скругление логотипа",
    "studio.field_logo_ratio": "Соотношение логотипа",
    "studio.field_logo_width": "Ширина логотипа",
    "studio.field_logo_height": "Высота логотипа",
    "studio.banner_media": "Баннеры",
    "studio.banner_media_hint":
      "Загрузите светлый и тёмный баннеры шапки или вставьте сохранённый путь.",
    "studio.banner_light": "Светлый баннер",
    "studio.banner_dark": "Тёмный баннер",
    "studio.logo_preview": "Превью логотипа",
    "studio.logo_alt_original": "{name} — оригинальный логотип",
    "studio.no_catalog_logo": "В настройках ещё нет логотипа каталога",
    "studio.field_header_content": "Содержимое шапки",
    "studio.field_header_content_hint":
      "Эти настройки уже работают и влияют на предпросмотр в реальном времени.",
    "studio.show_logo": "Показывать логотип",
    "studio.show_title": "Показывать название",
    "studio.show_description": "Показывать описание",
    "studio.show_tags": "Показывать теги",
    "studio.stretch_logo": "Растянуть логотип",

    // Pricing inspector
    "studio.live_sample": "Живой пример",
    "studio.regular_price": "Обычная цена",
    "studio.sale_price": "{price} по акции",
    "studio.field_currency_code": "Код валюты",
    "studio.field_currency_label": "Обозначение валюты",
    "studio.field_position": "Позиция",
    "studio.position_before": "До",
    "studio.position_after": "После",
    "studio.field_decimals": "Дробная часть",
    "studio.field_thousands": "Тысячи",
    "studio.field_decimal": "Десятичный",
    "studio.sep_space": "Пробел",
    "studio.sep_comma": "Запятая",
    "studio.sep_dot": "Точка",
    "studio.on": "Вкл",
    "studio.off": "Выкл",
    "studio.pricing_realtime_note":
      "Изменения сразу применяются к карточкам каталога справа.",

    // Cart inspector
    "studio.enable_cart": "Включить корзину",
    "studio.enable_cart_desc":
      "Плавающая кнопка корзины и кнопка «В корзину» в карточке товара.",
    "studio.cart_footer_note":
      "Включено по умолчанию. Покупатели добавляют позиции и оформляют заказ в тех режимах, которые вы включили в «Настройки → Заведение». Отключайте только для меню, доступного лишь для просмотра (без корзины и кнопки «В корзину»).",

    // Banner upload field
    "studio.clear": "Очистить",
    "studio.no_image_selected": "Изображение не выбрано",
    "studio.banner_preview_alt": "{label} — превью",

    // Preview frame
    "studio.device_desktop": "Компьютер",
    "studio.device_tablet": "Планшет",
    "studio.device_mobile": "Телефон",
    "studio.live_preview": "Живой предпросмотр",
    "studio.live_preview_desc":
      "Инспектор слева сразу обновляет этот предпросмотр.",
    "studio.preview_iframe_title": "Предпросмотр каталога",

    // AI agent panel
    "studio.agent_suggestion_review": "Проверь мой магазин и предложи улучшения",
    "studio.agent_suggestion_big_photos":
      "Переключи карточки товаров на большие фото",
    "studio.agent_suggestion_centered_header": "Сделай шапку по центру",
    "studio.agent_suggestion_three_columns": "Сделай сетку в 3 колонки",
    "studio.tool_read_shop": "Прочитал ваш магазин",
    "studio.tool_updated_design": "Обновил ваш дизайн",
    "studio.tool_searched_menu": "Поискал по вашему меню",
    "studio.agent_subtitle": "Ваш ИИ-дизайнер для {name}",
    "studio.agent_empty_title": "Давайте оформим ваш магазин",
    "studio.agent_empty_desc":
      "Спросите про раскладку, категории, брендинг или как выгоднее подать товары. Я читаю ваш действующий магазин и даю советы именно по нему.",
    "studio.thinking": "Думаю…",
    "studio.agent_input_placeholder": "Спросите Krafta Studio о вашем магазине…",
    "studio.agent_footer_note":
      "Бета · Я могу изменить оформление магазина — посмотрите в предпросмотре и сохраните.",

    // AI codegen panel
    "studio.codegen_suggestion_dark_minimal":
      "Сделай магазин тёмным и минималистичным",
    "studio.codegen_suggestion_hero": "Добавь обложку с крупным заголовком",
    "studio.codegen_suggestion_larger_cards": "Сделай карточки товаров крупнее",
    "studio.codegen_suggestion_about_page": "Добавь страницу «О нас»",
    "studio.tool_edited_file": "Изменил файл",
    "studio.tool_ran_command": "Выполнил команду",
    "studio.tool_refreshed_preview": "Обновил предпросмотр",
    "studio.codegen_subtitle": "Опишите {name} — ИИ напишет код",
    "studio.codegen_empty_title": "Опишите ваш магазин",
    "studio.codegen_empty_desc":
      "Расскажите, как он должен выглядеть и какие страницы нужны. Я соберу его в реальном коде на движке Krafta, и вы сразу увидите результат справа.",
    "studio.working_on_shop": "Работаю над вашим магазином…",
    "studio.codegen_input_placeholder":
      "Опишите изменение для вашего магазина…",
    "studio.codegen_footer_note": "Бета · ИИ редактирует реальный код.",
    "studio.live_badge": "Онлайн",
    "studio.published_temp_title":
      "Опубликовано по временному адресу — {target} не подключился. Нажмите «Обновить», чтобы повторить.",
    "studio.subdomain_fallback": "поддомен",
    "studio.published_temp_badge": "Опубликовано · временная ссылка",
    "studio.republish_title": "Опубликовать заново последнюю версию",
    "studio.publish_title": "Опубликовать магазин в интернете",
    "studio.publishing": "Публикация…",
    "studio.update": "Обновить",
    "studio.publish": "Опубликовать",
    "studio.refresh_preview": "Обновить предпросмотр",
    "studio.open_new_tab": "Открыть в новой вкладке",
    "studio.open_preview_new_tab": "Открыть предпросмотр в новой вкладке",
    "studio.publish_failed_banner":
      "Не удалось опубликовать: {error} — нажмите «{action}», чтобы повторить.",
    "studio.publish_generic_error":
      "Не удалось опубликовать. Попробуйте снова.",
    "studio.shop_will_appear": "Здесь появится ваш магазин",
    "studio.building_shop": "Собираю ваш магазин…",
    "studio.codegen_preview_hint":
      "Опишите изменение в чате — ИИ его соберёт, и здесь появится живой предпросмотр.",
    "studio.codegen_preview_iframe_title": "Живой предпросмотр {name}",
    "studio.publish_command":
      "Опубликуй мой магазин в интернете и дай публичную ссылку.",
  },
  "uz-Latn": {
    // Layout variant labels
    "studio.section_basic": "Oddiy",
    "studio.section_separated": "Ajratilgan",
    "studio.section_pill_tabs": "Tabletka tablar",
    "studio.card_big_photo": "Katta foto",
    "studio.card_photo_row": "Foto qatori",
    "studio.card_minimal": "Minimal",
    "studio.card_default": "Standart",
    "studio.card_glass_blur": "Shisha effekti",
    "studio.card_row_compact": "Ixcham qator",
    "studio.nav_sticky_tabs": "Yopishqoq tablar",
    "studio.nav_sticky_tabs_motion": "Yopishqoq tablar (animatsiya)",
    "studio.nav_sticky_tabs_dashboard": "Yopishqoq tablar (Dashboard)",
    "studio.nav_hidden": "Yashirin",
    "studio.catalog_not_found": "Studio ko‘rinishi uchun katalog topilmadi.",

    // Section switcher + inspector intros
    "studio.focus_structure": "Tuzilma",
    "studio.focus_cards": "Kartochkalar",
    "studio.focus_brand": "Brend",
    "studio.focus_pricing": "Narxlar",
    "studio.focus_cart": "Savat",
    "studio.focus_assistant": "Krafta Studio",
    "studio.structure_intro":
      "Xaridorlar mahsulotlarni o‘qishdan oldin katalog qanday tuzilishini sozlang.",
    "studio.cards_intro":
      "Bir nechta alohida blokni ochmasdan tartib va mahsulot ko‘rinishini sozlang.",
    "studio.brand_intro":
      "Ommaviy katalog uchun token asosidagi uslub. Hozircha bu yangi dizayn ko‘rinishi — backendda saqlash keyinroq qo‘shiladi.",
    "studio.pricing_intro":
      "Narxlarni formatlang va natijani darhol ko‘ring.",
    "studio.cart_intro":
      "Buyurtma berish sukut bo‘yicha yoqilgan. Faqat ko‘rish uchun menyuda o‘chiring.",
    "studio.sections_title": "Studio bo‘limlari",
    "studio.sections_desc":
      "Sahifani bitta uzun shaklga aylantirmasdan tuzilma, kartochkalar, brend va narxlar orasida harakatlaning.",
    "studio.beta": "Beta",

    // Header / save area
    "studio.open_preview": "Ko‘rinishni ochish",

    // Toasts + errors
    "studio.save_failed": "Tartibni saqlab bo‘lmadi",
    "studio.unknown_error": "Noma’lum xatolik",
    "studio.changes_saved": "Studio o‘zgarishlari saqlandi",
    "studio.banner_upload_failed_generic": "Banner rasmini yuklab bo‘lmadi.",
    "studio.banner_light_uploaded": "Yorug‘ banner yuklandi",
    "studio.banner_dark_uploaded": "Qorong‘i banner yuklandi",
    "studio.banner_upload_failed": "Bannerni yuklab bo‘lmadi",
    "studio.unknown_upload_error": "Noma’lum yuklash xatosi",

    // Structure inspector
    "studio.field_header": "Sarlavha",
    "studio.field_section_style": "Bo‘lim uslubi",
    "studio.field_navigation": "Navigatsiya",
    "studio.field_navigation_hint":
      "Ommaviy katalog tepasida toifalar qanday ko‘rinishini tanlang.",
    "studio.nav_desc_tabs": "Klassik toifa tablari",
    "studio.nav_desc_tabs_motion": "Animatsiyali faol tab",
    "studio.nav_desc_tabs_dashboard": "Tag chizig‘i, Studio uslubiga yaqin",
    "studio.nav_desc_none": "Toifa paneli yo‘q",
    "studio.nav_desc_fallback": "Navigatsiya rejimini o‘zgartirish",
    "studio.state_active": "Faol",
    "studio.state_switch": "Tanlash",

    // Compact header labels
    "studio.header_basic": "Oddiy",
    "studio.header_free_logo": "Erkin logotip",
    "studio.header_center": "Markazda",
    "studio.header_hero": "Muqova",

    // Item detail
    "studio.item_detail_fullscreen": "To‘liq ekran",

    // Cards inspector
    "studio.field_card_family": "Kartochka turi",
    "studio.field_columns": "Ustunlar",
    "studio.field_aspect_ratio": "Tomonlar nisbati",
    "studio.field_aspect_width": "Kenglik",
    "studio.field_aspect_height": "Balandlik",
    "studio.field_item_detail": "Mahsulot tafsiloti",
    "studio.field_card_preview": "Kartochka ko‘rinishi",
    "studio.card_surfaces_map_to": "Joriy kartochka yuzalari mos keladi:",

    // Brand inspector
    "studio.field_core_tokens": "Asosiy tokenlar",
    "studio.field_core_tokens_hint":
      "Hozircha faqat frontendda. Bu qiymatlar backend sozlamalari qo‘shilgunga qadar yangilangan Brend panelini tayyorlashga yordam beradi.",
    "studio.brand_page_background": "Sahifa foni",
    "studio.brand_page_background_desc": "Katalog fonining asosiy rangi.",
    "studio.brand_page_background_maps": "`background` ga mos",
    "studio.brand_card_surface": "Kartochka yuzasi",
    "studio.brand_card_surface_desc": "Mahsulot kartochkasining asosiy foni.",
    "studio.brand_card_surface_maps": "`card` ga mos",
    "studio.brand_muted_surface": "Susaytirilgan yuza",
    "studio.brand_muted_surface_desc":
      "Sokin yuzalar va rasm o‘rinbosarlari uchun.",
    "studio.brand_muted_surface_maps": "`muted` ga mos",
    "studio.brand_primary_text": "Asosiy matn",
    "studio.brand_primary_text_desc":
      "Sarlavhalar va narxlar uchun asosiy matn rangi.",
    "studio.brand_primary_text_maps":
      "`foreground` / `card-foreground` ga mos",
    "studio.brand_secondary_text": "Ikkilamchi matn",
    "studio.brand_secondary_text_desc":
      "Yordamchi matn va metama’lumotlar uchun.",
    "studio.brand_secondary_text_maps": "`muted-foreground` ga mos",
    "studio.brand_border": "Chegara",
    "studio.brand_border_desc":
      "Kartochka va boshqaruvlar atrofidagi standart chiziq.",
    "studio.brand_border_maps": "`border` ga mos",
    "studio.field_header_tokens": "Sarlavha tokenlari",
    "studio.field_header_light_bg": "Sarlavhaning yorug‘ foni",
    "studio.field_header_dark_bg": "Sarlavhaning qorong‘i foni",
    "studio.placeholder_transparent_custom": "shaffof / maxsus",
    "studio.field_logo_radius": "Logotip radiusi",
    "studio.field_logo_ratio": "Logotip nisbati",
    "studio.field_logo_width": "Logotip kengligi",
    "studio.field_logo_height": "Logotip balandligi",
    "studio.banner_media": "Banner mediasi",
    "studio.banner_media_hint":
      "Sarlavha uchun yorug‘ va qorong‘i bannerlarni yuklang yoki saqlangan yo‘lni kiriting.",
    "studio.banner_light": "Yorug‘ banner",
    "studio.banner_dark": "Qorong‘i banner",
    "studio.logo_preview": "Logotip ko‘rinishi",
    "studio.logo_alt_original": "{name} — asl logotip",
    "studio.no_catalog_logo": "Sozlamalarda hali katalog logotipi yo‘q",
    "studio.field_header_content": "Sarlavha tarkibi",
    "studio.field_header_content_hint":
      "Bu sozlamalar allaqachon ishlaydi va jonli ko‘rinishga ta’sir qiladi.",
    "studio.show_logo": "Logotipni ko‘rsatish",
    "studio.show_title": "Nomni ko‘rsatish",
    "studio.show_description": "Tavsifni ko‘rsatish",
    "studio.show_tags": "Teglarni ko‘rsatish",
    "studio.stretch_logo": "Logotipni cho‘zish",

    // Pricing inspector
    "studio.live_sample": "Jonli namuna",
    "studio.regular_price": "Oddiy narx",
    "studio.sale_price": "{price} chegirmada",
    "studio.field_currency_code": "Valyuta kodi",
    "studio.field_currency_label": "Valyuta belgisi",
    "studio.field_position": "Joylashuv",
    "studio.position_before": "Oldida",
    "studio.position_after": "Keyin",
    "studio.field_decimals": "Kasr qismi",
    "studio.field_thousands": "Minglik",
    "studio.field_decimal": "O‘nlik",
    "studio.sep_space": "Bo‘shliq",
    "studio.sep_comma": "Vergul",
    "studio.sep_dot": "Nuqta",
    "studio.on": "Yoniq",
    "studio.off": "O‘chiq",
    "studio.pricing_realtime_note":
      "O‘zgarishlar o‘ngdagi katalog kartochkalariga darhol qo‘llanadi.",

    // Cart inspector
    "studio.enable_cart": "Savatni yoqish",
    "studio.enable_cart_desc":
      "Suzuvchi savat tugmasi va mahsulot kartochkasidagi «Savatga» tugmasi.",
    "studio.cart_footer_note":
      "Sukut bo‘yicha yoqilgan. Xaridorlar mahsulotlarni qo‘shadi va «Sozlamalar → Muassasa» bo‘limida yoqqan usullaringiz orqali buyurtma beradi. Faqat ko‘rish uchun menyuda (savatsiz va «Savatga» tugmasisiz) o‘chiring.",

    // Banner upload field
    "studio.clear": "Tozalash",
    "studio.no_image_selected": "Rasm tanlanmagan",
    "studio.banner_preview_alt": "{label} — ko‘rinishi",

    // Preview frame
    "studio.device_desktop": "Kompyuter",
    "studio.device_tablet": "Planshet",
    "studio.device_mobile": "Telefon",
    "studio.live_preview": "Jonli ko‘rinish",
    "studio.live_preview_desc":
      "Chapdagi inspektor bu ko‘rinishni darhol yangilaydi.",
    "studio.preview_iframe_title": "Katalog ko‘rinishi",

    // AI agent panel
    "studio.agent_suggestion_review":
      "Do‘konimni ko‘rib chiqing va yaxshilanishlarni taklif qiling",
    "studio.agent_suggestion_big_photos":
      "Mahsulot kartochkalarini katta fotolarga o‘tkazing",
    "studio.agent_suggestion_centered_header": "Sarlavhani markazga joylang",
    "studio.agent_suggestion_three_columns":
      "Panjarani 3 ustunga o‘zgartiring",
    "studio.tool_read_shop": "Do‘koningizni o‘qidi",
    "studio.tool_updated_design": "Dizayningizni yangiladi",
    "studio.tool_searched_menu": "Menyungizdan qidirdi",
    "studio.agent_subtitle": "{name} uchun sizning AI dizayn hamkoringiz",
    "studio.agent_empty_title": "Keling, do‘koningizni shakllantiramiz",
    "studio.agent_empty_desc":
      "Tartib, toifalar, brending yoki mahsulotlarni qanday joylash haqida so‘rang. Men sizning amaldagi do‘koningizni o‘qib, aynan unga mos maslahat beraman.",
    "studio.thinking": "O‘ylayapman…",
    "studio.agent_input_placeholder":
      "Krafta Studio’dan do‘koningiz haqida so‘rang…",
    "studio.agent_footer_note":
      "Beta · Do‘koningiz uslubini o‘zgartira olaman — ko‘rinishda tekshirib, so‘ng saqlang.",

    // AI codegen panel
    "studio.codegen_suggestion_dark_minimal":
      "Do‘konni qorong‘i va minimal qiling",
    "studio.codegen_suggestion_hero": "Yirik sarlavhali muqova qo‘shing",
    "studio.codegen_suggestion_larger_cards":
      "Kattaroq mahsulot kartochkalaridan foydalaning",
    "studio.codegen_suggestion_about_page": "«Biz haqimizda» sahifasini qo‘shing",
    "studio.tool_edited_file": "Faylni tahrirladi",
    "studio.tool_ran_command": "Buyruqni bajardi",
    "studio.tool_refreshed_preview": "Ko‘rinishni yangiladi",
    "studio.codegen_subtitle": "{name}ni tasvirlab bering — AI kodni yozadi",
    "studio.codegen_empty_title": "Do‘koningizni tasvirlang",
    "studio.codegen_empty_desc":
      "U qanday ko‘rinishi va qanday sahifalar kerakligini ayting. Men uni Krafta commerce dvigatelida haqiqiy kodda quraman va siz natijani o‘ngda jonli ko‘rasiz.",
    "studio.working_on_shop": "Do‘koningiz ustida ishlayapman…",
    "studio.codegen_input_placeholder":
      "Do‘koningizga o‘zgartirishni tasvirlang…",
    "studio.codegen_footer_note": "Beta · AI haqiqiy kodni tahrirlaydi.",
    "studio.live_badge": "Onlayn",
    "studio.published_temp_title":
      "Vaqtinchalik manzilga chop etildi — {target} ulanmadi. Qayta urinish uchun «Yangilash»ni bosing.",
    "studio.subdomain_fallback": "subdomen",
    "studio.published_temp_badge": "Chop etildi · vaqtinchalik havola",
    "studio.republish_title": "Eng so‘nggi versiyani qayta chop etish",
    "studio.publish_title": "Do‘koningizni internetda chop etish",
    "studio.publishing": "Chop etilmoqda…",
    "studio.update": "Yangilash",
    "studio.publish": "Chop etish",
    "studio.refresh_preview": "Ko‘rinishni yangilash",
    "studio.open_new_tab": "Yangi oynada ochish",
    "studio.open_preview_new_tab": "Ko‘rinishni yangi oynada ochish",
    "studio.publish_failed_banner":
      "Chop etib bo‘lmadi: {error} — qayta urinish uchun «{action}»ni bosing.",
    "studio.publish_generic_error":
      "Chop etib bo‘lmadi. Qayta urinib ko‘ring.",
    "studio.shop_will_appear": "Do‘koningiz shu yerda paydo bo‘ladi",
    "studio.building_shop": "Do‘koningizni quryapman…",
    "studio.codegen_preview_hint":
      "Chatda o‘zgartirishni tasvirlang — AI uni quradi va jonli ko‘rinish shu yerda chiqadi.",
    "studio.codegen_preview_iframe_title": "{name}ning jonli ko‘rinishi",
    "studio.publish_command":
      "Do‘konimni internetda chop et va ommaviy havolani ber.",
  },
};
