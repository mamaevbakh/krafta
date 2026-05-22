"use client";

import * as React from "react";
import { startTransition } from "react";
import { Plus, Star, EyeOff, Eye, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  disableCatalogLocale,
  enableCatalogLocale,
} from "@/lib/translation/actions";

import { AddLocaleDialog } from "./add-locale-dialog";
import { EditLocaleDialog } from "./edit-locale-dialog";

/**
 * Languages sidebar.
 *
 * Lists all locales for the catalog (enabled + disabled). Per locale:
 *   - default star (✦) on the one is_default row
 *   - display name (primary) + locale code + RTL badge (secondary)
 *   - pencil button → EditLocaleDialog (rename display name)
 *   - eye toggle → enable / disable (hidden on the default row)
 *
 * Operations:
 *   - "+ Add language" button → AddLocaleDialog → addCatalogLocale
 *   - Pencil → EditLocaleDialog → updateCatalogLocale
 *   - Eye toggle → disableCatalogLocale / enableCatalogLocale
 *   - (Phase 2: set-default-locale, drag-reorder)
 *
 * The default locale CANNOT be disabled — that would orphan all translation
 * rows. The eye toggle is hidden on the default row; the pencil stays
 * (renaming a default is a legitimate, frequent need — e.g. "en" → "English").
 *
 * Rows have a subtle hover background to telegraph "these are interactive
 * surfaces" without forcing whole-row click semantics — the actual actions
 * still live in their dedicated icon buttons.
 */

export type CatalogLocale = {
  id: string;
  locale: string;
  is_default: boolean;
  is_enabled: boolean;
  sort_order: number;
  display_name: string;
  text_direction: "ltr" | "rtl";
};

export type LanguagesSidebarProps = {
  catalogId: string;
  catalogSlug: string;
  locales: CatalogLocale[];
  onMutation: () => void;
};

export function LanguagesSidebar({
  catalogId,
  locales,
  onMutation,
}: LanguagesSidebarProps) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [editingLocale, setEditingLocale] =
    React.useState<CatalogLocale | null>(null);
  const [pendingLocale, setPendingLocale] = React.useState<string | null>(null);

  const handleToggle = React.useCallback(
    async (locale: CatalogLocale) => {
      if (locale.is_default) return; // never disable the default

      setPendingLocale(locale.locale);
      const action = locale.is_enabled
        ? disableCatalogLocale
        : enableCatalogLocale;
      const result = await action({
        catalogId,
        locale: locale.locale,
      });
      setPendingLocale(null);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        locale.is_enabled
          ? `${locale.display_name} disabled`
          : `${locale.display_name} re-enabled`,
      );
      startTransition(() => onMutation());
    },
    [catalogId, onMutation],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 md:px-5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Languages
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setAddOpen(true)}
          aria-label="Add language"
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <ul className="flex flex-col">
        {locales.length === 0 ? (
          <li className="px-4 py-2 text-xs text-muted-foreground md:px-5">
            No languages set up.
          </li>
        ) : (
          locales.map((locale) => {
            // Hide the secondary code line when it would duplicate the
            // display name (e.g. catalogs whose default locale was
            // created with display_name = "en"). Belt + braces: also
            // compare lowercased so "EN" vs "en" still collapses.
            const showCode =
              locale.display_name.trim().toLowerCase() !==
              locale.locale.toLowerCase();

            return (
              <li
                key={locale.id}
                className={cn(
                  "flex items-center gap-1 px-4 py-2 text-sm transition-colors md:px-5",
                  // Subtle hover bg signals "these rows are alive" without
                  // making the whole row clickable. Actions still live in
                  // dedicated buttons.
                  "hover:bg-accent/40",
                  // Single source of "this is off": opacity on the whole
                  // row. The closed-eye icon carries the rest of the
                  // semantics — no strikethrough, no extra badge.
                  locale.is_enabled ? "text-foreground" : "opacity-50",
                )}
              >
                {locale.is_default ? (
                  <Star
                    className="mr-1 size-3.5 shrink-0 fill-foreground text-foreground"
                    aria-label="Default language"
                  />
                ) : (
                  <span
                    className="mr-1 inline-block size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {locale.display_name}
                  </div>
                  {(showCode || locale.text_direction === "rtl") && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {showCode && <span>{locale.locale}</span>}
                      {locale.text_direction === "rtl" && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                          RTL
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditingLocale(locale)}
                  aria-label={`Rename ${locale.display_name}`}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </Button>

                {!locale.is_default && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => handleToggle(locale)}
                    disabled={pendingLocale === locale.locale}
                    // Buttons describe the action that will happen on
                    // click, not the current state. Screen-reader user
                    // hears "Hide English, button" when looking at the
                    // open-eye icon next to a visible language.
                    aria-label={
                      locale.is_enabled
                        ? `Hide ${locale.display_name}`
                        : `Show ${locale.display_name}`
                    }
                  >
                    {pendingLocale === locale.locale ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : locale.is_enabled ? (
                      // Icon represents STATE, not action. Enabled
                      // language → open eye ("currently visible").
                      // Tapping it flips state to hidden.
                      <Eye className="size-3.5" aria-hidden="true" />
                    ) : (
                      <EyeOff className="size-3.5" aria-hidden="true" />
                    )}
                  </Button>
                )}
              </li>
            );
          })
        )}
      </ul>

      <AddLocaleDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        catalogId={catalogId}
        existingLocales={locales.map((l) => l.locale)}
        hasDefault={locales.some((l) => l.is_default)}
        onCreated={() => {
          setAddOpen(false);
          startTransition(() => onMutation());
        }}
      />

      <EditLocaleDialog
        open={editingLocale !== null}
        onOpenChange={(next) => {
          if (!next) setEditingLocale(null);
        }}
        catalogId={catalogId}
        locale={editingLocale}
        onSaved={() => {
          setEditingLocale(null);
          startTransition(() => onMutation());
        }}
      />
    </div>
  );
}
