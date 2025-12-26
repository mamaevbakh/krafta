"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CatalogLayoutSettings } from "@/lib/catalogs/settings/layout";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { CatalogPreviewFrame } from "@/components/dashboard/catalog-preview-frame";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { saveCatalogLayout } from "@/app/dashboard/[orgSlug]/[catalogSlug]/builder/actions";

type OptionConfig<T extends string> = {
  label: string;
  value: T;
};

type AspectPreset = {
  width: number;
  height: number;
};

const COMMON_ASPECT_RATIOS: AspectPreset[] = [
  { width: 1, height: 1 },
  { width: 4, height: 3 },
  { width: 3, height: 4 },
  { width: 16, height: 9 },
  { width: 9, height: 16 },
];

function getAspectInputs(ratio: number): AspectPreset {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  let bestMatch = COMMON_ASPECT_RATIOS[0];
  let bestDiff = Infinity;

  for (const preset of COMMON_ASPECT_RATIOS) {
    const presetRatio = preset.width / preset.height;
    const diff = Math.abs(presetRatio - safeRatio);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = preset;
    }
  }

  if (bestDiff <= 0.02) {
    return bestMatch;
  }

  return {
    width: Number(safeRatio.toFixed(2)),
    height: 1,
  };
}

type BuilderPanelProps = {
  catalogId: string;
  catalogSlug: string;
  initialLayout: CatalogLayoutSettings;
  initialCurrency: CurrencySettings;
  headerOptions: OptionConfig<CatalogLayoutSettings["headerVariant"]>[];
  sectionOptions: OptionConfig<CatalogLayoutSettings["sectionVariant"]>[];
  itemCardOptions: OptionConfig<CatalogLayoutSettings["itemCardVariant"]>[];
  itemDetailOptions: OptionConfig<CatalogLayoutSettings["itemDetailVariant"]>[];
  navOptions: OptionConfig<CatalogLayoutSettings["categoryNavVariant"]>[];
};

