/**
 * Canonical locale registry.
 *
 * Single source of truth for every language Krafta supports as a translation
 * target. Used by:
 *   - Translations workbench (add-language dialog)
 *   - Future storefront locale picker (customer-facing)
 *   - Future intl utilities (dir-aware <html dir>, number formatting, etc.)
 *
 * Why a registry instead of letting merchants type any code:
 *   - One canonical mapping prevents bugs like "rus" vs "ru" (BCP-47 is `ru`)
 *   - We control which scripts are exposed (uz-Latn vs uz-Cyrl is a real
 *     distinction; users shouldn't have to know that)
 *   - Direction (LTR/RTL) is derivable from the code — never a user input,
 *     never a guess
 *   - Native names render in their own script ("Русский", "Oʻzbek tili",
 *     "العربية") which is the universal pattern for language pickers
 *
 * When adding a new language:
 *   1. Pick the smallest BCP-47 / IETF tag that disambiguates correctly.
 *      - Use `ru`, `en`, `es` for languages where script is implicit
 *      - Use script suffix when needed: `uz-Latn`, `uz-Cyrl`, `zh-Hans`, `zh-Hant`
 *      - Use regional suffix only when content meaningfully differs:
 *        `pt-BR` vs `pt-PT`, `es-MX` vs `es`
 *   2. Native name should be the language's own name in its own script.
 *      For Latin-script languages with diacritics, use them (Türkçe not Turkce).
 *   3. English name is the most common English form.
 *   4. Direction defaults to "ltr"; set "rtl" for Arabic-script and Hebrew-script
 *      languages.
 *   5. Set `recommended: true` ONLY for Tashkent + adjacent regional markets
 *      Krafta primarily serves. Recommended locales surface at the top of
 *      the picker.
 *
 * Code list curated from ISO 639-1/3 + BCP 47. We deliberately exclude
 * dead/sleeping languages and constructed languages (Esperanto, Klingon).
 */

export type LocaleDirection = "ltr" | "rtl";

export type LocaleDefinition = {
  /** BCP 47 code stored in catalog_locales.locale */
  code: string;
  /** Display name in the language itself */
  nativeName: string;
  /** English name for secondary display + fuzzy search */
  englishName: string;
  /** Text direction — resolved from registry, never a merchant input */
  direction: LocaleDirection;
  /** Promoted to top of pickers for Krafta's primary markets */
  recommended?: boolean;
};

// =============================================================================
// Recommended — the languages a brand-new Krafta merchant in Tashkent
// is most likely to actually translate INTO on day 1.
//
// Trimmed to the absolute essentials per founder feedback. Other regional
// languages (Tajik, Kazakh, Kyrgyz, Turkmen, Turkish, Arabic, Persian,
// Cyrillic Uzbek) are valid choices — they live under "All languages"
// alphabetically and surface immediately via search.
// =============================================================================

const RECOMMENDED: LocaleDefinition[] = [
  { code: "ru", nativeName: "Русский", englishName: "Russian", direction: "ltr", recommended: true },
  { code: "uz-Latn", nativeName: "Oʻzbek tili", englishName: "Uzbek (Latin)", direction: "ltr", recommended: true },
  { code: "en", nativeName: "English", englishName: "English", direction: "ltr", recommended: true },
];

// =============================================================================
// All other supported languages (alphabetical by English name)
// =============================================================================

