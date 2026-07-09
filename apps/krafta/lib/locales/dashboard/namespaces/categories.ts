/**
 * categories — dashboard "categories" surface strings. (Stub — to be filled during migration.)
 *
 * Contract: export { en, ru, "uz-Latn" } objects of flat dotted keys prefixed
 * "categories.". English is canonical; ru / uz-Latn are type-checked against it in
 * ../catalog.ts. Use {var} placeholders for runtime values. See ./common.ts.
 */

export const categories = {
  en: {
    "categories.title": "Categories",
    "categories.create": "Create category",
    "categories.search_placeholder": "Search categories...",
    "categories.catalog_not_found": "Catalog not found.",

    // Errors (server actions + editor validation)
    "categories.error.name_required": "Category name is required.",
    "categories.error.slug_invalid": "Category slug could not be generated.",
    "categories.error.slug_taken": "This slug is already used in this catalog.",
    "categories.error.create_failed": "Failed to create category.",
    "categories.error.create_translations_failed":
      "Failed to create category translations.",
    "categories.error.save_translations_failed":
      "Failed to save category translations.",
    "categories.error.save_failed": "Failed to save category.",
    "categories.error.delete_failed": "Failed to delete category.",
    "categories.error.not_found": "Category not found.",

    // Toasts
    "categories.toast.created": "Category created.",
    "categories.toast.saved": "Category saved.",
    "categories.toast.deleted": "Category deleted.",
    "categories.toast.deleted_with_items": "Category deleted with {count} items.",

    // Delete confirm
    "categories.delete_confirm.title": "Delete this category?",
    "categories.delete_confirm.description":
      "“{name}” and all of its items will be removed permanently. This cannot be undone.",
    "categories.delete_confirm.fallback_name": "This category",
    "categories.delete_confirm.action": "Delete category",

    // Editor drawer
    "categories.editor.new": "New category",
    "categories.editor.untitled": "Untitled category",
    "categories.editor.editing": "Editing",
    "categories.editor.sr_title_edit": "Edit category: {name}",
    "categories.editor.sr_description":
      "Add translations and metadata for this catalog category.",
    "categories.editor.close_aria": "Close editor",
    "categories.editor.more_actions_aria": "More actions",
    "categories.editor.delete_ellipsis": "Delete…",
    "categories.editor.save_failed_retry": "Save failed — Retry",
    "categories.editor.save_failed_label": "Save failed:",
    "categories.editor.details_label": "Details",
    "categories.editor.details_hint_multi":
      "Add translations for every enabled locale. The default locale name is the category's primary label.",
    "categories.editor.details_hint_single":
      "The category's primary label and an optional customer-facing description.",
    "categories.editor.default_locale": "Default",
    "categories.editor.name_label": "Name",
    "categories.editor.name_placeholder": "Category name",
    "categories.editor.description_label": "Description",
    "categories.editor.description_placeholder":
      "Optional description shown on the storefront",
    "categories.editor.url_label": "URL",
    "categories.editor.slug_label": "Slug",

    // Discard prompt
    "categories.discard.title": "Discard changes?",
    "categories.discard.description":
      "Your edits will be lost. This cannot be undone.",
    "categories.discard.keep_editing": "Keep editing",

    // Data table
    "categories.status.active": "Active",
    "categories.status.archived": "Archived",
    "categories.table.selected": "{count} selected",
    "categories.table.rows": "{count} rows",
    "categories.table.columns": "Columns",
    "categories.table.toggle_columns": "Toggle columns",
    "categories.table.bulk_actions": "Bulk actions",
    "categories.table.bulk_readonly": "(Read-only for now)",
    "categories.table.no_results": "No results.",
    "categories.table.previous": "Previous",

    // Columns
    "categories.column.name": "Category",
    "categories.column.created": "Created",
    "categories.column.select_all": "Select all",
    "categories.column.select_row": "Select row",

    // Row actions menu
    "categories.actions.open_menu": "Open menu",
    "categories.actions.label": "Actions",
    "categories.actions.view": "View",
    "categories.actions.copy_id": "Copy ID",
  },
  ru: {
    "categories.title": "Категории",
    "categories.create": "Создать категорию",
    "categories.search_placeholder": "Поиск категорий...",
    "categories.catalog_not_found": "Каталог не найден.",

    "categories.error.name_required": "Укажите название категории.",
    "categories.error.slug_invalid": "Не удалось сформировать адрес категории.",
    "categories.error.slug_taken":
      "Этот адрес уже используется в этом каталоге.",
    "categories.error.create_failed": "Не удалось создать категорию.",
    "categories.error.create_translations_failed":
      "Не удалось сохранить переводы категории.",
    "categories.error.save_translations_failed":
      "Не удалось сохранить переводы категории.",
    "categories.error.save_failed": "Не удалось сохранить категорию.",
    "categories.error.delete_failed": "Не удалось удалить категорию.",
    "categories.error.not_found": "Категория не найдена.",

    "categories.toast.created": "Категория создана.",
    "categories.toast.saved": "Категория сохранена.",
    "categories.toast.deleted": "Категория удалена.",
    "categories.toast.deleted_with_items":
      "Категория удалена вместе с {count} позициями.",

    "categories.delete_confirm.title": "Удалить эту категорию?",
    "categories.delete_confirm.description":
      "«{name}» и все её позиции будут удалены безвозвратно. Это действие нельзя отменить.",
    "categories.delete_confirm.fallback_name": "Эта категория",
    "categories.delete_confirm.action": "Удалить категорию",

    "categories.editor.new": "Новая категория",
    "categories.editor.untitled": "Категория без названия",
    "categories.editor.editing": "Редактирование",
    "categories.editor.sr_title_edit": "Редактировать категорию: {name}",
    "categories.editor.sr_description":
      "Добавьте переводы и метаданные для этой категории каталога.",
    "categories.editor.close_aria": "Закрыть редактор",
    "categories.editor.more_actions_aria": "Ещё действия",
    "categories.editor.delete_ellipsis": "Удалить…",
    "categories.editor.save_failed_retry": "Не удалось сохранить — повторить",
    "categories.editor.save_failed_label": "Не удалось сохранить:",
    "categories.editor.details_label": "Сведения",
    "categories.editor.details_hint_multi":
      "Добавьте переводы для каждого включённого языка. Название на языке по умолчанию — основное название категории.",
    "categories.editor.details_hint_single":
      "Основное название категории и необязательное описание для покупателей.",
    "categories.editor.default_locale": "По умолчанию",
    "categories.editor.name_label": "Название",
    "categories.editor.name_placeholder": "Название категории",
    "categories.editor.description_label": "Описание",
    "categories.editor.description_placeholder":
      "Необязательное описание, которое видят покупатели",
    "categories.editor.url_label": "Ссылка",
    "categories.editor.slug_label": "Адрес",

    "categories.discard.title": "Отменить изменения?",
    "categories.discard.description":
      "Внесённые изменения будут потеряны. Это действие нельзя отменить.",
    "categories.discard.keep_editing": "Продолжить редактирование",

    "categories.status.active": "Активные",
    "categories.status.archived": "Архивные",
    "categories.table.selected": "Выбрано: {count}",
    "categories.table.rows": "Строк: {count}",
    "categories.table.columns": "Столбцы",
    "categories.table.toggle_columns": "Показать столбцы",
    "categories.table.bulk_actions": "Массовые действия",
    "categories.table.bulk_readonly": "(Пока только просмотр)",
    "categories.table.no_results": "Ничего не найдено.",
    "categories.table.previous": "Назад",

    "categories.column.name": "Категория",
    "categories.column.created": "Создано",
    "categories.column.select_all": "Выбрать все",
    "categories.column.select_row": "Выбрать строку",

    "categories.actions.open_menu": "Открыть меню",
    "categories.actions.label": "Действия",
    "categories.actions.view": "Просмотр",
    "categories.actions.copy_id": "Копировать ID",
  },
  "uz-Latn": {
    "categories.title": "Kategoriyalar",
    "categories.create": "Kategoriya yaratish",
    "categories.search_placeholder": "Kategoriyalarni qidirish...",
    "categories.catalog_not_found": "Katalog topilmadi.",

    "categories.error.name_required": "Kategoriya nomini kiriting.",
    "categories.error.slug_invalid":
      "Kategoriya uchun manzil yaratib bo‘lmadi.",
    "categories.error.slug_taken":
      "Bu manzil ushbu katalogda allaqachon ishlatilgan.",
    "categories.error.create_failed": "Kategoriyani yaratib bo‘lmadi.",
    "categories.error.create_translations_failed":
      "Kategoriya tarjimalarini saqlab bo‘lmadi.",
    "categories.error.save_translations_failed":
      "Kategoriya tarjimalarini saqlab bo‘lmadi.",
    "categories.error.save_failed": "Kategoriyani saqlab bo‘lmadi.",
    "categories.error.delete_failed": "Kategoriyani o‘chirib bo‘lmadi.",
    "categories.error.not_found": "Kategoriya topilmadi.",

    "categories.toast.created": "Kategoriya yaratildi.",
    "categories.toast.saved": "Kategoriya saqlandi.",
    "categories.toast.deleted": "Kategoriya o‘chirildi.",
    "categories.toast.deleted_with_items":
      "Kategoriya {count} ta mahsulot bilan birga o‘chirildi.",

    "categories.delete_confirm.title": "Ushbu kategoriya o‘chirilsinmi?",
    "categories.delete_confirm.description":
      "«{name}» va uning barcha mahsulotlari butunlay o‘chiriladi. Buni ortga qaytarib bo‘lmaydi.",
    "categories.delete_confirm.fallback_name": "Ushbu kategoriya",
    "categories.delete_confirm.action": "Kategoriyani o‘chirish",

    "categories.editor.new": "Yangi kategoriya",
    "categories.editor.untitled": "Nomsiz kategoriya",
    "categories.editor.editing": "Tahrirlash",
    "categories.editor.sr_title_edit": "Kategoriyani tahrirlash: {name}",
    "categories.editor.sr_description":
      "Ushbu katalog kategoriyasi uchun tarjimalar va metama’lumotlarni qo‘shing.",
    "categories.editor.close_aria": "Muharrirni yopish",
    "categories.editor.more_actions_aria": "Boshqa amallar",
    "categories.editor.delete_ellipsis": "O‘chirish…",
    "categories.editor.save_failed_retry": "Saqlanmadi — qayta urinish",
    "categories.editor.save_failed_label": "Saqlanmadi:",
    "categories.editor.details_label": "Ma’lumotlar",
    "categories.editor.details_hint_multi":
      "Har bir yoqilgan til uchun tarjima qo‘shing. Asosiy tildagi nom — kategoriyaning asosiy nomi.",
    "categories.editor.details_hint_single":
      "Kategoriyaning asosiy nomi va mijozlar uchun ixtiyoriy tavsif.",
    "categories.editor.default_locale": "Standart",
    "categories.editor.name_label": "Nomi",
    "categories.editor.name_placeholder": "Kategoriya nomi",
    "categories.editor.description_label": "Tavsif",
    "categories.editor.description_placeholder":
      "Do‘konda ko‘rinadigan ixtiyoriy tavsif",
    "categories.editor.url_label": "Havola",
    "categories.editor.slug_label": "Manzil",

    "categories.discard.title": "O‘zgarishlar bekor qilinsinmi?",
    "categories.discard.description":
      "Kiritilgan o‘zgarishlar yo‘qoladi. Buni ortga qaytarib bo‘lmaydi.",
    "categories.discard.keep_editing": "Tahrirni davom ettirish",

    "categories.status.active": "Faol",
    "categories.status.archived": "Arxivlangan",
    "categories.table.selected": "Tanlandi: {count}",
    "categories.table.rows": "Qatorlar: {count}",
    "categories.table.columns": "Ustunlar",
    "categories.table.toggle_columns": "Ustunlarni ko‘rsatish",
    "categories.table.bulk_actions": "Ommaviy amallar",
    "categories.table.bulk_readonly": "(Hozircha faqat ko‘rish)",
    "categories.table.no_results": "Hech narsa topilmadi.",
    "categories.table.previous": "Orqaga",

    "categories.column.name": "Kategoriya",
    "categories.column.created": "Yaratilgan",
    "categories.column.select_all": "Hammasini tanlash",
    "categories.column.select_row": "Qatorni tanlash",

    "categories.actions.open_menu": "Menyuni ochish",
    "categories.actions.label": "Amallar",
    "categories.actions.view": "Ko‘rish",
    "categories.actions.copy_id": "ID nusxalash",
  },
};
