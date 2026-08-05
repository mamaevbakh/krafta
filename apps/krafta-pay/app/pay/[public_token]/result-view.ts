// What the result page shows, as a pure rule.
//
// Split out of the client component for the same reason as
// atmos-apply-outcome.ts: the decision is about money the customer has already
// handed over, and it needs to be testable without a DOM. Getting it wrong in
// one direction shows a receipt that is snatched away mid-read; in the other it
// leaves a paying customer staring at a bare spinner with no record of what
// they bought.

export type ResultView = "loader_only" | "full";

/**
 * Show a spinner and nothing else once the payment has landed AND we are about
 * to send the customer back to the merchant.
 *
 * Building a full confirmation — heading, receipt, amount, countdown, Continue
 * button — and then navigating away a few seconds later gives them something
 * they cannot finish reading, and a button that only does what was already
 * going to happen.
 *
 * The exception is the whole reason this is a function and not an `&&`: with no
 * return URL, this page IS the end of the flow and the only receipt that will
 * ever exist. There is no merchant page behind it to answer "what did I just
 * pay for?", so it keeps the full detail.
 */
export function resolveResultView(input: {
  mode: "success" | "failure";
  intentStatus: string | null | undefined;
  hasReturnTarget: boolean;
}): ResultView {
  const succeeded = String(input.intentStatus ?? "").toLowerCase() === "succeeded";
  if (!succeeded) return "full";
  if (!input.hasReturnTarget) return "full";
  return "loader_only";
}
