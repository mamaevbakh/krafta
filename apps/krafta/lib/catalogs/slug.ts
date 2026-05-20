/**
 * slugify — canonical slug normalization shared by item / category / etc.
 *
 * Rules:
 *   - lowercase
 *   - strip stray quotes (single + double)
 *   - replace runs of non-alphanumerics with a single dash
 *   - trim leading + trailing dashes
 *
 * Note: this is intentionally minimal (no Unicode transliteration). For
 * Krafta's Cyrillic content the server-side rule is to seed the slug
 * from the default-locale name; merchants can override with their own
 * latin-only slug. A heavier transliteration pass can ship later if it
 * shows up in feedback.
 *
 * Pure function with no DOM / server dependencies — safe to import
 * from RSC, client components, and server actions alike. Replaces the
 * 4 copies that lived inline in dashboard action / dialog files.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
