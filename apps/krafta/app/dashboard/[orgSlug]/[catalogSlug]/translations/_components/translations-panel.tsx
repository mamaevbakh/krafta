"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { LanguagesSidebar, type CatalogLocale } from "./languages-sidebar";
import { ItemsTab, type ItemRow } from "./items-tab";

/**
 * Localization Workbench — top-level panel.
 *
 * Layout:
 *   - Header: catalog name + daily quota counter
 *   - Two-pane body: LanguagesSidebar (left) + Tabs (right)
 *   - Tabs: Items (only enabled in Phase 1); Catalog / Categories / Variations /
 *     Modifiers / Modifier Lists shown disabled with "Coming in Phase 2" tooltips
 *
 * Per the design doc, the panel intentionally stays scoped to one catalog at
 * a time. Cross-catalog translation work is a v1.5 feature (a "Translate all
 * my catalogs" bulk surface).
 */

export type CompletenessRow = {
  // View columns are returned as nullable by Supabase typegen because
  // PostgREST can't prove a view-derived column is NOT NULL even if the
  // underlying expression is. Treat as nullable at the boundary and fall
  // back to safe defaults inside the panel.
  locale: string | null;
  entity_kind: string | null;
  total: number | null;
  translated: number | null;
  non_stale: number | null;
  missing: number | null;
  stale: number | null;
};

export type Quota = {
  daily_quota: number;
  used_today: number;
  quota_reset_at: string;
};

export type TranslationsPanelProps = {
  catalogId: string;
  catalogSlug: string;
  catalogName: string;
  locales: CatalogLocale[];
  items: ItemRow[];
  completeness: CompletenessRow[];
  quota: Quota | null;
};

export function TranslationsPanel({
  catalogId,
  catalogSlug,
  catalogName,
  locales,
  items,
  completeness,
  quota,
}: TranslationsPanelProps) {
  const router = useRouter();

  // KRA-92: 500/day cap removed. The quota row still tracks used_today +
  // total_tokens_used + total_usd_estimated for cost visibility, but we no
  // longer enforce a cap. The counter just shows usage now.
  const usedToday = quota?.used_today ?? 0;

  // Default the active tab to "items". Phase 1 only has items wired; the
  // other tabs are visual placeholders.
  const [activeTab, setActiveTab] = React.useState("items");

  const refreshAfterMutation = React.useCallback(() => {
    // Re-fetch the RSC payload — picks up new locales / new translation
    // rows / new quota usage. Cheap on this small page.
    router.refresh();
  }, [router]);

  const enabledLocales = React.useMemo(
    () => locales.filter((l) => l.is_enabled),
    [locales],
  );
  const targetLocales = React.useMemo(
    () => enabledLocales.filter((l) => !l.is_default),
    [enabledLocales],
  );
  const defaultLocale = React.useMemo(
    () => enabledLocales.find((l) => l.is_default) ?? null,
    [enabledLocales],
  );

  // Completeness lookup helper for the Items tab counter.
  const itemsCompleteness = React.useMemo(() => {
    const map = new Map<string, CompletenessRow>();
    for (const row of completeness) {
      if (row.entity_kind === "item" && row.locale) {
        map.set(row.locale, row);
      }
    }
    return map;
  }, [completeness]);

  // Tab counter format: "Items 47/120" → translated / total, summed across
  // all non-default locales for that entity kind.
  const itemsLabel = React.useMemo(() => {
    if (targetLocales.length === 0) return "Items";
    let translated = 0;
    let total = 0;
    for (const locale of targetLocales) {
      const row = itemsCompleteness.get(locale.locale);
      if (row) {
        translated += row.non_stale ?? 0;
        total += row.total ?? 0;
      } else {
        total += items.length;
      }
    }
    if (total === 0) return "Items";
    return `Items ${translated}/${total}`;
  }, [targetLocales, itemsCompleteness, items.length]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-screen flex-col">
        <header className="flex flex-col gap-2 border-b px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">Translations</span>
            <span className="text-xs text-muted-foreground">·</span>
            <h1 className="truncate text-base font-semibold tracking-tight">
              {catalogName}
            </h1>
          </div>
          <UsageIndicator usedToday={usedToday} />
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-0 lg:flex-row">
          <aside className="border-b lg:w-64 lg:border-b-0 lg:border-r">
            <LanguagesSidebar
              catalogId={catalogId}
              catalogSlug={catalogSlug}
              locales={locales}
              onMutation={refreshAfterMutation}
            />
          </aside>

          <main className="min-w-0 flex-1">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex h-full flex-col"
            >
              <div className="border-b px-4 py-2 md:px-6">
                <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
                  <TabsTrigger value="items" className="data-[state=active]:bg-muted">
                    {itemsLabel}
                  </TabsTrigger>
                  <DisabledTab label="Catalog" reason="Catalog meta (shop name + description) ships in Phase 2 once demand evidence emerges." />
                  <DisabledTab label="Categories" reason="Category translations land in Phase 2 of the workbench." />
                  <DisabledTab label="Variations" reason="Variation translations land in Phase 2 of the workbench." />
                  <DisabledTab label="Modifiers" reason="Modifier translations land in Phase 2, after KRA-85 ships modifier-list CRUD." />
                  <DisabledTab label="Modifier Lists" reason="Same as Modifiers — Phase 2 dependency on KRA-85." />
                </TabsList>
              </div>

              <TabsContent value="items" className="flex-1 overflow-auto p-4 md:p-6">
                {enabledLocales.length <= 1 ? (
                  <NoTargetLocalesEmpty hasDefaultLocale={defaultLocale !== null} />
                ) : (
                  <ItemsTab
                    catalogId={catalogId}
                    defaultLocale={defaultLocale}
                    targetLocales={targetLocales}
                    items={items}
                    onMutation={refreshAfterMutation}
                  />
                )}
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// UsageIndicator — visible top-right of the header
//
// KRA-92: 500/day cap removed. This used to be a cap counter; now it's just
// a usage display. Hidden entirely when usedToday is 0 to keep the header
// uncluttered on quiet days.
// ============================================================================

function UsageIndicator({ usedToday }: { usedToday: number }) {
  if (usedToday === 0) {
    return null;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="AI translations today"
          className={cn(
            "flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
        >
          <span className="font-medium text-foreground">{usedToday}</span>
          <span>
            AI translation{usedToday === 1 ? "" : "s"} today
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        Counter resets at 00:00 UTC. Manual edits don&apos;t count — only
        AI-generated translations do.
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// DisabledTab — visual placeholder for Phase 2 entity kinds
// ============================================================================

function DisabledTab({ label, reason }: { label: string; reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-9 cursor-not-allowed select-none items-center gap-1 rounded-md px-3 text-sm",
            "text-muted-foreground/60 opacity-70",
          )}
          aria-disabled="true"
          role="button"
          tabIndex={-1}
        >
          {label}
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            Soon
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Empty state when the merchant hasn't added a target locale yet
// ============================================================================

function NoTargetLocalesEmpty({ hasDefaultLocale }: { hasDefaultLocale: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <Globe className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-sm font-medium">No target language yet</h2>
      <p className="text-xs text-muted-foreground">
        {hasDefaultLocale ? (
          <>
            Your default language is set. Add another language in the sidebar
            (Russian, Uzbek, English, or any locale code) and we&apos;ll
            translate your menu into it.
          </>
        ) : (
          <>
            This catalog has no languages configured yet. Add a default
            language and at least one target language in the sidebar to get
            started.
          </>
        )}
      </p>
    </div>
  );
}
