"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  InputGroup,
  InputGroupAddon,
} from "@/components/ui/input-group";
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
        height="180px"
        blurAmount="6px"
        className="z-30"
      />

      {/* Dock shell — fixed bottom-center, safe-area aware, theme-blurred.
          The ButtonGroup composition (search input + cart icon) sits
          inside a rounded background pill so the two children read as
          one cohesive element. */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 px-4",
          "pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2",
        )}
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-center">
          <ButtonGroup
            className={cn(
              // Pill aesthetic: rounded-full, subtle border + shadow.
              // backdrop-blur-xl + bg-background/85 gives the dock its
              // own frosted-glass surface on top of the progressive
              // blur band above — together they read as a polished
              // floating element, not a flat overlay.
              "rounded-full border border-border bg-background/85 p-1 shadow-lg backdrop-blur-xl",
              // Ensure children sit tight; ButtonGroup defaults stack
              // them as a row already.
              "items-center gap-1",
            )}
          >
            {/* Search "input" — actually a styled button. Tap → open
                the CatalogSearch dialog (real input lives there). This
                avoids the focus-then-modal sequence that mobile
                keyboards handle awkwardly. */}
            <ButtonGroup className="flex-1">
              <InputGroup
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
                  "h-11 cursor-pointer rounded-full border-0 bg-transparent shadow-none transition-colors",
                  "hover:bg-muted/40",
                  // Match focus ring style of the cart icon button.
                  "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                )}
              >
                <InputGroupAddon align="inline-start">
                  <Search className="size-4" />
                </InputGroupAddon>
                {/* Read-only text node that mimics an input placeholder.
                    Real <input> would steal keyboard focus on tap —
                    we want a deliberate tap → modal flow instead. */}
                <span
                  className="flex-1 truncate pl-1 text-sm text-muted-foreground"
                  data-slot="input-group-control"
                >
                  {t("search.placeholder")}
                </span>
              </InputGroup>
            </ButtonGroup>

            {/* Cart icon — slot-mounted via the refactored CartTrigger.
                hideWhenEmpty (default) keeps the dock minimal when the
                cart has nothing. Customer adds first item → trigger
                appears, dock visually extends. */}
            <ButtonGroup>
              <CartTrigger />
            </ButtonGroup>
          </ButtonGroup>
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
