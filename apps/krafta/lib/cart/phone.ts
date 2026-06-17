// Uzbek phone number normalization + validation.
//
// v1 market is Uzbekistan, so we accept exactly the +998-XX-XXX-XX-XX
// shape. Two convenience acceptances:
//
//   - Just the local 9-digit part (e.g. "901234567") — the storefront
//     UI pins "+998" as a prefix addon, so the customer only types 9
//     digits.
//   - The full international form, with or without the leading "+":
//     "+998901234567" / "998901234567".
//
// Spaces / dashes / parentheses are stripped before checking. Anything
// outside those shapes returns null and the server throws
// "phone_invalid" (mapped to errors.phone_invalid client-side).
//
// Output is always E.164: "+998901234567" — single representation in
// the DB and on receipts, easy to call/SMS from the merchant dashboard
// later without re-parsing.
export function normalizeUzPhone(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  return null;
}

/**
 * True iff the given input normalizes to a valid +998 E.164 number.
 * Convenience for client-side disable-the-submit-button checks.
 */
export function isValidUzPhone(input: string): boolean {
  return normalizeUzPhone(input) !== null;
}

/**
 * Group up to 9 local digits as "90 123 45 67" for display in the
 * +998-prefixed phone field. Keeps digits only; caps at 9 so the field
 * can't overflow the national part.
 */
export function formatUzNational(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)]
    .filter(Boolean)
    .join(" ");
}
