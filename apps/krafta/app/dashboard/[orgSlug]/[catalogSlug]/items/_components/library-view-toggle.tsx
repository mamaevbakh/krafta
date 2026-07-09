"use client";

/**
 * library-view-toggle.tsx — Canvas/Table view switcher (KRA-35 Iter 2 / T4).
 *
 * Per design plan §3 D5: bottom-center floating segmented pill. Replaces
 * the top-strip placement from iter 1 (which competed with the page header
 * for visual prominence). The pill is fixed-positioned at the viewport
 * bottom, ~30px from the edge, centered.
 *
 * Visual: shadcn Tabs primitive styled as a pill (rounded-full TabsList,
 * rounded-full TabsTrigger). Backdrop blur + bg-background/85 + subtle
 * border + shadow-sm. The shadow is functional (lifts the pill off the
 * canvas), not decorative — within DESIGN.md tolerance.
 *
 * Mobile (< md) hides the pill entirely. Mobile is always Canvas view;
 * the legacy DataTable doesn't fit 375px viewports per LibraryView spec.
 *
 * Z-index: 30. shadcn Sheet's backdrop sits higher (z-50) so when the
 * EditorSheet is open the pill is occluded by the backdrop dimming —
 * effectively "hidden" by layering, no explicit visibility prop needed.
 */

import * as React from "react";
import { LayoutGrid, Table as TableIcon } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/locales/dashboard/context";

export type LibraryView = "canvas" | "table";

const STORAGE_KEY = "krafta.library.view";

export function useLibraryView(): [LibraryView, (next: LibraryView) => void] {
  // SSR + initial paint: Canvas. The client effect below reads localStorage
  // after hydration. Brief flash (Canvas first, then Table if persisted) is
  // acceptable for a per-merchant preference; alternative is a flash-of-
  // nothing while we wait for localStorage to read, which is worse UX.
  const [view, setViewState] = React.useState<LibraryView>("canvas");

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "table" || stored === "canvas") {
        setViewState(stored);
      }
    } catch {
      // localStorage unavailable (private mode, etc.). Fall through.
    }
  }, []);

  const setView = React.useCallback((next: LibraryView) => {
    setViewState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Same as above — preference, not data.
    }
  }, []);

  return [view, setView];
}

export function LibraryViewToggle({
  view,
  onViewChange,
  className,
}: {
  view: LibraryView;
  onViewChange: (next: LibraryView) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <Tabs
      value={view}
      onValueChange={(value) => onViewChange(value as LibraryView)}
      className={cn(
        // Fixed bottom-center pill. z-30 — sits above canvas, below the
        // EditorSheet's backdrop (z-50) so the sheet visually occludes it.
        "fixed bottom-6 left-1/2 z-30 -translate-x-1/2",
        // Hide on mobile entirely — mobile is always Canvas.
        "hidden md:block",
        // Surface: pill with backdrop blur. shadow-sm is functional
        // (lifts off the canvas), not decorative.
        "rounded-full border border-border bg-background/85 shadow-sm backdrop-blur-md",
        className,
      )}
    >
      <TabsList className="rounded-full bg-transparent p-1">
        <TabsTrigger
          value="canvas"
          className="rounded-full data-[state=active]:bg-foreground data-[state=active]:text-background"
        >
          <LayoutGrid className="size-4" />
          {t("items.view_canvas")}
        </TabsTrigger>
        <TabsTrigger
          value="table"
          className="rounded-full data-[state=active]:bg-foreground data-[state=active]:text-background"
        >
          <TableIcon className="size-4" />
          {t("items.view_table")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
