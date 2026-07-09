/**
 * activation — publish/activation flow + setup checklist strings.
 *
 * Covers the floating setup guide, the draft/publish banner, the publish
 * step machine, the "Secure your shop" dialog, and the publish server action.
 *
 * Contract: export { en, ru, "uz-Latn" } objects of flat dotted keys prefixed
 * "activation.". English is canonical (defines the key union); ru / uz-Latn are
 * type-checked against it in ../catalog.ts. Use {var} placeholders for runtime
 * values. See ./common.ts for the full contract.
 */

export const activation = {
  en: {
    // Floating setup checklist
    "activation.checklist.title": "Get ready to open",
    "activation.checklist.open_aria": "Open setup checklist",
    "activation.checklist.aria": "Setup checklist",
    "activation.checklist.done_hint": "done — nothing here blocks you.",
    "activation.checklist.collapse_aria": "Collapse checklist",
    "activation.checklist.step.menu": "Make the menu yours — edit or add an item",
    "activation.checklist.step.photo": "Add a real photo",
    "activation.checklist.step.secure": "Secure your shop — add a login",
    "activation.checklist.step.hours": "Set your opening hours",
    "activation.checklist.step.theme": "Pick your look",
    "activation.checklist.step.alerts": "Get order alerts in Telegram",
    "activation.checklist.step.publish": "Publish your shop",

    // Draft banner
    "activation.banner.draft": "Draft",
    "activation.banner.draft_hint": "— only you can see your shop.",
    "activation.publish": "Publish",

    // Account menu (nav-user)
    "activation.nav.plans_billing": "Plans & Billing",
    "activation.nav.account": "Account",
    "activation.nav.billing": "Billing",
    "activation.nav.notifications": "Notifications",
    "activation.nav.logout": "Log out",

    // Publish: slug step
    "activation.publish.slug_title": "Choose your shop link",
    "activation.publish.slug_desc": "This is the address customers open and the QR code points to. It can't change after you publish.",
    "activation.publish.slug_label": "Shop link",
    "activation.publish.slug_invalid": "Lowercase letters, digits and dashes only (3-64 characters).",
    "activation.publish.preparing_title": "Preparing to publish",
    "activation.publish.preparing_desc": "Loading your shop details.",

    // Publish: demo items step
    "activation.demo.title": "You still have demo items",
    "activation.demo.desc": "These starter items haven't been edited. Customers could order them at the demo prices.",
    "activation.demo.remove": "Remove demo items",
    "activation.demo.keep": "Keep them and publish",

    // Register step
    "activation.register.title": "Create your account",
    "activation.register.desc": "Registering keeps your shop yours — everything you built stays exactly as it is.",
    "activation.register.google": "Continue with Google",
    "activation.register.or_email": "or with email",
    "activation.register.send_code": "Send code",
    "activation.email": "Email",

    // OTP step
    "activation.otp.title": "Enter the code",
    "activation.otp.desc": "We sent a 6-digit code to {email}.",
    "activation.otp.verify_publish": "Verify and publish",
    "activation.otp.signin_claim": "Sign in and claim",
    "activation.otp.different_email": "Use a different email",

    // Claim (email collision) step
    "activation.claim.title": "This email already has an account",
    "activation.claim.desc": "Sign in to it and we'll bring your shop along — nothing you built is lost.",
    "activation.claim.send_code": "Send sign-in code",
    "activation.claim.different_email": "Use a different email instead",
    "activation.claim.expired": "The claim expired — close this dialog and try again.",

    // Publishing / live steps
    "activation.publishing.title": "Publishing",
    "activation.publishing.desc": "Making your shop public.",
    "activation.publishing.message": "Publishing your shop…",
    "activation.live.title": "Your shop is live",
    "activation.live.desc": "Share the link or print the QR — customers can order right now.",
    "activation.live.copy_aria": "Copy link",
    "activation.live.open_storefront": "Open your storefront",
    "activation.live.first_order_title": "Don't miss your first order",
    "activation.live.first_order_desc": "Connect Telegram and new orders ping your phone the moment they arrive.",
    "activation.live.maybe_later": "Maybe later — go to my dashboard",

    // Secure your shop dialog
    "activation.secure.title": "Secure your shop",
    "activation.secure.desc": "Right now your shop only lives in this browser. Add a login so you never lose it — everything you built stays exactly as it is.",
    "activation.secure.verify": "Verify",
    "activation.secure.signin_transfer": "Sign in and transfer",
    "activation.secure.transfer_expired": "The transfer expired — close this and try again.",
    "activation.secured.title": "Your shop is secured",
    "activation.secured.desc": "You can sign back in any time — from any device.",

    // Shared error messages
    "activation.error.session_refresh": "Could not refresh your session. Please try again.",
    "activation.error.verification_failed": "Verification failed",

    // Server action results
    "activation.action.not_signed_in": "Not signed in.",
    "activation.action.org_not_found": "Organization not found.",
    "activation.action.catalog_not_found": "Catalog not found.",
    "activation.action.google_failed": "Failed to start Google sign-in.",
    "activation.action.tg_not_configured": "Telegram sign-in is not configured.",
    "activation.action.tg_unverified": "Telegram sign-in could not be verified. Please try again.",
    "activation.action.claim_start_failed": "Could not start the draft transfer. Please try again.",
    "activation.action.claim_signin_failed": "Could not sign in to your existing account. Please try again.",
    "activation.action.claim_transfer_failed": "Signed in, but the draft transfer failed. Please try again.",
    "activation.action.tg_already_linked": "This account is already linked to a different Telegram user.",
    "activation.action.tg_failed": "Telegram registration failed. Please try again.",
    "activation.action.slug_invalid": "The link can use lowercase letters, digits and dashes (3-64 characters).",
    "activation.action.link_taken": "That link is already taken.",
    "activation.action.publish_failed": "Publishing failed.",
  },
  ru: {
    "activation.checklist.title": "Подготовьтесь к открытию",
    "activation.checklist.open_aria": "Открыть чек-лист настройки",
    "activation.checklist.aria": "Чек-лист настройки",
    "activation.checklist.done_hint": "выполнено — ничего из этого вас не задерживает.",
    "activation.checklist.collapse_aria": "Свернуть чек-лист",
    "activation.checklist.step.menu": "Сделайте меню своим — измените или добавьте позицию",
    "activation.checklist.step.photo": "Добавьте настоящее фото",
    "activation.checklist.step.secure": "Защитите магазин — добавьте вход",
    "activation.checklist.step.hours": "Укажите часы работы",
    "activation.checklist.step.theme": "Выберите оформление",
    "activation.checklist.step.alerts": "Получайте уведомления о заказах в Telegram",
    "activation.checklist.step.publish": "Опубликуйте магазин",

    "activation.banner.draft": "Черновик",
    "activation.banner.draft_hint": "— ваш магазин видите только вы.",
    "activation.publish": "Опубликовать",

    "activation.nav.plans_billing": "Тарифы и оплата",
    "activation.nav.account": "Аккаунт",
    "activation.nav.billing": "Оплата",
    "activation.nav.notifications": "Уведомления",
    "activation.nav.logout": "Выйти",

    "activation.publish.slug_title": "Выберите ссылку магазина",
    "activation.publish.slug_desc": "Это адрес, который открывают клиенты и на который ведёт QR-код. После публикации его нельзя изменить.",
    "activation.publish.slug_label": "Ссылка магазина",
    "activation.publish.slug_invalid": "Только строчные буквы, цифры и дефисы (от 3 до 64 символов).",
    "activation.publish.preparing_title": "Подготовка к публикации",
    "activation.publish.preparing_desc": "Загрузка данных магазина.",

    "activation.demo.title": "У вас остались демо-позиции",
    "activation.demo.desc": "Эти стартовые позиции не редактировались. Клиенты могут заказать их по демо-ценам.",
    "activation.demo.remove": "Удалить демо-позиции",
    "activation.demo.keep": "Оставить и опубликовать",

    "activation.register.title": "Создайте аккаунт",
    "activation.register.desc": "Регистрация закрепляет магазин за вами — всё, что вы создали, останется как есть.",
    "activation.register.google": "Продолжить с Google",
    "activation.register.or_email": "или по email",
    "activation.register.send_code": "Отправить код",
    "activation.email": "Email",

    "activation.otp.title": "Введите код",
    "activation.otp.desc": "Мы отправили 6-значный код на {email}.",
    "activation.otp.verify_publish": "Подтвердить и опубликовать",
    "activation.otp.signin_claim": "Войти и забрать магазин",
    "activation.otp.different_email": "Использовать другой email",

    "activation.claim.title": "На этот email уже есть аккаунт",
    "activation.claim.desc": "Войдите в него, и мы перенесём ваш магазин — ничего из созданного не потеряется.",
    "activation.claim.send_code": "Отправить код для входа",
    "activation.claim.different_email": "Указать другой email",
    "activation.claim.expired": "Срок запроса истёк — закройте окно и попробуйте снова.",

    "activation.publishing.title": "Публикация",
    "activation.publishing.desc": "Делаем ваш магазин публичным.",
    "activation.publishing.message": "Публикуем ваш магазин…",
    "activation.live.title": "Ваш магазин запущен",
    "activation.live.desc": "Поделитесь ссылкой или распечатайте QR — клиенты уже могут заказывать.",
    "activation.live.copy_aria": "Копировать ссылку",
    "activation.live.open_storefront": "Открыть витрину",
    "activation.live.first_order_title": "Не пропустите первый заказ",
    "activation.live.first_order_desc": "Подключите Telegram — и новые заказы придут на телефон в момент оформления.",
    "activation.live.maybe_later": "Позже — перейти в панель",

    "activation.secure.title": "Защитите магазин",
    "activation.secure.desc": "Сейчас ваш магазин хранится только в этом браузере. Добавьте вход, чтобы не потерять его — всё, что вы создали, останется как есть.",
    "activation.secure.verify": "Подтвердить",
    "activation.secure.signin_transfer": "Войти и перенести",
    "activation.secure.transfer_expired": "Срок переноса истёк — закройте окно и попробуйте снова.",
    "activation.secured.title": "Магазин защищён",
    "activation.secured.desc": "Вы сможете войти снова в любой момент — с любого устройства.",

    "activation.error.session_refresh": "Не удалось обновить сессию. Попробуйте снова.",
    "activation.error.verification_failed": "Не удалось подтвердить код",

    "activation.action.not_signed_in": "Вы не вошли в систему.",
    "activation.action.org_not_found": "Организация не найдена.",
    "activation.action.catalog_not_found": "Каталог не найден.",
    "activation.action.google_failed": "Не удалось начать вход через Google.",
    "activation.action.tg_not_configured": "Вход через Telegram не настроен.",
    "activation.action.tg_unverified": "Не удалось подтвердить вход через Telegram. Попробуйте снова.",
    "activation.action.claim_start_failed": "Не удалось начать перенос черновика. Попробуйте снова.",
    "activation.action.claim_signin_failed": "Не удалось войти в существующий аккаунт. Попробуйте снова.",
    "activation.action.claim_transfer_failed": "Вход выполнен, но перенести черновик не удалось. Попробуйте снова.",
    "activation.action.tg_already_linked": "Этот аккаунт уже привязан к другому пользователю Telegram.",
    "activation.action.tg_failed": "Не удалось зарегистрироваться через Telegram. Попробуйте снова.",
    "activation.action.slug_invalid": "В ссылке можно использовать строчные буквы, цифры и дефисы (от 3 до 64 символов).",
    "activation.action.link_taken": "Эта ссылка уже занята.",
    "activation.action.publish_failed": "Не удалось опубликовать.",
  },
  "uz-Latn": {
    "activation.checklist.title": "Ochilishga tayyorlaning",
    "activation.checklist.open_aria": "Sozlash ro‘yxatini ochish",
    "activation.checklist.aria": "Sozlash ro‘yxati",
    "activation.checklist.done_hint": "bajarildi — bularning hech biri sizni to‘xtatmaydi.",
    "activation.checklist.collapse_aria": "Ro‘yxatni yig‘ish",
    "activation.checklist.step.menu": "Menyuni o‘zingizniki qiling — mahsulotni tahrirlang yoki qo‘shing",
    "activation.checklist.step.photo": "Haqiqiy rasm qo‘shing",
    "activation.checklist.step.secure": "Do‘koningizni himoyalang — kirish qo‘shing",
    "activation.checklist.step.hours": "Ish vaqtini belgilang",
    "activation.checklist.step.theme": "Ko‘rinishni tanlang",
    "activation.checklist.step.alerts": "Buyurtmalar haqida Telegram’da xabar oling",
    "activation.checklist.step.publish": "Do‘koningizni chop eting",

    "activation.banner.draft": "Qoralama",
    "activation.banner.draft_hint": "— do‘koningizni faqat siz ko‘rasiz.",
    "activation.publish": "Chop etish",

    "activation.nav.plans_billing": "Tariflar va to‘lov",
    "activation.nav.account": "Hisob",
    "activation.nav.billing": "To‘lov",
    "activation.nav.notifications": "Bildirishnomalar",
    "activation.nav.logout": "Chiqish",

    "activation.publish.slug_title": "Do‘kon havolasini tanlang",
    "activation.publish.slug_desc": "Bu — mijozlar ochadigan va QR-kod yo‘naltiradigan manzil. Chop etilgach, uni o‘zgartirib bo‘lmaydi.",
    "activation.publish.slug_label": "Do‘kon havolasi",
    "activation.publish.slug_invalid": "Faqat kichik harflar, raqamlar va chiziqchalar (3–64 belgi).",
    "activation.publish.preparing_title": "Chop etishga tayyorlanmoqda",
    "activation.publish.preparing_desc": "Do‘kon ma’lumotlari yuklanmoqda.",

    "activation.demo.title": "Sizda hali demo mahsulotlar bor",
    "activation.demo.desc": "Bu boshlang‘ich mahsulotlar tahrirlanmagan. Mijozlar ularni demo narxlarda buyurtma qilishi mumkin.",
    "activation.demo.remove": "Demo mahsulotlarni o‘chirish",
    "activation.demo.keep": "Qoldirib, chop etish",

    "activation.register.title": "Hisob yarating",
    "activation.register.desc": "Ro‘yxatdan o‘tish do‘konni sizga biriktiradi — yaratgan hamma narsangiz o‘zgarishsiz qoladi.",
    "activation.register.google": "Google bilan davom etish",
    "activation.register.or_email": "yoki email orqali",
    "activation.register.send_code": "Kod yuborish",
    "activation.email": "Email",

    "activation.otp.title": "Kodni kiriting",
    "activation.otp.desc": "Biz {email} ga 6 xonali kod yubordik.",
    "activation.otp.verify_publish": "Tasdiqlab, chop etish",
    "activation.otp.signin_claim": "Kirish va do‘konni olish",
    "activation.otp.different_email": "Boshqa email ishlatish",

    "activation.claim.title": "Bu email uchun hisob allaqachon mavjud",
    "activation.claim.desc": "Unga kiring va biz do‘koningizni ko‘chiramiz — yaratgan hech narsangiz yo‘qolmaydi.",
    "activation.claim.send_code": "Kirish kodini yuborish",
    "activation.claim.different_email": "Boshqa email kiritish",
    "activation.claim.expired": "So‘rov muddati tugadi — oynani yoping va qayta urinib ko‘ring.",

    "activation.publishing.title": "Chop etilmoqda",
    "activation.publishing.desc": "Do‘koningiz hammaga ochilyapti.",
    "activation.publishing.message": "Do‘koningiz chop etilmoqda…",
    "activation.live.title": "Do‘koningiz ishga tushdi",
    "activation.live.desc": "Havolani ulashing yoki QR-ni chop eting — mijozlar hoziroq buyurtma bera oladi.",
    "activation.live.copy_aria": "Havoladan nusxa olish",
    "activation.live.open_storefront": "Vitrinani ochish",
    "activation.live.first_order_title": "Birinchi buyurtmani o‘tkazib yubormang",
    "activation.live.first_order_desc": "Telegram’ni ulang — yangi buyurtmalar kelishi bilanoq telefoningizga xabar keladi.",
    "activation.live.maybe_later": "Keyinroq — boshqaruv paneliga o‘tish",

    "activation.secure.title": "Do‘koningizni himoyalang",
    "activation.secure.desc": "Hozir do‘koningiz faqat shu brauzerda saqlanadi. Uni yo‘qotmaslik uchun kirish qo‘shing — yaratgan hamma narsangiz o‘zgarishsiz qoladi.",
    "activation.secure.verify": "Tasdiqlash",
    "activation.secure.signin_transfer": "Kirish va ko‘chirish",
    "activation.secure.transfer_expired": "Ko‘chirish muddati tugadi — oynani yoping va qayta urinib ko‘ring.",
    "activation.secured.title": "Do‘koningiz himoyalandi",
    "activation.secured.desc": "Istalgan vaqtda — istalgan qurilmadan qayta kira olasiz.",

    "activation.error.session_refresh": "Sessiyani yangilab bo‘lmadi. Qayta urinib ko‘ring.",
    "activation.error.verification_failed": "Tasdiqlab bo‘lmadi",

    "activation.action.not_signed_in": "Tizimga kirmagansiz.",
    "activation.action.org_not_found": "Tashkilot topilmadi.",
    "activation.action.catalog_not_found": "Katalog topilmadi.",
    "activation.action.google_failed": "Google orqali kirishni boshlab bo‘lmadi.",
    "activation.action.tg_not_configured": "Telegram orqali kirish sozlanmagan.",
    "activation.action.tg_unverified": "Telegram orqali kirishni tasdiqlab bo‘lmadi. Qayta urinib ko‘ring.",
    "activation.action.claim_start_failed": "Qoralamani ko‘chirishni boshlab bo‘lmadi. Qayta urinib ko‘ring.",
    "activation.action.claim_signin_failed": "Mavjud hisobingizga kirib bo‘lmadi. Qayta urinib ko‘ring.",
    "activation.action.claim_transfer_failed": "Kirdingiz, lekin qoralamani ko‘chirib bo‘lmadi. Qayta urinib ko‘ring.",
    "activation.action.tg_already_linked": "Bu hisob allaqachon boshqa Telegram foydalanuvchisiga bog‘langan.",
    "activation.action.tg_failed": "Telegram orqali ro‘yxatdan o‘tib bo‘lmadi. Qayta urinib ko‘ring.",
    "activation.action.slug_invalid": "Havolada kichik harflar, raqamlar va chiziqchalardan foydalanish mumkin (3–64 belgi).",
    "activation.action.link_taken": "Bu havola allaqachon band.",
    "activation.action.publish_failed": "Chop etib bo‘lmadi.",
  },
};
