/**
 * modifiers — dashboard "modifiers" surface strings. (Stub — to be filled during migration.)
 *
 * Contract: export { en, ru, "uz-Latn" } objects of flat dotted keys prefixed
 * "modifiers.". English is canonical; ru / uz-Latn are type-checked against it in
 * ../catalog.ts. Use {var} placeholders for runtime values. See ./common.ts.
 */

export const modifiers = {
  en: {
    "modifiers.title": "Modifiers",
    "modifiers.subtitle":
      "Reusable option lists (sizes, toppings, prep notes) you can attach to any item.",
    "modifiers.new_list": "New modifier list",
    "modifiers.search_placeholder": "Search modifier lists…",
    "modifiers.list_count": "{count} lists",
    "modifiers.catalog_not_found": "Catalog not found.",
    "modifiers.delete_confirm":
      "Delete “{name}”? This cannot be undone. Modifiers inside the list will be removed too.",

    // Errors (server actions)
    "modifiers.error.name_required": "Modifier list name is required.",
    "modifiers.error.max_lt_min":
      "Max selected must be greater than or equal to min selected.",
    "modifiers.error.max_length_positive":
      "Max length must be a positive number.",
    "modifiers.error.create_failed": "Failed to create list.",
    "modifiers.error.detach_first": "Detach from {count} items first.",

    // Toasts
    "modifiers.toast.list_saved": "List saved.",
    "modifiers.toast.list_created": "List created.",
    "modifiers.toast.list_enabled": "List enabled.",
    "modifiers.toast.list_disabled": "List disabled.",
    "modifiers.toast.list_deleted": "List deleted.",
    "modifiers.toast.detached": "Detached.",

    // Empty state
    "modifiers.empty.title": "No modifier lists yet",
    "modifiers.empty.description":
      "Modifier lists let customers customize items at checkout — “Choose a size,” “Add toppings,” or “Leave a note.” Build one, then attach it to as many items as you like.",

    // Kind badges
    "modifiers.kind.list": "List",
    "modifiers.kind.text": "Text",

    // Table
    "modifiers.table.name": "Name",
    "modifiers.table.kind": "Kind",
    "modifiers.table.modifiers": "Modifiers",
    "modifiers.table.attached_items": "Attached items",
    "modifiers.table.active": "Active",
    "modifiers.table.internal": "Internal: {name}",
    "modifiers.table.required_text": "Required text",
    "modifiers.table.optional_text": "Optional text",
    "modifiers.table.disable_aria": "Disable {name}",
    "modifiers.table.enable_aria": "Enable {name}",
    "modifiers.table.more_actions_aria": "More actions",
    "modifiers.table.attach_action": "Attach to items…",

    // Editor dialog
    "modifiers.editor.title_fallback": "Modifier list",
    "modifiers.editor.desc_list":
      "Build a set of choices customers pick from at checkout.",
    "modifiers.editor.desc_text":
      "Let customers type a short note (size of a kid's shirt, prep request, etc.).",
    "modifiers.editor.unsaved": "Unsaved",
    "modifiers.editor.create_list": "Create list",
    "modifiers.editor.discard_confirm": "Discard unsaved changes?",
    "modifiers.editor.name_label": "Name",
    "modifiers.editor.name_placeholder": "Size, Toppings, Note for kitchen…",
    "modifiers.editor.name_hint": "The label customers see at checkout.",
    "modifiers.editor.internal_label": "Internal name (optional)",
    "modifiers.editor.internal_placeholder": "Only you see this",
    "modifiers.editor.kind_label": "Kind",
    "modifiers.editor.kind_list": "List of choices",
    "modifiers.editor.kind_text": "Free text",
    "modifiers.editor.min_label": "Min selections",
    "modifiers.editor.max_label": "Max selections",
    "modifiers.editor.no_limit": "No limit",
    "modifiers.editor.minmax_hint":
      "Set min=0 to make the list optional. Leave max blank to allow any number of selections.",
    "modifiers.editor.choices_label": "Choices",
    "modifiers.editor.add_choice": "Add choice",
    "modifiers.editor.no_choices": "No choices yet. Add at least one.",
    "modifiers.editor.text_required_label": "Text is required",
    "modifiers.editor.text_required_hint":
      "Customer must type something to add the item to cart.",
    "modifiers.editor.max_length_label": "Max length (optional)",
    "modifiers.editor.max_length_hint":
      "Cap on how long the typed note can be.",
    "modifiers.editor.active_label": "Active",
    "modifiers.editor.active_hint":
      "Inactive lists are hidden from customer checkout but stay attached to items.",
    "modifiers.editor.drag_aria": "Drag to reorder",
    "modifiers.editor.choice_name_placeholder": "Choice name",
    "modifiers.editor.price_aria": "Price",
    "modifiers.editor.default_tooltip":
      "Pre-selected for the customer by default",
    "modifiers.editor.default_toggle": "Default",
    "modifiers.editor.remove_choice_aria": "Remove choice",

    // Attach-to-items dialog
    "modifiers.attach.title": "Attach {target} to items",
    "modifiers.attach.title_list": "list",
    "modifiers.attach.description":
      "Customers will see this list at checkout on every item it's attached to.",
    "modifiers.attach.currently_attached": "Currently attached ({count})",
    "modifiers.attach.detach_aria": "Detach {name}",
    "modifiers.attach.add_more": "Add to more items",
    "modifiers.attach.clear": "Clear",
    "modifiers.attach.select_all_visible": "Select all visible",
    "modifiers.attach.search_placeholder": "Search items…",
    "modifiers.attach.no_matches": "No matches.",
    "modifiers.attach.no_items": "This catalog has no items yet.",
    "modifiers.attach.all_attached":
      "Every item already has this list attached.",
    "modifiers.attach.attaching": "Attaching…",
    "modifiers.attach.attach": "Attach",
    "modifiers.attach.attach_count": "Attach to {count} items",
    "modifiers.attach.toast_attached": "Attached to {count} items.",
  },
  ru: {
    "modifiers.title": "Модификаторы",
    "modifiers.subtitle":
      "Многоразовые списки опций (размеры, добавки, пожелания к приготовлению), которые можно прикрепить к любой позиции.",
    "modifiers.new_list": "Новый список модификаторов",
    "modifiers.search_placeholder": "Поиск списков модификаторов…",
    "modifiers.list_count": "Списков: {count}",
    "modifiers.catalog_not_found": "Каталог не найден.",
    "modifiers.delete_confirm":
      "Удалить «{name}»? Это действие нельзя отменить. Модификаторы внутри списка тоже будут удалены.",

    "modifiers.error.name_required":
      "Укажите название списка модификаторов.",
    "modifiers.error.max_lt_min":
      "Максимум выбора должен быть не меньше минимума.",
    "modifiers.error.max_length_positive":
      "Максимальная длина должна быть положительным числом.",
    "modifiers.error.create_failed": "Не удалось создать список.",
    "modifiers.error.detach_first": "Сначала открепите от {count} позиций.",

    "modifiers.toast.list_saved": "Список сохранён.",
    "modifiers.toast.list_created": "Список создан.",
    "modifiers.toast.list_enabled": "Список включён.",
    "modifiers.toast.list_disabled": "Список выключен.",
    "modifiers.toast.list_deleted": "Список удалён.",
    "modifiers.toast.detached": "Откреплено.",

    "modifiers.empty.title": "Пока нет списков модификаторов",
    "modifiers.empty.description":
      "Списки модификаторов позволяют покупателям настраивать позиции при оформлении заказа — «Выберите размер», «Добавьте топпинги» или «Оставьте пожелание». Создайте список и прикрепите его к любому количеству позиций.",

    "modifiers.kind.list": "Список",
    "modifiers.kind.text": "Текст",

    "modifiers.table.name": "Название",
    "modifiers.table.kind": "Тип",
    "modifiers.table.modifiers": "Модификаторы",
    "modifiers.table.attached_items": "Прикреплённые позиции",
    "modifiers.table.active": "Активен",
    "modifiers.table.internal": "Внутреннее: {name}",
    "modifiers.table.required_text": "Обязательный текст",
    "modifiers.table.optional_text": "Необязательный текст",
    "modifiers.table.disable_aria": "Выключить «{name}»",
    "modifiers.table.enable_aria": "Включить «{name}»",
    "modifiers.table.more_actions_aria": "Ещё действия",
    "modifiers.table.attach_action": "Прикрепить к позициям…",

    "modifiers.editor.title_fallback": "Список модификаторов",
    "modifiers.editor.desc_list":
      "Создайте набор вариантов, из которых покупатель выбирает при оформлении заказа.",
    "modifiers.editor.desc_text":
      "Позвольте покупателям оставить короткую заметку (размер детской футболки, пожелание к приготовлению и т. п.).",
    "modifiers.editor.unsaved": "Не сохранено",
    "modifiers.editor.create_list": "Создать список",
    "modifiers.editor.discard_confirm": "Отменить несохранённые изменения?",
    "modifiers.editor.name_label": "Название",
    "modifiers.editor.name_placeholder": "Размер, Топпинги, Пожелание для кухни…",
    "modifiers.editor.name_hint":
      "Название, которое покупатели видят при оформлении заказа.",
    "modifiers.editor.internal_label": "Внутреннее название (необязательно)",
    "modifiers.editor.internal_placeholder": "Видите только вы",
    "modifiers.editor.kind_label": "Тип",
    "modifiers.editor.kind_list": "Список вариантов",
    "modifiers.editor.kind_text": "Свободный текст",
    "modifiers.editor.min_label": "Минимум выбора",
    "modifiers.editor.max_label": "Максимум выбора",
    "modifiers.editor.no_limit": "Без ограничений",
    "modifiers.editor.minmax_hint":
      "Укажите минимум 0, чтобы список был необязательным. Оставьте максимум пустым, чтобы разрешить любое количество вариантов.",
    "modifiers.editor.choices_label": "Варианты",
    "modifiers.editor.add_choice": "Добавить вариант",
    "modifiers.editor.no_choices": "Пока нет вариантов. Добавьте хотя бы один.",
    "modifiers.editor.text_required_label": "Текст обязателен",
    "modifiers.editor.text_required_hint":
      "Покупатель должен что-то ввести, чтобы добавить позицию в корзину.",
    "modifiers.editor.max_length_label": "Максимальная длина (необязательно)",
    "modifiers.editor.max_length_hint":
      "Ограничение на длину вводимой заметки.",
    "modifiers.editor.active_label": "Активен",
    "modifiers.editor.active_hint":
      "Неактивные списки скрыты при оформлении заказа, но остаются прикреплёнными к позициям.",
    "modifiers.editor.drag_aria": "Перетащите, чтобы изменить порядок",
    "modifiers.editor.choice_name_placeholder": "Название варианта",
    "modifiers.editor.price_aria": "Цена",
    "modifiers.editor.default_tooltip": "Выбрано для покупателя по умолчанию",
    "modifiers.editor.default_toggle": "По умолчанию",
    "modifiers.editor.remove_choice_aria": "Удалить вариант",

    "modifiers.attach.title": "Прикрепить {target} к позициям",
    "modifiers.attach.title_list": "список",
    "modifiers.attach.description":
      "Покупатели увидят этот список при оформлении заказа на каждой позиции, к которой он прикреплён.",
    "modifiers.attach.currently_attached": "Уже прикреплено ({count})",
    "modifiers.attach.detach_aria": "Открепить {name}",
    "modifiers.attach.add_more": "Добавить к другим позициям",
    "modifiers.attach.clear": "Очистить",
    "modifiers.attach.select_all_visible": "Выбрать все видимые",
    "modifiers.attach.search_placeholder": "Поиск позиций…",
    "modifiers.attach.no_matches": "Ничего не найдено.",
    "modifiers.attach.no_items": "В этом каталоге пока нет позиций.",
    "modifiers.attach.all_attached":
      "Этот список уже прикреплён ко всем позициям.",
    "modifiers.attach.attaching": "Прикрепление…",
    "modifiers.attach.attach": "Прикрепить",
    "modifiers.attach.attach_count": "Прикрепить к {count} позициям",
    "modifiers.attach.toast_attached": "Прикреплено к {count} позициям.",
  },
  "uz-Latn": {
    "modifiers.title": "Modifikatorlar",
    "modifiers.subtitle":
      "Istalgan mahsulotga biriktirsa bo‘ladigan qayta ishlatiluvchi variant ro‘yxatlari (o‘lchamlar, qo‘shimchalar, tayyorlash izohlari).",
    "modifiers.new_list": "Yangi modifikatorlar ro‘yxati",
    "modifiers.search_placeholder": "Modifikatorlar ro‘yxatlarini qidirish…",
    "modifiers.list_count": "Ro‘yxatlar: {count}",
    "modifiers.catalog_not_found": "Katalog topilmadi.",
    "modifiers.delete_confirm":
      "«{name}» o‘chirilsinmi? Buni ortga qaytarib bo‘lmaydi. Ro‘yxatdagi modifikatorlar ham o‘chiriladi.",

    "modifiers.error.name_required":
      "Modifikatorlar ro‘yxati nomini kiriting.",
    "modifiers.error.max_lt_min":
      "Maksimal tanlov minimaldan kichik bo‘lmasligi kerak.",
    "modifiers.error.max_length_positive":
      "Maksimal uzunlik musbat son bo‘lishi kerak.",
    "modifiers.error.create_failed": "Ro‘yxatni yaratib bo‘lmadi.",
    "modifiers.error.detach_first": "Avval {count} ta mahsulotdan uzing.",

    "modifiers.toast.list_saved": "Ro‘yxat saqlandi.",
    "modifiers.toast.list_created": "Ro‘yxat yaratildi.",
    "modifiers.toast.list_enabled": "Ro‘yxat yoqildi.",
    "modifiers.toast.list_disabled": "Ro‘yxat o‘chirib qo‘yildi.",
    "modifiers.toast.list_deleted": "Ro‘yxat o‘chirildi.",
    "modifiers.toast.detached": "Uzildi.",

    "modifiers.empty.title": "Hozircha modifikatorlar ro‘yxati yo‘q",
    "modifiers.empty.description":
      "Modifikatorlar ro‘yxatlari mijozlarga buyurtma rasmiylashtirishda mahsulotlarni moslashtirishga imkon beradi — «O‘lcham tanlang», «Qo‘shimcha qo‘shing» yoki «Izoh qoldiring». Bittasini yarating va uni xohlagancha mahsulotga biriktiring.",

    "modifiers.kind.list": "Ro‘yxat",
    "modifiers.kind.text": "Matn",

    "modifiers.table.name": "Nomi",
    "modifiers.table.kind": "Turi",
    "modifiers.table.modifiers": "Modifikatorlar",
    "modifiers.table.attached_items": "Biriktirilgan mahsulotlar",
    "modifiers.table.active": "Faol",
    "modifiers.table.internal": "Ichki: {name}",
    "modifiers.table.required_text": "Majburiy matn",
    "modifiers.table.optional_text": "Ixtiyoriy matn",
    "modifiers.table.disable_aria": "«{name}»ni o‘chirib qo‘yish",
    "modifiers.table.enable_aria": "«{name}»ni yoqish",
    "modifiers.table.more_actions_aria": "Boshqa amallar",
    "modifiers.table.attach_action": "Mahsulotlarga biriktirish…",

    "modifiers.editor.title_fallback": "Modifikatorlar ro‘yxati",
    "modifiers.editor.desc_list":
      "Mijoz buyurtma rasmiylashtirishda tanlaydigan variantlar to‘plamini yarating.",
    "modifiers.editor.desc_text":
      "Mijozlarga qisqa izoh yozishga ruxsat bering (bolalar futbolkasi o‘lchami, tayyorlash iltimosi va h.k.).",
    "modifiers.editor.unsaved": "Saqlanmagan",
    "modifiers.editor.create_list": "Ro‘yxat yaratish",
    "modifiers.editor.discard_confirm":
      "Saqlanmagan o‘zgarishlar bekor qilinsinmi?",
    "modifiers.editor.name_label": "Nomi",
    "modifiers.editor.name_placeholder":
      "O‘lcham, Qo‘shimchalar, Oshxona uchun izoh…",
    "modifiers.editor.name_hint":
      "Mijozlar buyurtma rasmiylashtirishda ko‘radigan nom.",
    "modifiers.editor.internal_label": "Ichki nom (ixtiyoriy)",
    "modifiers.editor.internal_placeholder": "Buni faqat siz ko‘rasiz",
    "modifiers.editor.kind_label": "Turi",
    "modifiers.editor.kind_list": "Variantlar ro‘yxati",
    "modifiers.editor.kind_text": "Erkin matn",
    "modifiers.editor.min_label": "Minimal tanlov",
    "modifiers.editor.max_label": "Maksimal tanlov",
    "modifiers.editor.no_limit": "Cheklovsiz",
    "modifiers.editor.minmax_hint":
      "Ro‘yxatni ixtiyoriy qilish uchun minimalni 0 qiling. Istalgan miqdordagi tanlovga ruxsat berish uchun maksimalni bo‘sh qoldiring.",
    "modifiers.editor.choices_label": "Variantlar",
    "modifiers.editor.add_choice": "Variant qo‘shish",
    "modifiers.editor.no_choices":
      "Hozircha variant yo‘q. Kamida bittasini qo‘shing.",
    "modifiers.editor.text_required_label": "Matn majburiy",
    "modifiers.editor.text_required_hint":
      "Mijoz mahsulotni savatga qo‘shish uchun biror narsa yozishi shart.",
    "modifiers.editor.max_length_label": "Maksimal uzunlik (ixtiyoriy)",
    "modifiers.editor.max_length_hint":
      "Yoziladigan izohning uzunligiga cheklov.",
    "modifiers.editor.active_label": "Faol",
    "modifiers.editor.active_hint":
      "Nofaol ro‘yxatlar buyurtma rasmiylashtirishda mijozdan yashiriladi, lekin mahsulotlarga biriktirilgan holicha qoladi.",
    "modifiers.editor.drag_aria": "Tartibni o‘zgartirish uchun torting",
    "modifiers.editor.choice_name_placeholder": "Variant nomi",
    "modifiers.editor.price_aria": "Narx",
    "modifiers.editor.default_tooltip":
      "Mijoz uchun standart bo‘yicha tanlangan",
    "modifiers.editor.default_toggle": "Standart",
    "modifiers.editor.remove_choice_aria": "Variantni o‘chirish",

    "modifiers.attach.title": "{target}ni mahsulotlarga biriktirish",
    "modifiers.attach.title_list": "ro‘yxat",
    "modifiers.attach.description":
      "Mijozlar ushbu ro‘yxatni u biriktirilgan har bir mahsulotda buyurtma rasmiylashtirishda ko‘radi.",
    "modifiers.attach.currently_attached": "Hozir biriktirilgan ({count})",
    "modifiers.attach.detach_aria": "{name}ni uzish",
    "modifiers.attach.add_more": "Boshqa mahsulotlarga qo‘shish",
    "modifiers.attach.clear": "Tozalash",
    "modifiers.attach.select_all_visible": "Ko‘ringanlarning hammasini tanlash",
    "modifiers.attach.search_placeholder": "Mahsulotlarni qidirish…",
    "modifiers.attach.no_matches": "Mos keladigani topilmadi.",
    "modifiers.attach.no_items": "Bu katalogda hali mahsulotlar yo‘q.",
    "modifiers.attach.all_attached":
      "Bu ro‘yxat allaqachon barcha mahsulotlarga biriktirilgan.",
    "modifiers.attach.attaching": "Biriktirilmoqda…",
    "modifiers.attach.attach": "Biriktirish",
    "modifiers.attach.attach_count": "{count} ta mahsulotga biriktirish",
    "modifiers.attach.toast_attached": "{count} ta mahsulotga biriktirildi.",
  },
};
