"use client";

import * as React from "react";
import { startTransition } from "react";
import { Bot, AlertCircle, Check } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyContent, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { TranslationEditDrawer } from "./translation-edit-drawer";
import { TranslateAllButton } from "./translate-all-button";
import type { CatalogLocale } from "./languages-sidebar";

/**
 * Items tab — the only Phase 1 enabled tab.
 *
 * Layout:
 *   - Action bar at top: "Translate all to {locale}" buttons (one per target)
 *   - Table:
 *     - Column 1: default-locale name + description preview (read-only)
 *     - Columns 2..N: one per target locale, showing translated name OR
 *       "Missing" badge OR "AI — review" badge OR "Stale" badge
 *
 * Row click opens the TranslationEditDrawer for that item, with all enabled
 * target locales pre-filled in editable columns.
 */

export type ItemTranslation = {
  id: string;
  locale: string;
  name: string;
  description: string | null;
  image_alt: string | null;
  is_ai_translated: boolean;
  last_edited_by: string | null;
  source_hash: string | null;
  updated_at: string;
};

export type ItemRow = {
  id: string;
  name: string;
  description: string | null;
  image_alt: string | null;
  is_active: boolean;
  position: number;
  current_source_hash: string | null;
  item_translations: ItemTranslation[];
};

export type ItemsTabProps = {
  catalogId: string;
  defaultLocale: CatalogLocale | null;
  targetLocales: CatalogLocale[];
  items: ItemRow[];
  quotaRemaining: number;
  dailyQuota: number;
  onMutation: () => void;
};

type CellStatus =
  | { kind: "translated"; text: string; needsReview: boolean; stale: boolean }
  | { kind: "missing" };

function getCellStatus(
  item: ItemRow,
  locale: string,
): CellStatus {
  const t = item.item_translations.find((tr) => tr.locale === locale);
  if (!t) return { kind: "missing" };

  // Drift detection: stored source_hash should equal the parent's current.
  // Bytea comes back as hex string with `\x` prefix; compare verbatim.
  const stale =
    item.current_source_hash !== null &&
    t.source_hash !== null &&
    item.current_source_hash !== t.source_hash;

  return {
    kind: "translated",
    text: t.name,
    needsReview: t.is_ai_translated,
    stale,
  };
}

export function ItemsTab({
  catalogId,
  defaultLocale,
  targetLocales,
  items,
  quotaRemaining,
  dailyQuota,
  onMutation,
}: ItemsTabProps) {
  const [drawerItemId, setDrawerItemId] = React.useState<string | null>(null);

  const drawerItem = React.useMemo(
    () => (drawerItemId ? items.find((i) => i.id === drawerItemId) ?? null : null),
    [drawerItemId, items],
  );

  if (items.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyContent>
          <EmptyTitle>No items in this catalog</EmptyTitle>
          <EmptyDescription>
            Add items in the Library before translating them. Each item you add
            shows up here automatically.
          </EmptyDescription>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Action bar: one Translate-all per target locale */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"} ·
        </span>
        {targetLocales.map((locale) => (
          <TranslateAllButton
            key={locale.locale}
            catalogId={catalogId}
            targetLocale={locale}
            items={items}
            quotaRemaining={quotaRemaining}
            dailyQuota={dailyQuota}
            onEnqueued={onMutation}
          />
        ))}
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">
                {defaultLocale ? (
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">
                      {defaultLocale.display_name}
                    </span>
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      default
                    </Badge>
                  </span>
                ) : (
                  "Source"
                )}
              </TableHead>
              {targetLocales.map((locale) => (
                <TableHead key={locale.locale}>
                  <span className="flex items-center gap-1.5">
                    {locale.display_name}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {locale.locale}
                    </span>
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                onClick={() => setDrawerItemId(item.id)}
                className={cn(
                  "cursor-pointer",
                  !item.is_active && "opacity-60",
                )}
              >
                <TableCell className="align-top">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{item.name}</span>
                    {item.description && (
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </div>
                </TableCell>
                {targetLocales.map((locale) => {
                  const status = getCellStatus(item, locale.locale);
                  return (
                    <TableCell key={locale.locale} className="align-top">
                      <TranslationCell status={status} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {drawerItem && (
        <TranslationEditDrawer
          open
          onOpenChange={(open) => !open && setDrawerItemId(null)}
          item={drawerItem}
          defaultLocale={defaultLocale}
          targetLocales={targetLocales}
          catalogId={catalogId}
          onMutation={() => {
            startTransition(() => onMutation());
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// TranslationCell — visual for a single (item × locale) cell
// ============================================================================

function TranslationCell({ status }: { status: CellStatus }) {
  if (status.kind === "missing") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true" />
        Missing
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className={cn("text-sm font-medium", status.stale && "text-muted-foreground")}>
          {status.text}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {status.stale && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[10px]">
                <AlertCircle className="size-2.5" aria-hidden="true" />
                stale
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              The source text changed since this translation was made. Re-translate
              to refresh.
            </TooltipContent>
          </Tooltip>
        )}
        {status.needsReview ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[10px]">
                <Bot className="size-2.5" aria-hidden="true" />
                AI — review
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              AI generated this translation. Open the row to edit or accept it.
            </TooltipContent>
          </Tooltip>
        ) : (
          !status.stale && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[10px]">
                  <Check className="size-2.5" aria-hidden="true" />
                  reviewed
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Translation reviewed by a human (or accepted).
              </TooltipContent>
            </Tooltip>
          )
        )}
      </div>
    </div>
  );
}

