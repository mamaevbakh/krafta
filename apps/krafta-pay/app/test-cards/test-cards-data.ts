/**
 * Test cards for the sandbox checkout.
 *
 * These are the providers' own published sandbox cards — the same set for every
 * merchant, not per-account credentials. They move no real money.
 *
 * Never add a real customer's card here. Anything that can actually be charged
 * belongs nowhere in source control.
 */

export type TestCard = {
  provider: "atmos" | "uzum";
  /** PAN, digits only — the page formats it. */
  pan: string;
  expiry: string;
  /** SMS / 3-D Secure code the sandbox accepts. */
  otp: string;
  outcomeKey: "success" | "insufficientFunds" | "declined" | "expired";
  /** Card scheme, where the provider states it. */
  scheme?: "HUMO" | "UzCard";
};

/**
 * Atmos publishes several interchangeable success cards plus one that fails.
 *
 * The failing card is the valuable one and it is listed last so it reads as the
 * deliberate case rather than a mistake: dunning, retry scheduling and the
 * recovery link are the parts of this product worth exercising, and none of
 * them can be tested with a card that always succeeds.
 *
 * Its expiry really is in the past (03/20). That is the point — it is how the
 * sandbox reproduces an expired-card decline, which is the failure automatic
 * retries can never recover and the reason the recovery link exists at all.
 */
export const TEST_CARDS: TestCard[] = [
  // ── Atmos ────────────────────────────────────────────────────────────────
  { provider: "atmos", pan: "9860090101014364", expiry: "02/28", otp: "111111", outcomeKey: "success", scheme: "HUMO" },
  { provider: "atmos", pan: "9860090101893213", expiry: "02/28", otp: "111111", outcomeKey: "success", scheme: "HUMO" },
  { provider: "atmos", pan: "9860090101842392", expiry: "02/28", otp: "111111", outcomeKey: "success", scheme: "HUMO" },
  { provider: "atmos", pan: "9860090101469915", expiry: "02/28", otp: "111111", outcomeKey: "success", scheme: "HUMO" },
  { provider: "atmos", pan: "5614688715378807", expiry: "03/29", otp: "111111", outcomeKey: "success" },
  { provider: "atmos", pan: "8600492986215602", expiry: "03/20", otp: "111111", outcomeKey: "expired", scheme: "UzCard" },

  // ── Uzum ─────────────────────────────────────────────────────────────────
  { provider: "uzum", pan: "9860090101219724", expiry: "10/26", otp: "777777", outcomeKey: "success", scheme: "HUMO" },
  { provider: "uzum", pan: "8600312929577175", expiry: "09/26", otp: "777777", outcomeKey: "success", scheme: "UzCard" },
];

/** Where a merchant gets their own sandbox credentials, per provider. */
export const PROVIDER_SOURCES = [
  {
    provider: "atmos" as const,
    name: "Atmos",
    url: "https://atmos.uz",
    hintKey: "testCards.atmos.hint",
  },
  {
    provider: "uzum" as const,
    name: "Uzum",
    url: "https://uzumbank.uz",
    hintKey: "testCards.uzum.hint",
  },
];

/** Cards grouped for display, in the order providers appear above. */
export function cardsByProvider() {
  return PROVIDER_SOURCES.map((source) => ({
    source,
    cards: TEST_CARDS.filter((card) => card.provider === source.provider),
  })).filter((group) => group.cards.length > 0);
}

/** 8600 1234 5678 9012 — how a PAN is written on the card itself. */
export function formatPan(pan: string): string {
  return pan.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
}
