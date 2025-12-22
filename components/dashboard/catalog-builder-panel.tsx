"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CatalogLayoutSettings } from "@/lib/catalogs/settings/layout";
import { CatalogPreviewFrame } from "@/components/dashboard/catalog-preview-frame";
import { Button } from "@/components/ui/button";

type OptionConfig<T extends string> = {
  label: string;
  value: T;
};

type BuilderPanelProps = {
  catalogSlug: string;
  initialLayout: CatalogLayoutSettings;
  headerOptions: OptionConfig<CatalogLayoutSettings["headerVariant"]>[];
  sectionOptions: OptionConfig<CatalogLayoutSettings["sectionVariant"]>[];
  itemCardOptions: OptionConfig<CatalogLayoutSettings["itemCardVariant"]>[];
  itemDetailOptions: OptionConfig<CatalogLayoutSettings["itemDetailVariant"]>[];
  navOptions: OptionConfig<CatalogLayoutSettings["categoryNavVariant"]>[];
};

export function CatalogBuilderPanel({
  catalogSlug,
  initialLayout,
  headerOptions,
  sectionOptions,
  itemCardOptions,
  itemDetailOptions,
  navOptions,
}: BuilderPanelProps) {
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

  const layoutOverrides = useMemo(
    () => ({
      headerVariant,
      sectionVariant,
      itemCardVariant,
      categoryNavVariant,
      itemDetailVariant,
    }),
    [
      headerVariant,
      sectionVariant,
      itemCardVariant,
      categoryNavVariant,
      itemDetailVariant,
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

    return `/${catalogSlug}?${params.toString()}`;
  }, [
    catalogSlug,
    headerVariant,
    sectionVariant,
    itemCardVariant,
    categoryNavVariant,
    itemDetailVariant,
  ]);

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

        <OptionSection
          title="Item Detail"
          description="Full item view when a card is opened."
          options={itemDetailOptions}
          selected={itemDetailVariant}
          onSelect={setItemDetailVariant}
        />

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
