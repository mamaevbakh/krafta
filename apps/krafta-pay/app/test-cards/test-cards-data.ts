/**
 * Test cards for the sandbox checkout.
 *
 * ── HOW TO FILL THIS IN ────────────────────────────────────────────────────
 * Add entries to `TEST_CARDS` below and the page renders them. Nothing else
 * needs to change.
 *
 * ── WHY IT IS EMPTY ────────────────────────────────────────────────────────
 * Uzbek acquirers issue test cards per-merchant, alongside your test
 * credentials, rather than publishing a universal set the way Stripe does.
 * There is no verified list in this repo, and inventing plausible-looking
 * 8600/9860 numbers would be worse than shipping nothing: a merchant would
 * spend an afternoon on cards that decline and conclude our integration is
 * broken.
 *
 * So the page ships honest — it explains where the cards come from and links
 * straight to the cabinet that issues them. Paste your real ones here and they
 * appear immediately.
 *
 * Do NOT put a real customer's card here. These are sandbox PANs that move no
 * money; anything else belongs nowhere in source control.
 */

export type TestCard = {
  /** Group under this provider. */
  provider: "atmos" | "uzum";
  /** PAN, digits only — the page formats it. */
  pan: string;
  expiry: string;
  /** SMS code the sandbox accepts, when it is fixed. */
  otp?: string;
  /** What this card is for: "succeeds", "insufficient funds", "expired"… */
  outcomeKey: "success" | "insufficientFunds" | "declined" | "expired";
  note?: string;
};

/**
 * Empty on purpose — see the header. One entry per behaviour you want to be
 * able to reproduce; the failure cards matter more than the happy path, since
 * dunning and recovery are the parts worth testing.
 */
export const TEST_CARDS: TestCard[] = [];

/** Where a merchant actually gets these, per provider. */
export const PROVIDER_SOURCES = [
  {
    provider: "atmos" as const,
    name: "Atmos",
    url: "https://atmos.uz",
    /** Message key describing where to look. */
    hintKey: "testCards.atmos.hint",
  },
  {
    provider: "uzum" as const,
    name: "Uzum",
    url: "https://uzumbank.uz",
    hintKey: "testCards.uzum.hint",
  },
];

/** 8600 1234 5678 9012 — how a PAN is written on the card itself. */
export function formatPan(pan: string): string {
  return pan.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
}
