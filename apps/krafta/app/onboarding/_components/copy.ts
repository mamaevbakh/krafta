// Onboarding wizard copy — every merchant-facing string in one place.
//
// DESIGN.md (Internationalization): UI strings route through app-level locale
// modules, never hardcoded in components. The wizard ships English-first
// today; when the merchant-side RU/UZ pass lands (deferred, see KRA-42
// follow-ups), this flat map becomes per-locale tables behind the same keys —
// the components don't change.
//
// Interpolation: tokens are `{name}`-style, resolved by fmt(). Keep values
// plain strings (no JSX, no functions) so the future locale tables stay
// data-only.

export function fmt(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

export const wizardCopy = {
  common: {
    back: "Back",
    continue: "Continue",
    progressLabel: "Setup progress",
    add: "Add",
    cancelAdd: "Cancel adding",
  },
  type: {
    title: "What are you opening?",
    subtitle: "We'll suggest a starter menu you can shape in the next steps.",
  },
  name: {
    title: "Name your shop",
    subtitle: "Customers see this name. You can change it anytime.",
    label: "Shop name",
    placeholder: "Чойхона №1",
  },
  sections: {
    title: "Your menu sections",
    subtitleVertical: "What we'd suggest for a {vertical} — drop or add your own.",
    subtitleBare: "Drop or add your own.",
    suggestedCount: "{n} suggested",
    addPlaceholder: "Add a section (e.g. Десерты)",
  },
  items: {
    title: "Your first items",
    subtitle: "Keep our prices or set yours — everything stays editable in your dashboard.",
    addPlaceholder: "Add an item",
    includeAria: "Include {name}",
    nameAria: "Item name",
    priceAria: "Price in sums",
    currencySuffix: "сум",
  },
  modes: {
    title: "How do customers order?",
    subtitle: "Pick what you serve today — you can change this later.",
    atLeastOne: "Pick at least one way to order.",
    labels: {
      dine_in: { label: "Dine-in", hint: "QR on the table, orders to the kitchen" },
      pickup: { label: "Pickup", hint: "Customers order ahead and collect" },
      delivery: { label: "Delivery", hint: "You bring it to them" },
    },
  },
  tables: {
    title: "How many tables?",
    subtitle: "We'll prepare a printable QR code for each table.",
    cardTitle: "Tables at your venue",
    cardHint: "You can add, rename or remove tables later.",
    fewerAria: "Fewer tables",
    moreAria: "More tables",
  },
  languages: {
    title: "Menu languages",
    subtitle:
      "Suggested items ship translated in Russian, Uzbek and English. Other languages can be translated later in your dashboard.",
    defaultBadge: "Default",
    makeDefault: "Make default",
    removeAria: "Remove {name}",
  },
  alerts: {
    title: "Where should new orders find you?",
    subtitle: "Pick how you'll hear about an order — you'll set it up in a moment.",
    options: {
      telegram: {
        label: "Telegram",
        hint: "A ping on your phone the second an order lands",
      },
      dashboard: {
        label: "I'll check the dashboard",
        hint: "See new orders when you open Krafta",
      },
    },
  },
  phone: {
    title: "How can customers reach you?",
    subtitle: "Optional — a phone number makes the shop feel open for business.",
    label: "Phone",
    placeholder: "+998 90 123 45 67",
    skip: "Skip for now",
  },
  city: {
    title: "Where is your shop?",
    subtitle: "Optional — so nearby customers can find you.",
    otherChip: "Другой город",
    customLabel: "City",
    customPlaceholder: "Хива",
    create: "Create my shop",
    creating: "Setting up your shop…",
    skip: "Skip for now",
  },
  building: {
    title: "Setting up your shop",
    subtitle: "A few seconds — don't close this tab.",
    stages: [
      "Creating your shop…",
      "Building your menu…",
      "Translating your items…",
      "Preparing table QR codes…",
      "Almost there…",
    ],
    /** Stage index to skip when the shop has no dine-in tables. */
    tablesStageIndex: 3,
  },
  reveal: {
    title: "{name} is ready",
    subtitle: "This is what your customers will see. Everything stays editable.",
    cta: "Open my dashboard",
    /** Secondary CTA shown only when the merchant asked for Telegram alerts. */
    alertsCta: "Set up order alerts in Telegram",
  },
} as const;

/** Major-city chips for the city screen — taps instead of typing. */
export const CITY_CHIPS = [
  "Ташкент",
  "Самарканд",
  "Бухара",
  "Наманган",
  "Андижон",
  "Фергана",
] as const;
