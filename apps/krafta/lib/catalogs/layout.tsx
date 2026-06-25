// lib/catalogs/layout.tsx

import type {
  PublicCatalog,
  PublicCategoryWithItems,
  PublicTax,
} from "@/lib/catalogs/types";
import type {
  PublicCatalogLocaleOption,
  PublicVenue,
} from "@/lib/catalogs/data";
import { normalizeCatalogSettings } from "@/lib/catalogs/settings";
import {
  normalizeLayoutSettings,
  type CatalogLayoutOverride,
} from "@/lib/catalogs/settings/layout";
import {
  normalizeCurrencySettings,
  type CurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { resolveCatalogLayout } from "@/lib/catalogs/layout-registry";
import { getCatalogLogoUrl, getItemImageUrl } from "@/lib/catalogs/media";
import {
  ItemSheetProvider,
  ItemSheetTrigger,
} from "@/components/catalogs/items/item-detail-controller";
import {
  CartDrawer,
  CartProvider,
} from "@/components/catalogs/cart";
import { TableCheck } from "@/components/catalogs/cart/table-check";
import { CartActions } from "@/components/catalogs/cart/cart-actions";
import { StorefrontDock } from "@/components/catalogs/storefront-dock";
import { TelegramFrame } from "@/components/telegram/telegram-frame";
import { TelegramThemeSync } from "@/components/telegram/telegram-theme-sync";
import { TelegramSafeAreaBlur } from "@/components/telegram/telegram-safe-area-blur";
import { TelegramNavTitle } from "@/components/telegram/telegram-nav-title";
import { TelegramCartButton } from "@/components/telegram/telegram-cart-button";
import { StorefrontLocaleProvider } from "@/lib/catalogs/storefront-locale-context";
import { TmaShareProvider } from "@/lib/telegram/tma-share-context";
import { getCartSummary, type CartSummary } from "@/lib/cart/orders";

type Props = {
  catalog: PublicCatalog;
  categoriesWithItems: PublicCategoryWithItems[];
  venue?: PublicVenue | null;
  taxes?: PublicTax[];
  activeCategorySlug?: string | null;
  activeItemSlug?: string | null;
  baseHref?: string;
  layoutOverride?: CatalogLayoutOverride;
  currencyOverride?: CurrencySettings;
  /** Effective active locale resolved at the page root from ?lang= +
   *  catalog locales. Empty string when the catalog has no enabled
   *  locales (no translation can happen — every field renders canonical). */
  activeLocale?: string;
  /** The catalog's default locale (canonical column source). Same
   *  source as activeLocale's fallback. */
  defaultLocale?: string;
  /** Enabled locale rows (with display_name + text_direction). Threaded
   *  through to the header so the language switcher knows which options
   *  to render. Empty/single-element → switcher hides. */
  locales?: PublicCatalogLocaleOption[];
};

// map “columns” → Tailwind grid classes (md+)
function getItemGridColsClass(columns: number): string {
  switch (columns) {
    case 1:
      return "grid-cols-1";
    case 3:
      return "grid-cols-3";
    case 4:
      return "grid-cols-4";
    case 2:
    default:
      return "grid-cols-2";
  }
}

export async function CatalogLayout({
  catalog,
  categoriesWithItems,
  venue = null,
  taxes = [],
  activeCategorySlug = null,
  activeItemSlug = null,
  baseHref,
  layoutOverride,
  currencyOverride,
  activeLocale = "",
  defaultLocale = "",
  locales = [],
}: Props) {
  const hrefBase = baseHref ?? `/${catalog.slug}`;

  const { layout, currency, behavior, delivery } =
    normalizeCatalogSettings(catalog);
  const resolvedLayout = layoutOverride
    ? normalizeLayoutSettings({
        ...layout,
        ...layoutOverride,
        itemCard: {
          ...layout.itemCard,
          ...(layoutOverride.itemCard ?? {}),
        },
        header: {
          ...layout.header,
          ...(layoutOverride.header ?? {}),
          basicFreeLogo: {
            ...layout.header.basicFreeLogo,
            ...(layoutOverride.header?.basicFreeLogo ?? {}),
          },
        },
      })
    : layout;
  const resolvedCurrency = currencyOverride
    ? normalizeCurrencySettings({
        ...currency,
        ...currencyOverride,
      })
    : currency;
  const { Header, Section, ItemCard, CategoryNav } =
    resolveCatalogLayout(resolvedLayout);

  const logoUrl = getCatalogLogoUrl(catalog);

  // Telegram share-to-chat (KRA-50): the shop's Mini App deep link, forwarded
  // by the header's TMA-only share button. null when no platform bot is set
  // (the button then never renders).
  const tgShareBot =
    process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || null;
  const tmaShareUrl = tgShareBot
    ? `https://t.me/${tgShareBot}?startapp=${catalog.slug}`
    : null;

  // ✅ from normalized layout.itemCard
  const itemCardColumns = resolvedLayout.itemCard.columns;
  const itemImageAspectRatio = resolvedLayout.itemCard.aspectRatio;
  const itemGridColsClass = getItemGridColsClass(itemCardColumns);

  const normalizedActiveSlug =
    activeCategorySlug && activeCategorySlug.length > 0
      ? activeCategorySlug
      : null;

  const activeCategory = normalizedActiveSlug
    ? categoriesWithItems.find((c) => c.slug === normalizedActiveSlug)
    : null;

  const activeCategoryId = activeCategory?.id ?? null;
  const activeCategorySlugResolved = activeCategory?.slug ?? null;

  const tree = (
    <StorefrontLocaleProvider
      activeLocale={activeLocale}
      defaultLocale={defaultLocale}
    >
      <TmaShareProvider
        value={
          tmaShareUrl
            ? { deepLink: tmaShareUrl, shopName: catalog.name }
            : null
        }
      >
      <ItemSheetProvider
        key={`${activeCategorySlugResolved ?? "none"}:${activeItemSlug ?? "none"}`}
        categoriesWithItems={categoriesWithItems}
        activeCategorySlug={activeCategorySlugResolved}
        activeItemSlug={activeItemSlug}
        baseHref={hrefBase}
        // 👇 this prop name is important
        itemAspectRatio={itemImageAspectRatio}
        itemDetailVariant={resolvedLayout.itemDetailVariant}
        currencySettings={resolvedCurrency}
      >
        {/* Telegram Mini App frame: fullscreen + safe-area vars + swipe
            guard. No-ops on the public web. */}
        <TelegramFrame />
        {/* Sync light/dark to the user's Telegram theme (mode only — keeps
            Krafta's zinc palette per DESIGN.md). No-op on web. */}
        <TelegramThemeSync />
        {/* Frosted strip over the Telegram safe-area so content scrolling
            behind the floating controls is blurred, not sharp. 0px on web. */}
        <TelegramSafeAreaBlur />
        {/* Shop name in Telegram's controls row, revealed once the hero header
            scrolls past (#tma-title-sentinel). No-op on web. */}
        <TelegramNavTitle name={catalog.name} logoUrl={logoUrl} />
        <main
          // pb clears the fixed bottom dock (search + cart) — otherwise the
          // last item's price hides behind it. Safe-area term keeps the gap on
          // notched phones where the dock sits higher.
          className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] text-foreground"
          // In Telegram fullscreen the content runs edge-to-edge, so clear
          // the status bar + floating controls. var resolves to 0 on the web.
          style={{ paddingTop: "calc(2rem + var(--tg-safe-top, 0px))" }}
        >
          <Header
            catalogName={catalog.name}
            catalog={catalog}
            headerSettings={resolvedLayout.header}
            logoUrl={logoUrl}
            description={catalog.description}
            tags={catalog.tags}
            locales={locales}
            activeLocale={activeLocale}
          />

          {/* Reveal trigger for the Telegram nav title: once this scrolls
              past the top, the shop name fades into the controls row. */}
          <div id="tma-title-sentinel" aria-hidden className="h-px" />

          {CategoryNav && (
            <CategoryNav
              categories={categoriesWithItems}
              activeCategoryId={activeCategoryId}
              activeCategorySlug={activeCategorySlugResolved}
              baseHref={hrefBase}
              activeLocale={activeLocale}
              defaultLocale={defaultLocale}
            />
          )}

          <section className="space-y-8">
            {categoriesWithItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No categories or items in this catalog yet.
              </p>
            )}

            {categoriesWithItems.map((category, categoryIndex) => {
              const categorySlug = category.slug ?? String(category.id);

              return (
                <Section
                  key={category.id}
                  category={category}
                  activeLocale={activeLocale}
                  defaultLocale={defaultLocale}
                >
                  {category.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No items in this category yet.
                    </p>
                  ) : (
                    <div className={`grid gap-2 ${itemGridColsClass}`}>
                      {category.items.map((item, itemIndex) => {
                        const itemSlug = item.slug ?? String(item.id);
                        // F-9 (storefront audit): the LCP candidate is one
                        // of the first images in the first category. Mark
                        // the first 4 items there as priority so next/image
                        // emits a preload tag and skips lazy-loading.
                        // Other items still lazy-load.
                        const isPriority =
                          categoryIndex === 0 && itemIndex < 4;

                        // CartActions goes INSIDE the card via the
                        // `actions` slot prop so each variant can place
                        // it where the design wants (BigPhotoCard floats
                        // it absolute over the photo bottom-right —
                        // Careem pattern). Null when cart is disabled
                        // (settings_behavior.enableCart=false), in which
                        // case the card renders zero cart UI.
                        //
                        // defaultVariationId (cart-v3 P3): every item has
                        // at least one variation; either one is flagged
                        // is_default=true or we fall back to the first
                        // one. Passing it here lets the provider compute
                        // a stable lineKey for the catalog-card Add path
                        // (no variation picker) so the client placeholder
                        // and server-materialized line share an identity
                        // from the moment the customer taps.
                        const defaultVariationId =
                          item.variations.find((v) => v.is_default)?.id ??
                          item.variations[0]?.id;
                        const actions = behavior.enableCart ? (
                          <CartActions
                            itemId={item.id}
                            itemSlug={itemSlug}
                            categorySlug={categorySlug}
                            itemName={item.name}
                            basePriceCents={item.price_cents}
                            hasModifiers={item.modifier_lists.length > 0}
                            defaultVariationId={defaultVariationId}
                            // Forwarded to the customisations drawer for
                            // per-config thumbnails + price formatting.
                            imageUrl={getItemImageUrl(item)}
                            currencySettings={resolvedCurrency}
                          />
                        ) : null;

                        return (
                          <ItemSheetTrigger
                            key={item.id}
                            itemSlug={itemSlug}
                            categorySlug={categorySlug}
                          >
                            <ItemCard
                              imageAspectRatio={itemImageAspectRatio}
                              item={item}
                              imageUrl={getItemImageUrl(item)}
                              currencySettings={resolvedCurrency}
                              activeLocale={activeLocale}
                              defaultLocale={defaultLocale}
                              priority={isPriority}
                              actions={actions}
                            />
                          </ItemSheetTrigger>
                        );
                      })}
                    </div>
                  )}
                </Section>
              );
            })}
          </section>
        </main>
        {/* Bottom-center floating dock — search input + cart icon. Lives
            INSIDE ItemSheetProvider so its CatalogSearch can call
            useItemSheet() to open items on result tap. The CartTrigger
            slot reads useOptionalCart() so it noops gracefully when
            this catalog has cart disabled (no CartProvider in scope). */}
        <StorefrontDock
          catalogId={catalog.id}
          orgId={catalog.org_id ?? null}
          categoriesWithItems={categoriesWithItems}
          currencySettings={resolvedCurrency}
          enableAssistant={behavior.enableAssistant}
        />
        {/* Arms Telegram's closing confirmation while the cart has items, so a
            swipe-down doesn't drop an order. No-ops on the web / cart-off. */}
        <TelegramCartButton />
      </ItemSheetProvider>
      </TmaShareProvider>
    </StorefrontLocaleProvider>
  );

  // Cart UI is opt-in per catalog via settings_behavior.enableCart, and only
  // renders when we have a venue (always true post-Migration 2, but the null
  // path guards against catalogs created outside the normal flow). The
  // dock itself is part of `tree` (so its CatalogSearch sees the
  // ItemSheetProvider); its CartTrigger child noops when no CartProvider
  // is in scope, so the dock collapses to a search-only pill here.
  if (!venue || !behavior.enableCart) return tree;

  // Paused / archived venues: customer can still browse the menu, but no
  // cart UI renders. Surface a banner so the missing Add-to-cart buttons
  // are not mysterious. Same dock semantics (search-only without
  // CartProvider).
  if (venue.status !== "active") {
    return (
      <>
        <NotAcceptingOrdersBanner />
        {tree}
      </>
    );
  }

  // Constrain to the modes our checkout flow understands, preserving the
  // venue's ordering. The DB CHECK constraint on venues already restricts
  // to this set; this filter is a defense-in-depth.
  const allowedModes = ["dine_in", "pickup", "delivery"] as const;
  const venueModes = venue.modes_enabled.filter(
    (mode): mode is (typeof allowedModes)[number] =>
      (allowedModes as readonly string[]).includes(mode),
  );

  // SSR cart preload (cart-v3 P1). Fetch the customer's current draft
  // cart server-side using the request's cookie-bound Supabase auth
  // session, then thread it to CartProvider so the first paint matches
  // the cart's real state instead of flashing "Add" pills for the
  // duration of the client-side bootstrap fetch.
  //
  // Failures are silent on purpose: a fresh visitor with no anon session
  // can't have a cart, and `getCartSummary` returns an empty summary in
  // that case. Any unexpected error (network blip, auth race) → render
  // with no initialSummary; the provider falls back to its mount-time
  // bootstrap effect, which is the cart-v2 behaviour we're carrying
  // forward as the worst-case path. Customer never sees an error here.
  //
  // The cookies() call inside the supabase client opts the route into
  // dynamic rendering (Next 16 semantics). Cart is per-user, never
  // cacheable — this is the correct trade-off.
  let initialSummary: CartSummary | undefined;
  try {
    initialSummary = await getCartSummary({
      orgId: venue.org_id,
      venueId: venue.id,
    });
  } catch {
    initialSummary = undefined;
  }

  return (
    <CartProvider
      orgId={venue.org_id}
      venueId={venue.id}
      catalogPath={hrefBase}
      modes={venueModes}
      taxes={taxes}
      initialSummary={initialSummary}
    >
      {tree}
      <CartDrawer
        currencySettings={resolvedCurrency}
        deliverySettings={delivery}
      />
      {/* Dine-in running check (ADR 0004 / KRA-116): persistent table-tab bar
          + Table Check sheet. No-ops outside an active dine-in session. */}
      <TableCheck
        orgId={venue.org_id}
        venueId={venue.id}
        currencySettings={resolvedCurrency}
      />
    </CartProvider>
  );
}

function NotAcceptingOrdersBanner() {
  return (
    <div className="sticky top-0 z-40 border-b border-border bg-muted/80 px-4 py-2 text-center text-xs font-medium text-muted-foreground backdrop-blur">
      Not accepting orders right now
    </div>
  );
}
