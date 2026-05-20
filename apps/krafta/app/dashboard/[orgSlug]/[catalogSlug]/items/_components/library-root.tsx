"use client";

/**
 * library-root.tsx — top-level wrapper that picks Canvas or Table view (KRA-35 PR3).
 *
 * Replaces LibraryCanvas as the page's direct render target. The page-
 * level RSC fetch happens upstream; this client component consumes the
 * loaded data and chooses between:
 *
 *   - <LibraryCanvas /> (default — new visual editor)
 *   - <ItemsPanel /> (Table view — the legacy DataTable UX)
 *
 * Selection persists per merchant in localStorage via useLibraryView.
 * Mobile (< 768px) always renders Canvas regardless of preference;
 * Table is desktop-only because the DataTable doesn't fit narrow
 * viewports.
 *
 * Both renderers receive the same props the page fetched (catalogId,
 * catalogSlug, orgId, categories, items, locales, translations, media,
 * currencySettings). The page itself doesn't know which view will render
 * — that's the merchant's choice, surfaced via the toggle inside this
 * component.
 *
 * The view toggle UI lives in the page header (above the canvas/table
 * region) so it stays accessible when the merchant scrolls.
 */

import * as React from "react";

import { ItemsPanel } from "./items-panel";
import { LibraryCanvas } from "./library-canvas";
import {
  LibraryViewToggle,
  useLibraryView,
  type LibraryView,
} from "./library-view-toggle";
import type { CatalogCategory, Item } from "@/lib/catalogs/types";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

type LocaleOption = {
  id: string;
  locale: string;
  is_default: boolean;
  is_enabled: boolean;
  sort_order: number;
};

type ItemTranslation = {
  id: string;
  item_id: string;
  locale: string;
  name: string;
  description: string | null;
  image_alt: string | null;
};

type ItemMedia = {
  id: string;
  item_id: string;
  bucket: string;
  storage_path: string;
  mime_type: string | null;
  kind: "image" | "video";
  title: string | null;
  alt: string | null;
  position: number;
  is_primary: boolean;
};

export type LibraryRootProps = {
  catalogId: string;
  catalogSlug: string;
  orgId: string;
  categories: CatalogCategory[];
  items: Item[];
  locales: LocaleOption[];
  translations: ItemTranslation[];
  media: ItemMedia[];
  currencySettings: CurrencySettings;
};

export function LibraryRoot(props: LibraryRootProps) {
  const [view, setView] = useLibraryView();
  const [isMobile, setIsMobile] = React.useState(false);

  // Track mobile viewport. The matchMedia query mirrors the CSS `md:`
  // breakpoint (768px) so the toggle's mobile hide matches the actual
  // render decision below.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Resolved view: mobile always renders Canvas regardless of stored
  // preference. Table-on-mobile is intentionally unsupported.
  const resolvedView: LibraryView = isMobile ? "canvas" : view;

  // Iter 2 T4: the view toggle is a fixed bottom-center floating pill —
  // it positions itself via `fixed bottom-6 left-1/2 -translate-x-1/2`
  // regardless of where it's placed in the React tree. Mounting it as a
  // sibling here keeps it visible above both Canvas and Table views.
  // The top strip from iter 1 is gone.
  return (
    <>
      {resolvedView === "canvas" ? (
        <LibraryCanvas {...props} />
      ) : (
        <ItemsPanel {...props} />
      )}

      <LibraryViewToggle view={resolvedView} onViewChange={setView} />
    </>
  );
}
