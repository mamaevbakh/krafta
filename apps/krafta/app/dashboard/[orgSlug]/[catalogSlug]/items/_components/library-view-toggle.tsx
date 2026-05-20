"use client";

/**
 * library-view-toggle.tsx — Canvas/Table view switcher for the Library route (KRA-35 PR3).
 *
 * Per the 2026-05-20 ADR 0002 revision + design doc Approach B: the
 * Library route hosts TWO views of the same items data via an inline
 * toggle. Canvas (visual editor, the headline) is default; Table (legacy
 * DataTable UX) is preserved for power users who want sort/scan/bulk
 * select.
 *
 * Implementation: shadcn `Tabs` (TabsList + TabsTrigger only — no
 * TabsContent, since the content lives at page scope above this
 * component). State persists in localStorage under `krafta.library.view`
 * per merchant. Hydration: SSR renders Canvas (the default); the first
 * client effect reads localStorage and may flip to Table.
 *
 * Mobile (< 768px) hides the Table option entirely — the DataTable
 * doesn't fit a 375px viewport and merchants on phones get the Canvas
 * regardless. The toggle still renders on mobile but with only the
 * Canvas trigger visible.
 *
 * The toggle is rendered ABOVE both views, INSIDE the page header so it
 * stays visible when the merchant scrolls a long list of items. The
 * parent LibraryRoot consumes the active view value and renders either
 * <LibraryCanvas> or <ItemsPanel> accordingly.
 */

import * as React from "react";
import { LayoutGrid, Table as TableIcon } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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
      // localStorage unavailable (private mode, etc.). Fall through with
      // the default. No need to surface — this is a preference, not data.
    }
  }, []);

  const setView = React.useCallback((next: LibraryView) => {
    setViewState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Same as above — preference, not data. Fall through.
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
  return (
    <Tabs
      value={view}
      onValueChange={(value) => onViewChange(value as LibraryView)}
      className={className}
    >
      <TabsList>
        <TabsTrigger value="canvas">
          <LayoutGrid className="size-4" />
          Canvas
        </TabsTrigger>
        {/* Table view is desktop-only — DataTable doesn't fit 375px
            viewports. Hide the trigger on mobile via `hidden md:flex`.
            If the merchant's last-saved preference was Table, the
            useLibraryView hook still returns "table" but the parent
            (LibraryRoot) renders Canvas on mobile regardless of the
            stored preference — see library-canvas-or-table.tsx. */}
        <TabsTrigger value="table" className={cn("hidden md:inline-flex")}>
          <TableIcon className="size-4" />
          Table
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
