// Country → sensible default currency, plus the recommended-country shortlist
// surfaced at the top of the onboarding country picker.
//
// Onboarding asks for the merchant's country first, then derives the currency
// default from it (getCurrencyForCountry) — so the merchant rarely has to touch
// the currency step. The map is curated for the markets Krafta realistically
// serves (Central Asia + CIS first, then the eurozone and major economies);
// anything unlisted falls back to USD, which is overridable on the currency step.
//
// Every value is a code present in CURRENCY_CODES (lib/locale/currencies.ts).

// Surfaced at the top of the onboarding country picker — Krafta's home market
// (UZ) first, then the regional CIS neighbours and the most common global
// markets. Mirrors RECOMMENDED_CURRENCY_CODES one-for-one.
export const RECOMMENDED_COUNTRY_CODES = [
  "UZ", // UZS
  "RU", // RUB
  "KZ", // KZT
  "KG", // KGS
  "TJ", // TJS
  "US", // USD
  "DE", // EUR
  "TR", // TRY
  "AE", // AED
  "CN", // CNY
] as const;

// ISO 3166-1 alpha-2 → ISO 4217.
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // Central Asia + CIS
  UZ: "UZS", KZ: "KZT", KG: "KGS", TJ: "TJS", TM: "TMT",
  RU: "RUB", BY: "BYN", UA: "UAH", AM: "AMD", AZ: "AZN", GE: "GEL", MD: "MDL",
  // Eurozone
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR",
  PT: "EUR", IE: "EUR", FI: "EUR", GR: "EUR", SK: "EUR", SI: "EUR", LT: "EUR",
  LV: "EUR", EE: "EUR", LU: "EUR", MT: "EUR", CY: "EUR", HR: "EUR",
  // Rest of Europe
  GB: "GBP", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK",
  HU: "HUF", RO: "RON", BG: "BGN", RS: "RSD", IS: "ISK", TR: "TRY",
  // Middle East + North Africa
  AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD",
  IL: "ILS", EG: "EGP", IR: "IRR", IQ: "IQD", LB: "LBP", MA: "MAD", DZ: "DZD",
  TN: "TND",
  // Americas
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP",
  PE: "PEN",
  // Asia-Pacific
  CN: "CNY", JP: "JPY", KR: "KRW", IN: "INR", ID: "IDR", MY: "MYR", SG: "SGD",
  TH: "THB", VN: "VND", PH: "PHP", PK: "PKR", BD: "BDT", LK: "LKR", HK: "HKD",
  TW: "TWD", AU: "AUD", NZ: "NZD",
  // Sub-Saharan Africa
  ZA: "ZAR", NG: "NGN", KE: "KES", GH: "GHS", TZ: "TZS", UG: "UGX",
};

/**
 * Best-effort default currency (ISO 4217) for a country (ISO 3166-1 alpha-2).
 * Curated map for the markets we serve; USD fallback for anything unlisted. The
 * merchant can always override on the currency step.
 */
export function getCurrencyForCountry(code: string): string {
  return COUNTRY_TO_CURRENCY[code.toUpperCase()] ?? "USD";
}
