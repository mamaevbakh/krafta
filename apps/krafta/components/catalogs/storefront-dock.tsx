"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import type { PublicCategoryWithItems } from "@/lib/catalogs/types";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { cn } from "@/lib/utils";

import { CartTrigger } from "./cart/cart-trigger";
import { CatalogSearchLazy } from "./search/catalog-search-lazy";

type StorefrontDockProps = {
  catalogId: string;
  orgId?: string | null;
  categoriesWithItems: PublicCategoryWithItems[];
  currencySettings?: CurrencySettings;
};

/**
 * Bottom-center floating dock that hosts the customer storefront's two
 * (eventually three) primary controls:
 *
 *     [ 🔍 Search the menu        ] [ 🛒² ]
 *
 *   • Search "input" (left, flex-1) — a read-only button styled as a
 *     search field. Tap opens the existing CatalogSearch dialog (the
 *     real <input> lives inside the dialog so the keyboard pops with
 *     proper focus management instead of a focus-then-modal sequence).
 *   • Cart icon (right, fixed width) — slot-mounted CartTrigger. The
 *     trigger hides itself when the cart is empty (hideWhenEmpty
 *     default), so the dock collapses to just the search field for
 *     calm empty-state chrome. Re-appears with a fade as soon as the
 *     first item lands in cart.
 *   • Future User icon slot (left) — for the v2 account work. Append
 *     it as another ButtonGroup before the search input; widths
 *     accommodate (44 + 44 + ~220 + 44 ≈ 352 on a 390px viewport).
 *
 * Above the dock sits a ProgressiveBlur band that fades scrolled menu
 * content as it approaches the dock — iOS / Apple Music chrome rhythm.
 * Content underneath stays scrollable; the band is pointer-events:none.
 *
 * Replaces the two prior bottom-right floating buttons (search + cart)
 * with one cohesive composition. Both old triggers had to compete for
 * the same corner, looked like two competing "primary" affordances,
 * and the search icon required the customer to learn that "magnifying
 * glass" meant search. Input placeholder text tells them directly.
 */
export function StorefrontDock({
  catalogId,
  orgId,
  categoriesWithItems,
  currencySettings,
}: StorefrontDockProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (key: Parameters<typeof getStorefrontMessage>[0]) =>
    getStorefrontMessage(key, { activeLocale, defaultLocale });

  return (
    <>
      {/* Progressive backdrop blur — iOS-style fade. Content scrolled
          underneath blurs gradually as it approaches the dock band,
          drawing the eye to the chrome. Pointer-events:none so it
          doesn't intercept scroll/touch on the items behind. */}
      <ProgressiveBlur
        position="bottom"
        height="80px"
        blurAmount="1px"
        className="z-30"
        backgroundColor="bg-primary/85"
      />

      {/* Dock shell — fixed bottom-center, safe-area aware, theme-blurred.
          The search slot + cart slot are direct flex siblings inside the
          dock pill (no nested ButtonGroup / InputGroup). That keeps the
          composition reading as one cohesive surface rather than
          "pill-within-pill + sticker." Children share the dock's
          background and only differ by shape (rounded-full vs square
          icon button) — the visual language stays unified. */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 px-4",
          "pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2",
        )}
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-center">
          <div
            className={cn(
              // Outer dock pill: rounded-full, subtle border + shadow,
              // frosted-glass background. Padding p-1 gives breathing
              // room around the inner h-10 children.
              "flex items-center gap-1 rounded-full border border-border bg-background/85 p-1 shadow-lg backdrop-blur-xl",
              "w-full",
            )}
          >
            {/* Search slot — plain flex row styled as a search field.
                Tap → opens the CatalogSearch dialog (the real <input>
                lives in the dialog so the mobile keyboard pops with
                proper focus handling). Bg-transparent + a subtle
                hover state lets the slot read as part of the dock,
                not a nested pill. */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSearchOpen(true);
                }
              }}
              aria-label={t("search.open_aria")}
              className={cn(
                // Search slot reads as its own interactive surface
                // inside the dock — visual sibling to the cart icon
                // (which has bg-muted), not blended-into-dock chrome.
                // The chat-composer reference had both elements as
                // visually distinct affordances; we match by giving
                // the search slot its own bg-muted surface too.
                "flex h-10 flex-1 cursor-pointer items-center gap-2 rounded-full bg-muted px-4",
                "text-sm text-muted-foreground transition-colors",
                "hover:bg-muted/70",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
            >
              <Search className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {t("search.placeholder")}
              </span>
            </div>

            {/* Cart slot — refactored CartTrigger renders a secondary-
                tone icon button (h-10 w-10 rounded-full) so it matches
                the dock's tonality. Hides entirely when cart is empty
                so the dock collapses to a single-slot search-only pill. */}
            <CartTrigger />
          </div>
        </div>
      </div>

      {/* CatalogSearch dialog — controlled by the dock's open state.
          Its internal floating-button trigger is suppressed when
          `open` + `onOpenChange` are both provided (see
          catalog-search.tsx isControlled branch). The dialog itself
          owns the real search input + result list. */}
      <CatalogSearchLazy
        catalogId={catalogId}
        orgId={orgId}
        categoriesWithItems={categoriesWithItems}
        currencySettings={currencySettings}
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />
    </>
  );
}
