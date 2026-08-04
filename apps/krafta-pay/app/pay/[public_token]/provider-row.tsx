import Image from "next/image";
import type { CSSProperties } from "react";

import { getProviderBrand, getProviderInitials } from "./provider-brand";

/**
 * One selectable payment provider on the hosted checkout.
 *
 * Layout is mark-first: logo, 8px, then the provider's name over a one-line
 * description of what tapping it does. Everything is left-aligned on one axis
 * so the eye lands on the mark and reads right — on a page where someone is
 * deciding whether to trust us with a card, recognising the bank is the first
 * job the row has to do.
 *
 * The `brand` variant paints a brand tint that dies before the midpoint over
 * the card surface; it is a ratified, narrow exception to DESIGN.md's
 * no-gradients rule (its Decisions Log, 2026-08-04). Text stays on the app's
 * own foreground, because past the fade the row IS the card and brand-coloured
 * text on a neutral surface is the one thing left looking painted on.
 */
export function ProviderRow({
  providerId,
  name,
  description,
  hint,
  variant = "neutral",
  disabled = false,
  onSelect,
}: {
  providerId: string;
  name: string;
  description: string;
  hint: string;
  variant?: "brand" | "neutral";
  disabled?: boolean;
  onSelect?: () => void;
}) {
  const brand = getProviderBrand(providerId, name);
  const branded = variant === "brand";

  const paletteVars = {
    "--provider-bg": brand.light.background,
    "--provider-bd": brand.light.border,
    "--provider-mark-bg": brand.light.markBackground,
    "--provider-mark-fg": brand.light.markForeground,
    "--provider-bg-dark": brand.dark.background,
    "--provider-bd-dark": brand.dark.border,
    "--provider-mark-bg-dark": brand.dark.markBackground,
    "--provider-mark-fg-dark": brand.dark.markForeground,
  } as CSSProperties;

  // `bg-[image:…]` rather than `bg-[…]`: the value is a gradient, and Tailwind
  // cannot tell a gradient from a colour once it is behind a var, so it would
  // emit `background-color` and silently drop the whole declaration.
  const brandedSurface =
    "bg-card bg-[image:var(--provider-bg)] dark:bg-[image:var(--provider-bg-dark)] " +
    "border-[var(--provider-bd)] dark:border-[var(--provider-bd-dark)]";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      style={branded ? paletteVars : undefined}
      className={`group w-full rounded-xl border px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        branded ? brandedSurface : "hover:bg-muted"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* gap-2 is the 8px between mark and name; the row uses gap-3 so the
            trailing hint never crowds them. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {brand.logo ? (
            <Image
              src={brand.logo}
              alt=""
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-[10px]"
            />
          ) : (
            <span
              aria-hidden
              className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] font-mono text-sm font-medium ${
                branded
                  ? "bg-[var(--provider-mark-bg)] text-[var(--provider-mark-fg)] dark:bg-[var(--provider-mark-bg-dark)] dark:text-[var(--provider-mark-fg-dark)]"
                  : "border bg-muted text-muted-foreground"
              }`}
            >
              {getProviderInitials(brand.displayName)}
            </span>
          )}

          <span className="min-w-0">
            <span className="block truncate font-medium leading-tight">
              {brand.displayName}
            </span>
            <span className="block truncate text-xs leading-tight text-muted-foreground">
              {description}
            </span>
          </span>
        </div>

        <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>
      </div>
    </button>
  );
}
