"use client";

import { useMemo, useState } from "react";
import type { CatalogLayoutSettings } from "@/lib/catalogs/settings/layout";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

type PreviewPreset = {
  id: string;
  label: string;
  width: number | "100%";
  height: number;
};

const PREVIEW_PRESETS: PreviewPreset[] = [
  { id: "desktop", label: "Desktop", width: "100%", height: 780 },
  { id: "tablet", label: "Tablet", width: 820, height: 1180 },
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
  { id: "square", label: "Square", width: 800, height: 800 },
];

export function CatalogPreviewFrame({
  catalogSlug,
  layoutOverrides,
  currencyOverrides,
}: {
  catalogSlug: string;
  layoutOverrides?: Partial<CatalogLayoutSettings>;
  currencyOverrides?: CurrencySettings;
}) {
  const [presetId, setPresetId] = useState<string>("desktop");
  const preset = useMemo(
    () => PREVIEW_PRESETS.find((item) => item.id === presetId),
    [presetId],
  );

  const width =
    preset?.width ?? PREVIEW_PRESETS[0].width;
  const height =
    preset?.height ?? PREVIEW_PRESETS[0].height;
  const frameStyle = {
    width: typeof width === "number" ? `${width}px` : width,
    height: `${height}px`,
  };
  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams();
    params.set("preview", "1");

    if (layoutOverrides?.headerVariant) {
      params.set("header", layoutOverrides.headerVariant);
    }
    if (layoutOverrides?.sectionVariant) {
      params.set("section", layoutOverrides.sectionVariant);
    }
    if (layoutOverrides?.itemCardVariant) {
      params.set("card", layoutOverrides.itemCardVariant);
    }
    if (layoutOverrides?.categoryNavVariant) {
      params.set("nav", layoutOverrides.categoryNavVariant);
    }
    if (layoutOverrides?.itemDetailVariant) {
      params.set("detail", layoutOverrides.itemDetailVariant);
    }
    if (layoutOverrides?.itemCard?.columns) {
      params.set("cols", String(layoutOverrides.itemCard.columns));
    }
    if (layoutOverrides?.itemCard?.aspectRatio) {
      params.set("ratio", String(layoutOverrides.itemCard.aspectRatio));
    }
    if (currencyOverrides) {
      params.set("cur", currencyOverrides.defaultCurrency);
      params.set("curLabel", currencyOverrides.label);
      params.set("curThousand", currencyOverrides.thousandSeparator);
      params.set("curDecimal", currencyOverrides.decimalSeparator);
      params.set("curDecimals", currencyOverrides.showDecimals ? "1" : "0");
      params.set("curPos", currencyOverrides.labelPosition);
    }

    return `/preview/${catalogSlug}?${params.toString()}`;
  }, [catalogSlug, layoutOverrides, currencyOverrides]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {PREVIEW_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPresetId(item.id)}
            className={[
              "rounded-full border px-3 py-1 text-xs transition",
              presetId === item.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}

        <span className="ml-auto text-xs text-muted-foreground">
          {typeof width === "number" ? `${width}px` : width} × {height}px
        </span>
      </div>

      <div className="rounded-xl border border-dashed border-border bg-secondary-background/40 p-4">
        <div className="w-full overflow-auto">
          <div
            className="mx-auto overflow-hidden rounded-lg border border-border bg-background shadow-sm"
            style={frameStyle}
          >
            <iframe
              title="Catalog preview"
              src={iframeSrc}
              className="h-full w-full"
              loading="lazy"
              sandbox="allow-same-origin allow-scripts allow-forms"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