const OTHER: LocaleDefinition[] = [
  { code: "af", nativeName: "Afrikaans", englishName: "Afrikaans", direction: "ltr" },
  { code: "sq", nativeName: "Shqip", englishName: "Albanian", direction: "ltr" },
  { code: "am", nativeName: "አማርኛ", englishName: "Amharic", direction: "ltr" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", direction: "rtl" },
  { code: "hy", nativeName: "Հայերեն", englishName: "Armenian", direction: "ltr" },
  { code: "az-Latn", nativeName: "Azərbaycan dili", englishName: "Azerbaijani (Latin)", direction: "ltr" },
  { code: "az-Cyrl", nativeName: "Азәрбајҹан дили", englishName: "Azerbaijani (Cyrillic)", direction: "ltr" },
  { code: "eu", nativeName: "Euskara", englishName: "Basque", direction: "ltr" },
  { code: "be", nativeName: "Беларуская", englishName: "Belarusian", direction: "ltr" },
  { code: "bn", nativeName: "বাংলা", englishName: "Bengali", direction: "ltr" },
  { code: "bs", nativeName: "Bosanski", englishName: "Bosnian", direction: "ltr" },
  { code: "bg", nativeName: "Български", englishName: "Bulgarian", direction: "ltr" },
  { code: "my", nativeName: "မြန်မာ", englishName: "Burmese", direction: "ltr" },
  { code: "ca", nativeName: "Català", englishName: "Catalan", direction: "ltr" },
  { code: "zh-Hans", nativeName: "简体中文", englishName: "Chinese (Simplified)", direction: "ltr" },
  { code: "zh-Hant", nativeName: "繁體中文", englishName: "Chinese (Traditional)", direction: "ltr" },
  { code: "hr", nativeName: "Hrvatski", englishName: "Croatian", direction: "ltr" },
  { code: "cs", nativeName: "Čeština", englishName: "Czech", direction: "ltr" },
  { code: "da", nativeName: "Dansk", englishName: "Danish", direction: "ltr" },
  { code: "nl", nativeName: "Nederlands", englishName: "Dutch", direction: "ltr" },
  { code: "et", nativeName: "Eesti", englishName: "Estonian", direction: "ltr" },
  { code: "fil", nativeName: "Filipino", englishName: "Filipino", direction: "ltr" },
  { code: "fi", nativeName: "Suomi", englishName: "Finnish", direction: "ltr" },
  { code: "fr", nativeName: "Français", englishName: "French", direction: "ltr" },
  { code: "gl", nativeName: "Galego", englishName: "Galician", direction: "ltr" },
  { code: "ka", nativeName: "ქართული", englishName: "Georgian", direction: "ltr" },
  { code: "de", nativeName: "Deutsch", englishName: "German", direction: "ltr" },
  { code: "el", nativeName: "Ελληνικά", englishName: "Greek", direction: "ltr" },
  { code: "gu", nativeName: "ગુજરાતી", englishName: "Gujarati", direction: "ltr" },
  { code: "ha", nativeName: "Hausa", englishName: "Hausa", direction: "ltr" },
  { code: "he", nativeName: "עברית", englishName: "Hebrew", direction: "rtl" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", direction: "ltr" },
  { code: "hu", nativeName: "Magyar", englishName: "Hungarian", direction: "ltr" },
  { code: "is", nativeName: "Íslenska", englishName: "Icelandic", direction: "ltr" },
  { code: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian", direction: "ltr" },
  { code: "ga", nativeName: "Gaeilge", englishName: "Irish", direction: "ltr" },
  { code: "it", nativeName: "Italiano", englishName: "Italian", direction: "ltr" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese", direction: "ltr" },
  { code: "kn", nativeName: "ಕನ್ನಡ", englishName: "Kannada", direction: "ltr" },
  { code: "kk-Latn", nativeName: "Qazaq tili", englishName: "Kazakh (Latin)", direction: "ltr" },
  { code: "kk-Cyrl", nativeName: "Қазақ тілі", englishName: "Kazakh (Cyrillic)", direction: "ltr" },
  { code: "km", nativeName: "ខ្មែរ", englishName: "Khmer", direction: "ltr" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", direction: "ltr" },
  { code: "ku", nativeName: "Kurdî", englishName: "Kurdish (Kurmanji)", direction: "ltr" },
  { code: "ckb", nativeName: "کوردیی ناوەندی", englishName: "Kurdish (Sorani)", direction: "rtl" },
  { code: "ky", nativeName: "Кыргызча", englishName: "Kyrgyz", direction: "ltr" },
  { code: "lo", nativeName: "ລາວ", englishName: "Lao", direction: "ltr" },
  { code: "lv", nativeName: "Latviešu", englishName: "Latvian", direction: "ltr" },
  { code: "lt", nativeName: "Lietuvių", englishName: "Lithuanian", direction: "ltr" },
  { code: "lb", nativeName: "Lëtzebuergesch", englishName: "Luxembourgish", direction: "ltr" },
  { code: "mk", nativeName: "Македонски", englishName: "Macedonian", direction: "ltr" },
  { code: "ms", nativeName: "Bahasa Melayu", englishName: "Malay", direction: "ltr" },
  { code: "ml", nativeName: "മലയാളം", englishName: "Malayalam", direction: "ltr" },
  { code: "mt", nativeName: "Malti", englishName: "Maltese", direction: "ltr" },
  { code: "mr", nativeName: "मराठी", englishName: "Marathi", direction: "ltr" },
  { code: "mn", nativeName: "Монгол", englishName: "Mongolian", direction: "ltr" },
  { code: "ne", nativeName: "नेपाली", englishName: "Nepali", direction: "ltr" },
  { code: "nb", nativeName: "Norsk Bokmål", englishName: "Norwegian Bokmål", direction: "ltr" },
  { code: "nn", nativeName: "Norsk Nynorsk", englishName: "Norwegian Nynorsk", direction: "ltr" },
  { code: "or", nativeName: "ଓଡ଼ିଆ", englishName: "Odia", direction: "ltr" },
  { code: "ps", nativeName: "پښتو", englishName: "Pashto", direction: "rtl" },
  { code: "fa", nativeName: "فارسی", englishName: "Persian / Farsi", direction: "rtl" },
  { code: "pl", nativeName: "Polski", englishName: "Polish", direction: "ltr" },
  { code: "pt-BR", nativeName: "Português (Brasil)", englishName: "Portuguese (Brazil)", direction: "ltr" },
  { code: "pt-PT", nativeName: "Português (Portugal)", englishName: "Portuguese (Portugal)", direction: "ltr" },
  { code: "pa", nativeName: "ਪੰਜਾਬੀ", englishName: "Punjabi", direction: "ltr" },
  { code: "ro", nativeName: "Română", englishName: "Romanian", direction: "ltr" },
  { code: "sr-Cyrl", nativeName: "Српски", englishName: "Serbian (Cyrillic)", direction: "ltr" },
  { code: "sr-Latn", nativeName: "Srpski", englishName: "Serbian (Latin)", direction: "ltr" },
  { code: "sd", nativeName: "سنڌي", englishName: "Sindhi", direction: "rtl" },
  { code: "si", nativeName: "සිංහල", englishName: "Sinhala", direction: "ltr" },
  { code: "sk", nativeName: "Slovenčina", englishName: "Slovak", direction: "ltr" },
  { code: "sl", nativeName: "Slovenščina", englishName: "Slovenian", direction: "ltr" },
  { code: "so", nativeName: "Soomaali", englishName: "Somali", direction: "ltr" },
  { code: "es", nativeName: "Español", englishName: "Spanish", direction: "ltr" },
  { code: "es-MX", nativeName: "Español (México)", englishName: "Spanish (Mexico)", direction: "ltr" },
  { code: "sw", nativeName: "Kiswahili", englishName: "Swahili", direction: "ltr" },
  { code: "sv", nativeName: "Svenska", englishName: "Swedish", direction: "ltr" },
  { code: "tg-Cyrl", nativeName: "Тоҷикӣ", englishName: "Tajik (Cyrillic)", direction: "ltr" },
  { code: "ta", nativeName: "தமிழ்", englishName: "Tamil", direction: "ltr" },
  { code: "te", nativeName: "తెలుగు", englishName: "Telugu", direction: "ltr" },
  { code: "th", nativeName: "ไทย", englishName: "Thai", direction: "ltr" },
  { code: "ti", nativeName: "ትግርኛ", englishName: "Tigrinya", direction: "ltr" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish", direction: "ltr" },
  { code: "tk", nativeName: "Türkmen dili", englishName: "Turkmen", direction: "ltr" },
  { code: "uk", nativeName: "Українська", englishName: "Ukrainian", direction: "ltr" },
  { code: "ur", nativeName: "اردو", englishName: "Urdu", direction: "rtl" },
  { code: "ug", nativeName: "ئۇيغۇرچە", englishName: "Uyghur", direction: "rtl" },
  { code: "uz-Cyrl", nativeName: "Ўзбек тили", englishName: "Uzbek (Cyrillic)", direction: "ltr" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", direction: "ltr" },
  { code: "cy", nativeName: "Cymraeg", englishName: "Welsh", direction: "ltr" },
  { code: "yi", nativeName: "ייִדיש", englishName: "Yiddish", direction: "rtl" },
  { code: "yo", nativeName: "Yorùbá", englishName: "Yoruba", direction: "ltr" },
  { code: "zu", nativeName: "isiZulu", englishName: "Zulu", direction: "ltr" },
];

// =============================================================================
// Public API
// =============================================================================

export const LOCALES: readonly LocaleDefinition[] = [...RECOMMENDED, ...OTHER];

export const RECOMMENDED_LOCALES: readonly LocaleDefinition[] = RECOMMENDED;
export const OTHER_LOCALES: readonly LocaleDefinition[] = OTHER;

const LOCALE_BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));

/** Look up a registered locale by BCP-47 code. Returns null if unknown. */
export function getLocaleDefinition(code: string): LocaleDefinition | null {
  return LOCALE_BY_CODE.get(code) ?? null;
}

/**
 * Resolve text direction for a locale code. Returns "ltr" for any unknown
 * code — safe default for the storefront if a merchant somehow created a
 * locale outside the registry (e.g. older catalogs from before this registry
 * existed).
 */
export function resolveDirection(code: string): LocaleDirection {
  return getLocaleDefinition(code)?.direction ?? "ltr";
}

/**
 * Native display name for a locale code. Falls back to the code itself if
 * unknown.
 */
export function resolveDisplayName(code: string): string {
  return getLocaleDefinition(code)?.nativeName ?? code;
}
