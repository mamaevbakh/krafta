// Centralized, fail-safe redaction for payment data.
//
// PCI scope is about PERSISTENCE, not just logs: card numbers, OTP codes, and
// reusable card tokens must never land in `payments.logs`, in
// `payment_attempts.raw_init_response`, or in `subscription_events.payload`.
// Every provider adapter, the debug logger, and the activation path run untrusted
// provider request/response bodies through `redactSensitive` so a single missed
// call can never leak a PAN or OTP into a queryable table.
//
// Two independent mechanisms, applied together:
//   1. Key-based masking — any object key whose normalized name is sensitive
//      (card_number, pan, cvc, otp, card_token, *_secret, authorization, ...)
//      has its value replaced with "[redacted]".
//   2. Value scrubbing — any string containing a 14–19 digit run (a PAN, in any
//      field, even one we didn't anticipate) is masked to its last 4 digits.
//      The 14-digit floor deliberately skips 13-digit millisecond timestamps.

const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  // card data
  "cardnumber",
  "pan",
  "expiry",
  "expirydate",
  "expmonth",
  "expyear",
  "expirymonth",
  "expiryyear",
  "cvc",
  "cvv",
  "cvc2",
  "cvv2",
  "cardholder",
  // one-time codes
  "otp",
  // reusable tokens / bindings
  "cardtoken",
  "token",
  "bindingid",
  "accesstoken",
  "refreshtoken",
  // credentials / secrets
  "authorization",
  "apikey",
  "consumerkey",
  "consumersecret",
  "clientsecret",
  "webhooksecret",
  "secret",
  "password",
]);

const REDACTED = "[redacted]";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, "");
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

// Mask any 14–19 digit run (a PAN) to its last 4 digits, regardless of the key
// it sits under. 14-digit floor avoids masking 13-digit ms timestamps.
function maskDigitRuns(input: string): string {
  return input.replace(/\d{14,19}/g, (run) => `${"*".repeat(run.length - 4)}${run.slice(-4)}`);
}

/**
 * Returns a deep copy of `value` with sensitive keys masked and PAN-shaped digit
 * runs scrubbed. Never mutates the input. `null`/`undefined` under a sensitive
 * key are preserved (so masked DB columns that are genuinely null stay null).
 */
export function redactSensitive<T>(value: T): T {
  if (typeof value === "string") {
    return maskDigitRuns(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        out[key] = raw == null ? raw : REDACTED;
      } else {
        out[key] = redactSensitive(raw);
      }
    }
    return out as unknown as T;
  }
  return value;
}
