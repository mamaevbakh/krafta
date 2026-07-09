"use client";

import { useMemo, useState } from "react";
import type { CatalogLayoutOverride } from "@/lib/catalogs/settings/layout";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { useT } from "@/lib/locales/dashboard/context";
import type { DashboardMessageKey } from "@/lib/locales/dashboard/messages";
import { cn } from "@/lib/utils";

type PreviewPreset = {
  id: string;
  labelKey: DashboardMessageKey;
  width: number | "100%";
  height: number;
};

const PREVIEW_PRESETS: PreviewPreset[] = [
  { id: "desktop", labelKey: "studio.device_desktop", width: "100%", height: 780 },
  { id: "tablet", labelKey: "studio.device_tablet", width: 820, height: 1180 },
  { id: "mobile", labelKey: "studio.device_mobile", width: 390, height: 844 },
];

export function CatalogPreviewFrame({
  catalogSlug,
  layoutOverrides,
  currencyOverrides,
  className,
}: {
  catalogSlug: string;
  layoutOverrides?: CatalogLayoutOverride;
  currencyOverrides?: CurrencySettings;
  className?: string;
}) {
  const t = useT();
  const [presetId, setPresetId] = useState<string>("mobile");
  const preset = useMemo(
    () => PREVIEW_PRESETS.find((item) => item.id === presetId),
    [presetId],
  );

  const width = preset?.width ?? PREVIEW_PRESETS[0].width;
  const height = preset?.height ?? PREVIEW_PRESETS[0].height;
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

    const freeLogoSettings = layoutOverrides?.header?.basicFreeLogo;
    if (freeLogoSettings) {
      if (freeLogoSettings.showLogo !== undefined) {
        params.set("hflShowLogo", freeLogoSettings.showLogo ? "1" : "0");
      }
      if (freeLogoSettings.showTitle !== undefined) {
        params.set("hflShowTitle", freeLogoSettings.showTitle ? "1" : "0");
      }
      if (freeLogoSettings.showDescription !== undefined) {
        params.set(
          "hflShowDescription",
          freeLogoSettings.showDescription ? "1" : "0",
        );
      }
      if (freeLogoSettings.showTags !== undefined) {
        params.set("hflShowTags", freeLogoSettings.showTags ? "1" : "0");
      }
      if (freeLogoSettings.logoFullWidth !== undefined) {
        params.set("hflLogoFull", freeLogoSettings.logoFullWidth ? "1" : "0");
      }
      if (freeLogoSettings.logoAspectRatio !== undefined) {
        params.set("hflRatio", String(freeLogoSettings.logoAspectRatio));
      }
      if (freeLogoSettings.logoCornerRadius !== undefined) {
        params.set("hflCorner", String(freeLogoSettings.logoCornerRadius));
      }
      if (freeLogoSettings.backgroundColorLight) {
        params.set("hflBgLight", freeLogoSettings.backgroundColorLight);
      }
      if (freeLogoSettings.backgroundColorDark) {
        params.set("hflBgDark", freeLogoSettings.backgroundColorDark);
      }
      if (freeLogoSettings.bannerLightPath) {
        params.set("hflBannerLight", freeLogoSettings.bannerLightPath);
      }
      if (freeLogoSettings.bannerDarkPath) {
        params.set("hflBannerDark", freeLogoSettings.bannerDarkPath);
      }
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
    <section
      className={cn(
        "rounded-xl border border-border/70 bg-background p-4 shadow-[0_20px_60px_-28px_rgba(16,24,40,0.24)] md:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-semibold tracking-tight">
            {t("studio.live_preview")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("studio.live_preview_desc")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {PREVIEW_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPresetId(item.id)}
              className={cn(
                "rounded-md border px-4 py-1.5 text-xs font-medium transition",
                presetId === item.id
                  ? "border-foreground bg-foreground text-background shadow-sm"
                  : "border-border bg-background/85 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-border/70 bg-[#fbfbfa] p-4 md:p-5">
        <div className="w-full overflow-auto">
          <div
            className="mx-auto overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_60px_-30px_rgba(16,24,40,0.3)]"
            style={frameStyle}
          >
            <iframe
              title={t("studio.preview_iframe_title")}
              src={iframeSrc}
              className="h-full w-full"
              loading="lazy"
              sandbox="allow-same-origin allow-scripts allow-forms"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
