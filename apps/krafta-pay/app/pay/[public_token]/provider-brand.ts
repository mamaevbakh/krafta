/**
 * Per-provider identity for the checkout picker.
 *
 * Provider-aware, never provider-hardcoded. The earlier version of this screen
 * had Uzum's binding-flow copy written directly into the page, which then read
 * as nonsense once Atmos shipped an inline card form — the customer was told
 * their card would be attached on "Uzum's secure page" while typing it into
 * ours. Anything provider-specific belongs in this table, and anything not in
 * this table has to degrade to something honest rather than to Uzum's branding.
 *
 * ON THE GRADIENT
 * ---------------
 * DESIGN.md forbids gradients. This is the one ratified exception (its
 * Decisions Log, 2026-08-04), scoped to acquirer identity on this picker only,
 * because on the single screen where a stranger decides whether to type a card
 * number, recognising their own bank is a trust function rather than
 * decoration.
 *
 * The brand is anchored at the mark and dissolves before the midpoint, over the
 * card surface rather than replacing it. A full-width wash was built, compared
 * side by side, and rejected: two saturated rows competed with each other, and
 * four would have read as a colour swatch once Payme and Click ship.
 *
 * Every colour comes in a light and a dark value, emitted as CSS custom
 * properties and selected by the `dark:` variant rather than written as inline
 * styles — an inline style cannot respond to `.dark`, and the first build did
 * exactly that and produced bright panels glaring off a near-black page.
 */

export type ProviderPalette = {
  /**
   * Always a gradient (even a transparent one) so `bg-[image:…]` always
   * applies. Ends fully transparent: past the fade the row IS the card.
   */
  background: string;
  border: string;
  /** Fill for the mark tile when there is no logo file. */
  markBackground: string;
  markForeground: string;
};

export type ProviderBrand = {
  /** Shown next to the mark. The provider's own name for itself, not ours. */
  displayName: string;
  /** Path under /public, or null when we have no mark and render initials. */
  logo: string | null;
  light: ProviderPalette;
  dark: ProviderPalette;
};

const BRANDS: Record<string, ProviderBrand> = {
  uzum: {
    displayName: "Uzum Bank",
    // Uzum's identity is purple with a green counter-shape; colours below are
    // sampled from the supplied mark rather than guessed.
    logo: "/uzum.webp",
    light: {
      background:
        "linear-gradient(90deg, #E4D2FF 0%, rgba(228,210,255,0.45) 34%, rgba(228,210,255,0) 62%)",
      border: "#CDAEF7",
      markBackground: "#6D28D9",
      markForeground: "#FFFFFF",
    },
    dark: {
      // Lifted rather than recoloured, so the tint sits inside a near-black
      // page instead of glowing on top of it.
      background:
        "linear-gradient(90deg, #3A2470 0%, rgba(58,36,112,0.5) 34%, rgba(58,36,112,0) 62%)",
      border: "#6D4FB8",
      markBackground: "#A78BFA",
      markForeground: "#1B1033",
    },
  },
  atmos: {
    displayName: "Atmos",
    // Deliberately no logo here. The supplied asset is an opaque dark-navy
    // tile, which fights a tinted row; it is used on the merchant's Providers
    // page, where the surrounding list is neutral. Founder's call, 2026-08-04.
    logo: null,
    light: {
      background:
        "linear-gradient(90deg, #CFE1FF 0%, rgba(207,225,255,0.45) 34%, rgba(207,225,255,0) 62%)",
      border: "#AFC9F5",
      markBackground: "#1D4ED8",
      markForeground: "#FFFFFF",
    },
    dark: {
      background:
        "linear-gradient(90deg, #1E3462 0%, rgba(30,52,98,0.5) 34%, rgba(30,52,98,0) 62%)",
      border: "#3F5F9E",
      markBackground: "#93B4FC",
      markForeground: "#0B1730",
    },
  },
};

/** A provider we have no entry for renders on the app's own tokens. */
const NEUTRAL: ProviderPalette = {
  background: "linear-gradient(0deg, transparent, transparent)",
  border: "var(--border)",
  markBackground: "var(--muted)",
  markForeground: "var(--muted-foreground)",
};

/**
 * Falls back to the provider's own name from the API and a neutral surface.
 * A provider we have no mark for still has to render as itself — showing
 * another bank's colours on a page where someone is about to type a card
 * number is worse than showing no colour at all.
 */
export function getProviderBrand(
  providerId: string,
  fallbackName: string,
): ProviderBrand {
  return (
    BRANDS[providerId] ?? {
      displayName: fallbackName,
      logo: null,
      light: NEUTRAL,
      dark: NEUTRAL,
    }
  );
}

/**
 * Mark text for providers with no logo asset.
 *
 * Two letters where the name has two words, otherwise the first two letters of
 * the single word — "Atmos" becomes `AT`, not `A`. A lone letter in a tile
 * reads as a broken image; two letters read as a monogram someone chose.
 */
export function getProviderInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
