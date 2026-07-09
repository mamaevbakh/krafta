/**
 * translations — dashboard "translations" surface strings.
 *
 * Contract: export { en, ru, "uz-Latn" } objects of flat dotted keys prefixed
 * "translations.". English is canonical (defines the key union); ru / uz-Latn are
 * type-checked against it in ../catalog.ts. Use {var} placeholders for runtime
 * values. See ./common.ts for the full contract.
 *
 * Scope: the merchant "Translations workbench" chrome. Language NAMES shown in
 * the sidebar / column headers come from the locale registry (already native)
 * and are NOT translated here — only the workbench UI around them.
 */

export const translations = {
  en: {
    // Page / tabs
    "translations.page_title": "Translations",
    "translations.tab_overview": "Overview",
    "translations.tab_items": "Items",
    "translations.tab_categories": "Categories",
    "translations.tab_variations": "Variations",
    "translations.tab_modifier_lists": "Modifier lists",
    "translations.tab_modifiers": "Modifiers",
    "translations.tab_catalog": "Catalog",

    // Header hero band
    "translations.hero_title": "Your catalog is {pct}% translated",
    "translations.hero_subtitle":
      "{translated} of {total} translation rows are done across {count} {lang}.",
    "translations.lang_count_one": "language",
    "translations.lang_count_other": "languages",
    "translations.empty_header_desc":
      "Add a target language in the sidebar to get started.",
    "translations.empty_header_desc_named":
      "Add a target language in the sidebar to get started translating {name}.",

    // Live activity pulse (AI worker running)
    "translations.activity_one": "AI translating {count} items into {name}…",
    "translations.activity_two":
      "AI translating into {a} ({countA}) and {b} ({countB})…",
    "translations.activity_many":
      "AI translating into {count} languages ({total} items)…",

    // No-target-language empty state
    "translations.no_target_title": "No target language yet",
    "translations.no_target_desc_has_default":
      "Your default language is set. Add another language in the sidebar (Russian, Uzbek, English, or any locale) and we'll translate your menu into it.",
    "translations.no_target_desc_no_default":
      "This catalog has no languages configured yet. Add a default language and at least one target language in the sidebar to get started.",

    // Languages sidebar
    "translations.languages_heading": "Languages",
    "translations.add_language": "Add language",
    "translations.no_languages": "No languages set up.",
    "translations.rename_language": "Rename {name}",
    "translations.hide_language": "Hide {name}",
    "translations.show_language": "Show {name}",
    "translations.default_language_aria": "Default language",
    "translations.locale_disabled": "{name} disabled",
    "translations.locale_enabled": "{name} re-enabled",

    // Add-language dialog
    "translations.add_dialog_desc":
      "Pick a language to translate this catalog into. Once added, AI translates item names and descriptions automatically.",
    "translations.language_label": "Language",
    "translations.rtl_note":
      "Right-to-left script — storefront direction support ships in Phase 2.",
    "translations.set_default_label": "Set as default language",
    "translations.set_default_desc":
      "Customers see this language by default. You can change it later from the catalog's language settings.",
    "translations.adding": "Adding…",
    "translations.locale_added": "Added {name}",

    // Rename-language dialog
    "translations.rename_dialog_title": "Rename language",
    "translations.rename_desc_before":
      "Set how this language appears across the dashboard and storefront. The locale code (",
    "translations.rename_desc_after": ") stays fixed.",
    "translations.display_name_label": "Display name",
    "translations.reset_to_native": "Reset to native name ({name})",
    "translations.locale_renamed": "Renamed to {name}",

    // Filter chips
    "translations.filter_show": "Show",
    "translations.status_not_translated": "Not translated",
    "translations.status_translated": "Translated",
    "translations.clear_filter": "Clear filter",
    "translations.filter_empty_title": "Nothing matches this filter.",
    "translations.filter_empty_desc":
      "Try a different status or language, or clear the filter to see everything.",

    // Items tab
    "translations.items_empty_title": "No items in this catalog",
    "translations.items_empty_desc":
      "Add items in the Library before translating them. Each item you add shows up here automatically.",
    "translations.source": "Source",
    "translations.default_badge": "default",

    // Overview tab
    "translations.by_language": "By language",
    "translations.all_done": "All done",
    "translations.n_translated": "{count} translated",
    "translations.n_not_translated": "{count} not translated",
    "translations.progress_aria":
      "{translated} translated, {notTranslated} not translated",
    "translations.find_n": "Find {count}",
    "translations.overview_no_targets_title": "No target languages yet",
    "translations.overview_no_targets_desc":
      "Add a target language in the sidebar on the left. We'll start translating your items into it automatically.",
    "translations.overview_no_items_title": "No items in this catalog yet",
    "translations.overview_no_items_desc":
      "Add items in the catalog library first. Once items exist, this overview will show your translation coverage by language.",

    // Bulk translate (per-language)
    "translations.translating_into": "Translating into {name}…",
    "translations.translate_all_missing": "Translate all missing with AI",
    "translations.translate_missing_to": "Translate missing → {name}",
    "translations.translate_to_title": "Translate to {name}?",
    "translations.translate_to_desc":
      "AI will translate {count} untranslated items into {name}.",
    "translations.queuing": "Queuing…",
    "translations.translate": "Translate",
    "translations.nothing_to_translate": "Nothing to translate.",
    "translations.queued_n": "Queued {count} translations.",

    // Master "translate everything" CTA
    "translations.ai_translating": "AI translating…",
    "translations.translate_everything_n": "Translate everything missing ({count})",
    "translations.translate_everything_title":
      "Translate everything missing with AI?",
    "translations.translate_everything_desc":
      "This will queue {count} translations across your target languages:",
    "translations.total_count": "{count} total",
    "translations.everything_note":
      "Rows you've manually edited stay untouched. To retranslate a specific row over your edit, use the row's own AI button.",
    "translations.translate_everything_action": "Translate everything",
    "translations.nothing_new": "Nothing new to translate.",

    // Entity tabs (categories / variations / modifiers / modifier lists / catalog)
    "translations.entity_empty_title": "Nothing here yet",
    "translations.entity_empty_desc":
      "Add {plural} in the catalog first. Once they exist, this tab shows their translation coverage by language.",
    "translations.entity_no_target_desc":
      "Add a target language in the sidebar to see what still needs translating.",
    "translations.entity_plural.item": "items",
    "translations.entity_plural.category": "categories",
    "translations.entity_plural.variation": "variations",
    "translations.entity_plural.modifier": "modifiers",
    "translations.entity_plural.modifier_list": "modifier lists",
    "translations.entity_plural.catalog": "catalog",
    "translations.free_text_list": "Free-text list",
    "translations.cell_drift_dot_title":
      "Source changed since translation — may need re-translate",
    "translations.cell_drift_name_title":
      "{name} (source changed — may need re-translate)",

    // Edit dialogs (shared)
    "translations.untitled": "Untitled",
    "translations.editing_translations": "Editing translations for this entry.",
    "translations.n_unsaved": "{count} unsaved",
    "translations.save_all": "Save all",
    "translations.unsaved": "unsaved",
    "translations.name": "Name",
    "translations.description": "Description",
    "translations.save_source": "Save source",
    "translations.source_edit_hint":
      "Editing the source flags existing translations as drift — they may need a re-translate.",
    "translations.no_targets_add":
      "No target languages yet. Add one in the sidebar to translate.",
    "translations.not_translated_yet": "Not translated yet",
    "translations.source_drift": "source drift",
    "translations.source_drift_title":
      "Source changed since this translation was generated",
    "translations.translate_with_ai": "Translate with AI",
    "translations.retranslate": "Re-translate",
    "translations.translating": "Translating…",
    "translations.translated_into": "Translated into {name}.",
    "translations.name_required": "Name is required.",
    "translations.saved_locale": "Saved {name}.",
    "translations.some_failed": "Some translations failed to save.",
    "translations.saved_n": "Saved {count} translations.",
    "translations.source_name_required": "Source name is required.",
    "translations.source_updated_drift":
      "Source updated. Existing translations may now drift.",
    "translations.discard_confirm": "Discard unsaved changes?",

    // Item edit dialog (extras)
    "translations.translate_item_sr": "Translate item: {name}",
    "translations.close_editor": "Close translation editor",
    "translations.translate_item": "Translate item",
    "translations.default_source_tag": "default · source",
    "translations.source_help_aria": "What happens when I edit the source?",
    "translations.source_edit_tooltip":
      "Editing the source updates the catalog, but existing translations on each target stay as they are. Hit Retranslate per language to refresh them with AI.",
    "translations.description_placeholder": "Add a description (optional)",
    "translations.translate_description_placeholder": "Translate the description",
    "translations.manual_override_note":
      "Manual edits override AI translations. AI re-translation will skip human-edited rows unless you explicitly retranslate.",
    "translations.source_saved": "Source saved.",
    "translations.nothing_to_save": "Nothing to save.",
    "translations.saved_source_and_n": "Saved source and {count} translations.",
  },
  ru: {
    // Page / tabs
    "translations.page_title": "Переводы",
    "translations.tab_overview": "Обзор",
    "translations.tab_items": "Позиции",
    "translations.tab_categories": "Категории",
    "translations.tab_variations": "Варианты",
    "translations.tab_modifier_lists": "Списки модификаторов",
    "translations.tab_modifiers": "Модификаторы",
    "translations.tab_catalog": "Каталог",

    // Header hero band
    "translations.hero_title": "Каталог переведён на {pct}%",
    "translations.hero_subtitle":
      "Готово {translated} из {total} строк перевода в {count} {lang}.",
    "translations.lang_count_one": "языке",
    "translations.lang_count_other": "языках",
    "translations.empty_header_desc":
      "Добавьте целевой язык на боковой панели, чтобы начать.",
    "translations.empty_header_desc_named":
      "Добавьте целевой язык на боковой панели, чтобы начать перевод «{name}».",

    // Live activity pulse (AI worker running)
    "translations.activity_one": "ИИ переводит позиции на {name} ({count})…",
    "translations.activity_two":
      "ИИ переводит на {a} ({countA}) и {b} ({countB})…",
    "translations.activity_many":
      "ИИ переводит на {count} языков ({total} позиций)…",

    // No-target-language empty state
    "translations.no_target_title": "Целевой язык ещё не выбран",
    "translations.no_target_desc_has_default":
      "Язык по умолчанию задан. Добавьте ещё один язык на боковой панели (русский, узбекский, английский или любой другой), и мы переведём ваше меню на него.",
    "translations.no_target_desc_no_default":
      "В этом каталоге ещё не настроены языки. Добавьте язык по умолчанию и хотя бы один целевой язык на боковой панели, чтобы начать.",

    // Languages sidebar
    "translations.languages_heading": "Языки",
    "translations.add_language": "Добавить язык",
    "translations.no_languages": "Языки не настроены.",
    "translations.rename_language": "Переименовать {name}",
    "translations.hide_language": "Скрыть {name}",
    "translations.show_language": "Показать {name}",
    "translations.default_language_aria": "Язык по умолчанию",
    "translations.locale_disabled": "{name} — язык отключён",
    "translations.locale_enabled": "{name} — язык снова включён",

    // Add-language dialog
    "translations.add_dialog_desc":
      "Выберите язык, на который переведём этот каталог. После добавления ИИ автоматически переведёт названия и описания позиций.",
    "translations.language_label": "Язык",
    "translations.rtl_note":
      "Письмо справа налево — поддержка направления в витрине появится во второй фазе.",
    "translations.set_default_label": "Сделать языком по умолчанию",
    "translations.set_default_desc":
      "Клиенты по умолчанию видят этот язык. Позже его можно изменить в настройках языков каталога.",
    "translations.adding": "Добавление…",
    "translations.locale_added": "{name} добавлен",

    // Rename-language dialog
    "translations.rename_dialog_title": "Переименовать язык",
    "translations.rename_desc_before":
      "Задайте, как этот язык отображается в панели и витрине. Код языка (",
    "translations.rename_desc_after": ") остаётся неизменным.",
    "translations.display_name_label": "Отображаемое название",
    "translations.reset_to_native": "Вернуть родное название ({name})",
    "translations.locale_renamed": "Переименовано в «{name}»",

    // Filter chips
    "translations.filter_show": "Показать",
    "translations.status_not_translated": "Не переведено",
    "translations.status_translated": "Переведено",
    "translations.clear_filter": "Сбросить фильтр",
    "translations.filter_empty_title": "Ничего не найдено по этому фильтру.",
    "translations.filter_empty_desc":
      "Попробуйте другой статус или язык — или сбросьте фильтр, чтобы увидеть всё.",

    // Items tab
    "translations.items_empty_title": "В этом каталоге нет позиций",
    "translations.items_empty_desc":
      "Сначала добавьте позиции в библиотеке — затем их можно переводить. Каждая добавленная позиция появляется здесь автоматически.",
    "translations.source": "Оригинал",
    "translations.default_badge": "по умолчанию",

    // Overview tab
    "translations.by_language": "По языкам",
    "translations.all_done": "Всё готово",
    "translations.n_translated": "переведено: {count}",
    "translations.n_not_translated": "не переведено: {count}",
    "translations.progress_aria":
      "переведено {translated}, не переведено {notTranslated}",
    "translations.find_n": "Найти {count}",
    "translations.overview_no_targets_title": "Целевые языки ещё не добавлены",
    "translations.overview_no_targets_desc":
      "Добавьте целевой язык на боковой панели слева. Мы автоматически начнём переводить ваши позиции на него.",
    "translations.overview_no_items_title": "В этом каталоге пока нет позиций",
    "translations.overview_no_items_desc":
      "Сначала добавьте позиции в библиотеке каталога. Когда появятся позиции, здесь будет видно покрытие перевода по языкам.",

    // Bulk translate (per-language)
    "translations.translating_into": "Перевод на {name}…",
    "translations.translate_all_missing": "Перевести всё недостающее с ИИ",
    "translations.translate_missing_to": "Перевести недостающее → {name}",
    "translations.translate_to_title": "Перевести на {name}?",
    "translations.translate_to_desc":
      "ИИ переведёт непереведённые позиции ({count}) на {name}.",
    "translations.queuing": "Добавление в очередь…",
    "translations.translate": "Перевести",
    "translations.nothing_to_translate": "Нечего переводить.",
    "translations.queued_n": "В очередь добавлено переводов: {count}.",

    // Master "translate everything" CTA
    "translations.ai_translating": "ИИ переводит…",
    "translations.translate_everything_n": "Перевести всё недостающее ({count})",
    "translations.translate_everything_title":
      "Перевести всё недостающее с ИИ?",
    "translations.translate_everything_desc":
      "В очередь будет добавлено переводов: {count}. По целевым языкам:",
    "translations.total_count": "всего {count}",
    "translations.everything_note":
      "Строки, отредактированные вручную, останутся без изменений. Чтобы перевести конкретную строку поверх вашей правки, используйте кнопку ИИ в самой строке.",
    "translations.translate_everything_action": "Перевести всё",
    "translations.nothing_new": "Нет новых переводов.",

    // Entity tabs (categories / variations / modifiers / modifier lists / catalog)
    "translations.entity_empty_title": "Здесь пока пусто",
    "translations.entity_empty_desc":
      "Сначала добавьте {plural} в каталог. Когда они появятся, на этой вкладке будет видно покрытие перевода по языкам.",
    "translations.entity_no_target_desc":
      "Добавьте целевой язык на боковой панели, чтобы увидеть, что ещё нужно перевести.",
    "translations.entity_plural.item": "позиции",
    "translations.entity_plural.category": "категории",
    "translations.entity_plural.variation": "варианты",
    "translations.entity_plural.modifier": "модификаторы",
    "translations.entity_plural.modifier_list": "списки модификаторов",
    "translations.entity_plural.catalog": "каталог",
    "translations.free_text_list": "Список свободного ввода",
    "translations.cell_drift_dot_title":
      "Оригинал изменился после перевода — возможно, нужно перевести заново",
    "translations.cell_drift_name_title":
      "{name} (оригинал изменён — возможно, нужно перевести заново)",

    // Edit dialogs (shared)
    "translations.untitled": "Без названия",
    "translations.editing_translations": "Редактирование переводов этой записи.",
    "translations.n_unsaved": "не сохранено: {count}",
    "translations.save_all": "Сохранить всё",
    "translations.unsaved": "не сохранено",
    "translations.name": "Название",
    "translations.description": "Описание",
    "translations.save_source": "Сохранить оригинал",
    "translations.source_edit_hint":
      "При изменении оригинала существующие переводы помечаются как устаревшие — их может потребоваться перевести заново.",
    "translations.no_targets_add":
      "Целевых языков пока нет. Добавьте язык на боковой панели, чтобы переводить.",
    "translations.not_translated_yet": "Ещё не переведено",
    "translations.source_drift": "оригинал изменён",
    "translations.source_drift_title":
      "Оригинал изменился после создания этого перевода",
    "translations.translate_with_ai": "Перевести с ИИ",
    "translations.retranslate": "Перевести заново",
    "translations.translating": "Перевод…",
    "translations.translated_into": "Переведено на {name}.",
    "translations.name_required": "Укажите название.",
    "translations.saved_locale": "Сохранено: {name}.",
    "translations.some_failed": "Некоторые переводы не удалось сохранить.",
    "translations.saved_n": "Сохранено переводов: {count}.",
    "translations.source_name_required": "Укажите название оригинала.",
    "translations.source_updated_drift":
      "Оригинал обновлён. Существующие переводы могут устареть.",
    "translations.discard_confirm": "Отменить несохранённые изменения?",

    // Item edit dialog (extras)
    "translations.translate_item_sr": "Перевод позиции: {name}",
    "translations.close_editor": "Закрыть редактор перевода",
    "translations.translate_item": "Перевод позиции",
    "translations.default_source_tag": "по умолчанию · оригинал",
    "translations.source_help_aria": "Что произойдёт при изменении оригинала?",
    "translations.source_edit_tooltip":
      "Изменение оригинала обновляет каталог, но существующие переводы на каждом языке остаются прежними. Нажмите «Перевести заново» для нужного языка, чтобы обновить их с ИИ.",
    "translations.description_placeholder": "Добавьте описание (необязательно)",
    "translations.translate_description_placeholder": "Переведите описание",
    "translations.manual_override_note":
      "Ручные правки имеют приоритет над переводами ИИ. Повторный перевод ИИ пропускает строки с ручными правками, если вы не запустите его явно.",
    "translations.source_saved": "Оригинал сохранён.",
    "translations.nothing_to_save": "Нечего сохранять.",
    "translations.saved_source_and_n": "Сохранён оригинал и переводов: {count}.",
  },
  "uz-Latn": {
    // Page / tabs
    "translations.page_title": "Tarjimalar",
    "translations.tab_overview": "Umumiy",
    "translations.tab_items": "Mahsulotlar",
    "translations.tab_categories": "Kategoriyalar",
    "translations.tab_variations": "Variantlar",
    "translations.tab_modifier_lists": "Modifikator ro‘yxatlari",
    "translations.tab_modifiers": "Modifikatorlar",
    "translations.tab_catalog": "Katalog",

    // Header hero band
    "translations.hero_title": "Katalog {pct}% tarjima qilingan",
    "translations.hero_subtitle":
      "{count} {lang} bo‘yicha {total} tarjima qatoridan {translated} tayyor.",
    "translations.lang_count_one": "til",
    "translations.lang_count_other": "til",
    "translations.empty_header_desc":
      "Boshlash uchun yon panelda maqsadli til qo‘shing.",
    "translations.empty_header_desc_named":
      "«{name}» tarjimasini boshlash uchun yon panelda maqsadli til qo‘shing.",

    // Live activity pulse (AI worker running)
    "translations.activity_one": "AI {name} tiliga tarjima qilmoqda ({count})…",
    "translations.activity_two":
      "AI {a} ({countA}) va {b} ({countB}) tillariga tarjima qilmoqda…",
    "translations.activity_many":
      "AI {count} tilga tarjima qilmoqda ({total} mahsulot)…",

    // No-target-language empty state
    "translations.no_target_title": "Maqsadli til hali tanlanmagan",
    "translations.no_target_desc_has_default":
      "Asosiy til belgilangan. Yon panelda yana bir til qo‘shing (rus, o‘zbek, ingliz yoki boshqa) — va biz menyuingizni o‘sha tilga tarjima qilamiz.",
    "translations.no_target_desc_no_default":
      "Bu katalogda hali tillar sozlanmagan. Boshlash uchun yon panelda asosiy til va kamida bitta maqsadli til qo‘shing.",

    // Languages sidebar
    "translations.languages_heading": "Tillar",
    "translations.add_language": "Til qo‘shish",
    "translations.no_languages": "Tillar sozlanmagan.",
    "translations.rename_language": "{name} nomini o‘zgartirish",
    "translations.hide_language": "{name}ni yashirish",
    "translations.show_language": "{name}ni ko‘rsatish",
    "translations.default_language_aria": "Asosiy til",
    "translations.locale_disabled": "{name} o‘chirildi",
    "translations.locale_enabled": "{name} qayta yoqildi",

    // Add-language dialog
    "translations.add_dialog_desc":
      "Bu katalog qaysi tilga tarjima qilinishini tanlang. Qo‘shilgach, AI mahsulot nomlari va tavsiflarini avtomatik tarjima qiladi.",
    "translations.language_label": "Til",
    "translations.rtl_note":
      "O‘ngdan chapga yozuv — vitrinada yo‘nalishni qo‘llab-quvvatlash 2-bosqichda chiqadi.",
    "translations.set_default_label": "Asosiy til qilib belgilash",
    "translations.set_default_desc":
      "Mijozlar birinchi navbatda shu tilni ko‘radi. Buni keyinroq katalogning til sozlamalarida o‘zgartirishingiz mumkin.",
    "translations.adding": "Qo‘shilmoqda…",
    "translations.locale_added": "{name} qo‘shildi",

    // Rename-language dialog
    "translations.rename_dialog_title": "Til nomini o‘zgartirish",
    "translations.rename_desc_before":
      "Bu til panel va vitrinada qanday ko‘rinishini belgilang. Til kodi (",
    "translations.rename_desc_after": ") o‘zgarmaydi.",
    "translations.display_name_label": "Ko‘rinadigan nom",
    "translations.reset_to_native": "Asl nomga qaytarish ({name})",
    "translations.locale_renamed": "«{name}» deb o‘zgartirildi",

    // Filter chips
    "translations.filter_show": "Ko‘rsatish",
    "translations.status_not_translated": "Tarjima qilinmagan",
    "translations.status_translated": "Tarjima qilingan",
    "translations.clear_filter": "Filtrni tozalash",
    "translations.filter_empty_title": "Bu filtrga mos hech narsa yo‘q.",
    "translations.filter_empty_desc":
      "Boshqa holat yoki tilni tanlang yoki hammasini ko‘rish uchun filtrni tozalang.",

    // Items tab
    "translations.items_empty_title": "Bu katalogda mahsulotlar yo‘q",
    "translations.items_empty_desc":
      "Tarjima qilishdan oldin mahsulotlarni Kutubxonada qo‘shing. Qo‘shilgan har bir mahsulot shu yerda avtomatik paydo bo‘ladi.",
    "translations.source": "Manba",
    "translations.default_badge": "asosiy",

    // Overview tab
    "translations.by_language": "Tillar bo‘yicha",
    "translations.all_done": "Hammasi tayyor",
    "translations.n_translated": "{count} tarjima qilingan",
    "translations.n_not_translated": "{count} tarjima qilinmagan",
    "translations.progress_aria":
      "{translated} tarjima qilingan, {notTranslated} tarjima qilinmagan",
    "translations.find_n": "{count} tasini topish",
    "translations.overview_no_targets_title": "Maqsadli tillar hali qo‘shilmagan",
    "translations.overview_no_targets_desc":
      "Chapdagi yon panelda maqsadli til qo‘shing. Biz mahsulotlaringizni o‘sha tilga avtomatik tarjima qila boshlaymiz.",
    "translations.overview_no_items_title": "Bu katalogda hozircha mahsulot yo‘q",
    "translations.overview_no_items_desc":
      "Avval katalog kutubxonasiga mahsulot qo‘shing. Mahsulotlar paydo bo‘lgach, bu yerda tillar bo‘yicha tarjima qamrovi ko‘rinadi.",

    // Bulk translate (per-language)
    "translations.translating_into": "{name} tiliga tarjima qilinmoqda…",
    "translations.translate_all_missing": "Yetishmaganini AI bilan tarjima qilish",
    "translations.translate_missing_to": "Yetishmaganini tarjima qilish → {name}",
    "translations.translate_to_title": "{name} tiliga tarjima qilinsinmi?",
    "translations.translate_to_desc":
      "AI {count} ta tarjima qilinmagan mahsulotni {name} tiliga tarjima qiladi.",
    "translations.queuing": "Navbatga qo‘shilmoqda…",
    "translations.translate": "Tarjima qilish",
    "translations.nothing_to_translate": "Tarjima qilinadigan narsa yo‘q.",
    "translations.queued_n": "Navbatga {count} ta tarjima qo‘shildi.",

    // Master "translate everything" CTA
    "translations.ai_translating": "AI tarjima qilmoqda…",
    "translations.translate_everything_n":
      "Yetishmaganini to‘liq tarjima qilish ({count})",
    "translations.translate_everything_title":
      "Yetishmaganini AI bilan to‘liq tarjima qilinsinmi?",
    "translations.translate_everything_desc":
      "Navbatga qo‘shiladigan tarjimalar: {count}. Maqsadli tillar bo‘yicha:",
    "translations.total_count": "jami {count}",
    "translations.everything_note":
      "Siz qo‘lda tahrirlagan qatorlar o‘zgarmaydi. Muayyan qatorni tahriringiz ustidan qayta tarjima qilish uchun o‘sha qatordagi AI tugmasidan foydalaning.",
    "translations.translate_everything_action": "Hammasini tarjima qilish",
    "translations.nothing_new": "Tarjima qilinadigan yangi narsa yo‘q.",

    // Entity tabs (categories / variations / modifiers / modifier lists / catalog)
    "translations.entity_empty_title": "Bu yerda hozircha bo‘sh",
    "translations.entity_empty_desc":
      "Avval katalogga {plural} qo‘shing. Ular paydo bo‘lgach, bu bo‘limda tillar bo‘yicha tarjima qamrovi ko‘rinadi.",
    "translations.entity_no_target_desc":
      "Nima tarjima qilinishi kerakligini ko‘rish uchun yon panelda maqsadli til qo‘shing.",
    "translations.entity_plural.item": "mahsulotlar",
    "translations.entity_plural.category": "kategoriyalar",
    "translations.entity_plural.variation": "variantlar",
    "translations.entity_plural.modifier": "modifikatorlar",
    "translations.entity_plural.modifier_list": "modifikator ro‘yxatlari",
    "translations.entity_plural.catalog": "katalog",
    "translations.free_text_list": "Erkin matnli ro‘yxat",
    "translations.cell_drift_dot_title":
      "Tarjimadan keyin manba o‘zgardi — qayta tarjima kerak bo‘lishi mumkin",
    "translations.cell_drift_name_title":
      "{name} (manba o‘zgargan — qayta tarjima kerak bo‘lishi mumkin)",

    // Edit dialogs (shared)
    "translations.untitled": "Nomsiz",
    "translations.editing_translations": "Ushbu yozuv tarjimalarini tahrirlash.",
    "translations.n_unsaved": "{count} saqlanmagan",
    "translations.save_all": "Hammasini saqlash",
    "translations.unsaved": "saqlanmagan",
    "translations.name": "Nomi",
    "translations.description": "Tavsif",
    "translations.save_source": "Manbani saqlash",
    "translations.source_edit_hint":
      "Manba o‘zgartirilganda mavjud tarjimalar eskirgan deb belgilanadi — ularni qayta tarjima qilish kerak bo‘lishi mumkin.",
    "translations.no_targets_add":
      "Hozircha maqsadli tillar yo‘q. Tarjima qilish uchun yon panelda til qo‘shing.",
    "translations.not_translated_yet": "Hali tarjima qilinmagan",
    "translations.source_drift": "manba o‘zgargan",
    "translations.source_drift_title":
      "Bu tarjima yaratilgandan so‘ng manba o‘zgargan",
    "translations.translate_with_ai": "AI bilan tarjima qilish",
    "translations.retranslate": "Qayta tarjima qilish",
    "translations.translating": "Tarjima qilinmoqda…",
    "translations.translated_into": "{name} tiliga tarjima qilindi.",
    "translations.name_required": "Nom kiritilishi shart.",
    "translations.saved_locale": "{name} saqlandi.",
    "translations.some_failed": "Ba'zi tarjimalarni saqlab bo‘lmadi.",
    "translations.saved_n": "{count} ta tarjima saqlandi.",
    "translations.source_name_required": "Manba nomi kiritilishi shart.",
    "translations.source_updated_drift":
      "Manba yangilandi. Mavjud tarjimalar endi eskirishi mumkin.",
    "translations.discard_confirm": "Saqlanmagan o‘zgarishlar bekor qilinsinmi?",

    // Item edit dialog (extras)
    "translations.translate_item_sr": "Mahsulot tarjimasi: {name}",
    "translations.close_editor": "Tarjima muharririni yopish",
    "translations.translate_item": "Mahsulot tarjimasi",
    "translations.default_source_tag": "asosiy · manba",
    "translations.source_help_aria": "Manbani tahrirlaganda nima bo‘ladi?",
    "translations.source_edit_tooltip":
      "Manbani tahrirlash katalogni yangilaydi, ammo har bir tildagi mavjud tarjimalar o‘zgarishsiz qoladi. Ularni AI bilan yangilash uchun kerakli tilda «Qayta tarjima qilish»ni bosing.",
    "translations.description_placeholder": "Tavsif qo‘shing (ixtiyoriy)",
    "translations.translate_description_placeholder": "Tavsifni tarjima qiling",
    "translations.manual_override_note":
      "Qo‘lda kiritilgan tahrirlar AI tarjimalaridan ustun turadi. Agar aniq qayta tarjima qilmasangiz, AI qayta tarjimasi qo‘lda tahrirlangan qatorlarni o‘tkazib yuboradi.",
    "translations.source_saved": "Manba saqlandi.",
    "translations.nothing_to_save": "Saqlaydigan narsa yo‘q.",
    "translations.saved_source_and_n": "Manba va {count} ta tarjima saqlandi.",
  },
};
