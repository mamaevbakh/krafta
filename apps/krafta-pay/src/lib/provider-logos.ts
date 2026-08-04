/**
 * Provider logo assets, in one place.
 *
 * Two surfaces render a provider's mark — the merchant's Providers page and the
 * hosted checkout picker — and they render it differently. Keeping the file
 * paths here means adding a provider's logo is one edit rather than two that
 * can silently fall out of step.
 *
 * `null` means we have no asset and the surface falls back to a monogram tile.
 * Never substitute another provider's artwork: on a screen where someone is
 * choosing who to hand a card number to, showing the wrong bank's mark is worse
 * than showing no mark at all.
 */
export const PROVIDER_LOGOS: Record<string, string | null> = {
  atmos: "/atmos.jpeg",
  uzum: "/uzum.webp",
  payme: null,
  click: null,
};

export function getProviderLogo(providerId: string): string | null {
  return PROVIDER_LOGOS[providerId] ?? null;
}