export function CatalogBuilderPanel({
  catalogId,
  catalogSlug,
  initialLayout,
  initialCurrency,
  headerOptions,
  sectionOptions,
  itemCardOptions,
  itemDetailOptions,
  navOptions,
}: BuilderPanelProps) {
  const initialAspectInputs = useMemo(
    () => getAspectInputs(initialLayout.itemCard.aspectRatio),
    [initialLayout.itemCard.aspectRatio],
  );

  const [headerVariant, setHeaderVariant] = useState(
    initialLayout.headerVariant,
  );
  const [sectionVariant, setSectionVariant] = useState(
    initialLayout.sectionVariant,
  );
  const [itemCardVariant, setItemCardVariant] = useState(
    initialLayout.itemCardVariant,
  );
  const [categoryNavVariant, setCategoryNavVariant] = useState(
    initialLayout.categoryNavVariant,
  );
  const [itemDetailVariant, setItemDetailVariant] = useState(
    initialLayout.itemDetailVariant,
  );
  const [itemCardColumns, setItemCardColumns] = useState(
    initialLayout.itemCard.columns,
  );
  const [aspectWidth, setAspectWidth] = useState(
    initialAspectInputs.width,
  );
  const [aspectHeight, setAspectHeight] = useState(
    initialAspectInputs.height,
  );
  const [currencyCode, setCurrencyCode] = useState(
    initialCurrency.defaultCurrency,
  );
  const [currencyLabel, setCurrencyLabel] = useState(
    initialCurrency.label,
  );
  const [thousandSeparator, setThousandSeparator] = useState(
    initialCurrency.thousandSeparator,
  );
  const [decimalSeparator, setDecimalSeparator] = useState(
    initialCurrency.decimalSeparator,
  );
  const [showDecimals, setShowDecimals] = useState(
    initialCurrency.showDecimals,
  );
  const [labelPosition, setLabelPosition] = useState(
    initialCurrency.labelPosition,
  );
  const [isSaving, setIsSaving] = useState(false);

  const aspectRatio = useMemo(() => {
    const safeWidth =
      Number.isFinite(aspectWidth) && aspectWidth > 0
        ? aspectWidth
        : 1;
    const safeHeight =
      Number.isFinite(aspectHeight) && aspectHeight > 0
        ? aspectHeight
        : 1;
    return safeWidth / safeHeight;
  }, [aspectWidth, aspectHeight]);

  const layoutOverrides = useMemo(
    () => ({
      headerVariant,
      sectionVariant,
      itemCardVariant,
      categoryNavVariant,
      itemDetailVariant,
      itemCard: {
        columns: itemCardColumns,
        aspectRatio,
      },
    }),
    [
      headerVariant,
      sectionVariant,
      itemCardVariant,
      categoryNavVariant,
      itemDetailVariant,
      itemCardColumns,
      aspectRatio,
    ],
  );
  const currencyOverrides = useMemo(
    () => ({
      defaultCurrency: currencyCode,
      label: currencyLabel,
      thousandSeparator,
      decimalSeparator,
      showDecimals,
      labelPosition,
    }),
    [
      currencyCode,
      currencyLabel,
      thousandSeparator,
      decimalSeparator,
      showDecimals,
      labelPosition,
    ],
  );
  const previewHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("preview", "1");
    params.set("header", headerVariant);
    params.set("section", sectionVariant);
    params.set("card", itemCardVariant);
    params.set("nav", categoryNavVariant);
    params.set("detail", itemDetailVariant);
    params.set("cols", String(itemCardColumns));
    params.set("ratio", String(aspectRatio));
    params.set("cur", currencyCode);
    params.set("curLabel", currencyLabel);
    params.set("curThousand", thousandSeparator);
    params.set("curDecimal", decimalSeparator);
    params.set("curDecimals", showDecimals ? "1" : "0");
    params.set("curPos", labelPosition);

    return `/preview/${catalogSlug}?${params.toString()}`;
  }, [
    catalogSlug,
    headerVariant,
    sectionVariant,
    itemCardVariant,
    categoryNavVariant,
    itemDetailVariant,
    itemCardColumns,
    aspectRatio,
    currencyCode,
    currencyLabel,
    thousandSeparator,
    decimalSeparator,
    showDecimals,
    labelPosition,
  ]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    const settingsLayout: CatalogLayoutSettings = {
      ...initialLayout,
      headerVariant,
      sectionVariant,
      itemCardVariant,
      categoryNavVariant,
      itemDetailVariant,
      itemCard: {
        columns: itemCardColumns,
        aspectRatio,
      },
    };
    const settingsCurrency: CurrencySettings = {
      ...initialCurrency,
      defaultCurrency: currencyCode,
      label: currencyLabel,
      thousandSeparator,
      decimalSeparator,
      showDecimals,
      labelPosition,
    };

    const result = await saveCatalogLayout({
      catalogId,
      catalogSlug,
      settingsLayout,
      settingsCurrency,
    });

    if (!result.ok) {
      toast.error("Failed to save layout", {
        description: result.error ?? "Unknown error",
      });
    } else {
      toast.success("Layout saved");
    }

    setIsSaving(false);
  };

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-6">
        <OptionSection
          title="Headers"
          description="Top branding and catalog identity."
          options={headerOptions}
          selected={headerVariant}
          onSelect={setHeaderVariant}
        />

        <OptionSection
          title="Sections"
          description="Category grouping and spacing."
          options={sectionOptions}
          selected={sectionVariant}
          onSelect={setSectionVariant}
        />

        <OptionSection
          title="Item Cards"
          description="How each item is rendered."
          options={itemCardOptions}
          selected={itemCardVariant}
          onSelect={setItemCardVariant}
        />

        <section className="rounded-lg border bg-background p-4">
          <h2 className="text-sm font-semibold">Item Card Layout</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Columns and image aspect ratio.
          </p>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-xs text-muted-foreground">
              Columns
              <input
                type="number"
                min={1}
                max={4}
                step={1}
                value={itemCardColumns}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  if (!Number.isFinite(nextValue)) return;
                  const clamped = Math.min(
                    4,
                    Math.max(1, Math.round(nextValue)),
                  );
                  setItemCardColumns(clamped);
                }}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>

            <div className="grid gap-2 text-xs text-muted-foreground">
              <span>Aspect ratio</span>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={aspectWidth}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue)) return;
                    setAspectWidth(Math.max(0.1, nextValue));
                  }}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                <span className="text-xs text-muted-foreground">
                  /
                </span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={aspectHeight}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue)) return;
                    setAspectHeight(Math.max(0.1, nextValue));
                  }}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <span className="text-[11px] text-muted-foreground">
                Computed ratio: {aspectRatio.toFixed(3)}
              </span>
            </div>
          </div>
        </section>

        <OptionSection
          title="Item Detail"
          description="Full item view when a card is opened."
          options={itemDetailOptions}
          selected={itemDetailVariant}
          onSelect={setItemDetailVariant}
        />

        <section className="rounded-lg border bg-background p-4">
          <h2 className="text-sm font-semibold">Pricing</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Currency label and formatting for item prices.
          </p>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-xs text-muted-foreground">
              Default currency
              <input
                type="text"
                value={currencyCode}
                onChange={(event) => setCurrencyCode(event.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="USD"
              />
            </label>

            <label className="grid gap-2 text-xs text-muted-foreground">
              Currency label
              <input
                type="text"
                value={currencyLabel}
                onChange={(event) => setCurrencyLabel(event.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="$"
              />
            </label>

            <div className="grid gap-2 text-xs text-muted-foreground">
              Label position
              <div className="grid grid-cols-2 gap-2">
                {(["prefix", "suffix"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLabelPosition(value)}
                    className={[
                      "rounded-md border px-3 py-2 text-sm",
                      labelPosition === value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:border-foreground",
                    ].join(" ")}
                  >
                    {value === "prefix" ? "Label first" : "Label last"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 text-xs text-muted-foreground">
              Thousand separator
              <div className="grid grid-cols-3 gap-2">
                {([",", ".", " "] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setThousandSeparator(value)}
                    className={[
                      "rounded-md border px-3 py-2 text-sm",
                      thousandSeparator === value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:border-foreground",
                    ].join(" ")}
                  >
                    {value === " " ? "Space" : value}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 text-xs text-muted-foreground">
              Decimal separator
              <div className="grid grid-cols-2 gap-2">
                {([".", ","] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDecimalSeparator(value)}
                    className={[
                      "rounded-md border px-3 py-2 text-sm",
                      decimalSeparator === value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:border-foreground",
                    ].join(" ")}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showDecimals}
                onChange={(event) => setShowDecimals(event.target.checked)}
                className="h-4 w-4 rounded border-border text-foreground"
              />
              Show decimals
            </label>
          </div>
        </section>

        <OptionSection
          title="Navigation"
          description="Category navigation style."
          options={navOptions}
          selected={categoryNavVariant}
          onSelect={setCategoryNavVariant}
        />
      </aside>

      <section className="rounded-xl border bg-background p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Preview</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Live catalog snapshot
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
            >
              <Link
                href={previewHref}
                target="_blank"
                rel="noreferrer"
              >
                Preview
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
            <span className="rounded-full border border-border px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Draft
            </span>
          </div>
        </div>

        <CatalogPreviewFrame
          catalogSlug={catalogSlug}
          layoutOverrides={layoutOverrides}
          currencyOverrides={currencyOverrides}
        />
      </section>
    </div>
  );
}

function OptionSection<T extends string>({
  title,
  description,
  options,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  options: OptionConfig<T>[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <section className="rounded-lg border bg-background p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {description}
      </p>
      <div className="mt-4 grid gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={[
              "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
              option.value === selected
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground hover:border-foreground",
            ].join(" ")}
          >
            <span>{option.label}</span>
            {option.value === selected ? (
              <span className="rounded-full bg-background/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                Selected
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Preview
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
