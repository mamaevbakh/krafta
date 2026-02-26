"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Layers2,
  Palette,
  PanelsTopLeft,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import type {
  CatalogLayoutOverride,
  CatalogLayoutSettings,
  HeaderBasicFreeLogoSettings,
} from "@/lib/catalogs/settings/layout";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { CatalogPreviewFrame } from "@/components/dashboard/catalog-preview-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { hapticError, hapticSuccess } from "@/lib/haptics-client";
import { saveCatalogLayout } from "@/app/dashboard/[orgSlug]/[catalogSlug]/builder/actions";
import { getCatalogAssetUrl } from "@/lib/catalogs/media";
import { AspectRatio } from "@/components/ui/aspect-ratio";

type OptionConfig<T extends string> = {
  label: string;
  value: T;
};

type AspectPreset = {
  width: number;
  height: number;
};

type BuilderFocus = "all" | "structure" | "cards" | "brand" | "pricing";

const COMMON_ASPECT_RATIOS: AspectPreset[] = [
  { width: 1, height: 1 },
  { width: 4, height: 3 },
  { width: 3, height: 4 },
  { width: 16, height: 9 },
  { width: 9, height: 16 },
];

const LOGO_ASPECT_RATIOS: AspectPreset[] = [
  { width: 1, height: 1 },
  { width: 2, height: 1 },
  { width: 3, height: 1 },
  { width: 4, height: 1 },
  { width: 16, height: 9 },
];

const BUILDER_FOCUS_OPTIONS: Array<{
  value: BuilderFocus;
  label: string;
  description: string;
  icon: typeof PanelsTopLeft;
}> = [
  {
    value: "all",
    label: "All",
    description: "See every control",
    icon: Sparkles,
  },
  {
    value: "structure",
    label: "Structure",
    description: "Header, sections, nav",
    icon: PanelsTopLeft,
  },
  {
    value: "cards",
    label: "Cards",
    description: "Grid + item presentation",
    icon: Layers2,
  },
  {
    value: "brand",
    label: "Brand",
    description: "Header media and polish",
    icon: Palette,
  },
  {
    value: "pricing",
    label: "Pricing",
    description: "Currency formatting",
    icon: ReceiptText,
  },
];

function getAspectInputs(
  ratio: number,
  presets: AspectPreset[] = COMMON_ASPECT_RATIOS,
): AspectPreset {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  let bestMatch = presets[0];
  let bestDiff = Infinity;

  for (const preset of presets) {
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
  orgId: string;
  catalogSlug: string;
  catalogName: string;
  catalogLogoPath: string | null;
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
  orgId,
  catalogSlug,
  catalogName,
  catalogLogoPath,
  initialLayout,
  initialCurrency,
  headerOptions,
  sectionOptions,
  itemCardOptions,
  itemDetailOptions,
  navOptions,
}: BuilderPanelProps) {
  const initialAspectInputs = useMemo(
    () => getAspectInputs(initialLayout.itemCard.aspectRatio, COMMON_ASPECT_RATIOS),
    [initialLayout.itemCard.aspectRatio],
  );
  const initialHeaderLogoAspectInputs = useMemo(
    () =>
      getAspectInputs(
        initialLayout.header.basicFreeLogo.logoAspectRatio,
        LOGO_ASPECT_RATIOS,
      ),
    [initialLayout.header.basicFreeLogo.logoAspectRatio],
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
  const [showHeaderLogo, setShowHeaderLogo] = useState(
    initialLayout.header.basicFreeLogo.showLogo,
  );
  const [showHeaderTitle, setShowHeaderTitle] = useState(
    initialLayout.header.basicFreeLogo.showTitle,
  );
  const [showHeaderDescription, setShowHeaderDescription] = useState(
    initialLayout.header.basicFreeLogo.showDescription,
  );
  const [showHeaderTags, setShowHeaderTags] = useState(
    initialLayout.header.basicFreeLogo.showTags,
  );
  const [headerLogoFullWidth, setHeaderLogoFullWidth] = useState(
    initialLayout.header.basicFreeLogo.logoFullWidth,
  );
  const [headerLogoAspectWidth, setHeaderLogoAspectWidth] = useState(
    initialHeaderLogoAspectInputs.width,
  );
  const [headerLogoAspectHeight, setHeaderLogoAspectHeight] = useState(
    initialHeaderLogoAspectInputs.height,
  );
  const [headerLogoCornerRadius, setHeaderLogoCornerRadius] = useState(
    initialLayout.header.basicFreeLogo.logoCornerRadius,
  );
  const [headerBannerLightPath, setHeaderBannerLightPath] = useState(
    initialLayout.header.basicFreeLogo.bannerLightPath ?? "",
  );
  const [headerBannerDarkPath, setHeaderBannerDarkPath] = useState(
    initialLayout.header.basicFreeLogo.bannerDarkPath ?? "",
  );
  const [headerBackgroundColorLight, setHeaderBackgroundColorLight] = useState(
    initialLayout.header.basicFreeLogo.backgroundColorLight,
  );
  const [headerBackgroundColorDark, setHeaderBackgroundColorDark] = useState(
    initialLayout.header.basicFreeLogo.backgroundColorDark,
  );
  const [isUploadingHeaderBannerLight, setIsUploadingHeaderBannerLight] =
    useState(false);
  const [isUploadingHeaderBannerDark, setIsUploadingHeaderBannerDark] =
    useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [builderFocus, setBuilderFocus] = useState<BuilderFocus>("all");
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(null);
  const headerBannerLightInputRef = useRef<HTMLInputElement>(null);
  const headerBannerDarkInputRef = useRef<HTMLInputElement>(null);

  const catalogLogoFallbackUrl = useMemo(
    () => getCatalogAssetUrl(catalogLogoPath),
    [catalogLogoPath],
  );
  const headerBannerLightPreviewUrl = useMemo(
    () => getCatalogAssetUrl(headerBannerLightPath),
    [headerBannerLightPath],
  );
  const headerBannerDarkPreviewUrl = useMemo(
    () => getCatalogAssetUrl(headerBannerDarkPath),
    [headerBannerDarkPath],
  );

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
  const headerLogoAspectRatio = useMemo(() => {
    const safeWidth =
      Number.isFinite(headerLogoAspectWidth) && headerLogoAspectWidth > 0
        ? headerLogoAspectWidth
        : 1;
    const safeHeight =
      Number.isFinite(headerLogoAspectHeight) && headerLogoAspectHeight > 0
        ? headerLogoAspectHeight
        : 1;
    return safeWidth / safeHeight;
  }, [headerLogoAspectWidth, headerLogoAspectHeight]);

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
      header: {
        basicFreeLogo: {
          showLogo: showHeaderLogo,
          showTitle: showHeaderTitle,
          showDescription: showHeaderDescription,
          showTags: showHeaderTags,
          logoFullWidth: headerLogoFullWidth,
          logoAspectRatio: headerLogoAspectRatio,
          logoCornerRadius: headerLogoCornerRadius,
          bannerLightPath: headerBannerLightPath.trim() || null,
          bannerDarkPath: headerBannerDarkPath.trim() || null,
          backgroundColorLight: headerBackgroundColorLight.trim() || "transparent",
          backgroundColorDark: headerBackgroundColorDark.trim() || "transparent",
        },
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
      showHeaderLogo,
      showHeaderTitle,
      showHeaderDescription,
      showHeaderTags,
      headerLogoFullWidth,
      headerLogoAspectRatio,
      headerLogoCornerRadius,
      headerBannerLightPath,
      headerBannerDarkPath,
      headerBackgroundColorLight,
      headerBackgroundColorDark,
    ],
  ) satisfies CatalogLayoutOverride;
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
  const initialLayoutOverride = useMemo(
    () => ({
      headerVariant: initialLayout.headerVariant,
      sectionVariant: initialLayout.sectionVariant,
      itemCardVariant: initialLayout.itemCardVariant,
      categoryNavVariant: initialLayout.categoryNavVariant,
      itemDetailVariant: initialLayout.itemDetailVariant,
      itemCard: {
        columns: initialLayout.itemCard.columns,
        aspectRatio: initialLayout.itemCard.aspectRatio,
      },
      header: {
        basicFreeLogo: {
          showLogo: initialLayout.header.basicFreeLogo.showLogo,
          showTitle: initialLayout.header.basicFreeLogo.showTitle,
          showDescription: initialLayout.header.basicFreeLogo.showDescription,
          showTags: initialLayout.header.basicFreeLogo.showTags,
          logoFullWidth: initialLayout.header.basicFreeLogo.logoFullWidth,
          logoAspectRatio: initialLayout.header.basicFreeLogo.logoAspectRatio,
          logoCornerRadius: initialLayout.header.basicFreeLogo.logoCornerRadius,
          bannerLightPath: initialLayout.header.basicFreeLogo.bannerLightPath,
          bannerDarkPath: initialLayout.header.basicFreeLogo.bannerDarkPath,
          backgroundColorLight: initialLayout.header.basicFreeLogo.backgroundColorLight,
          backgroundColorDark: initialLayout.header.basicFreeLogo.backgroundColorDark,
        },
      },
    }),
    [initialLayout],
  ) satisfies CatalogLayoutOverride;
  const initialCurrencyOverride = useMemo(
    () => ({
      defaultCurrency: initialCurrency.defaultCurrency,
      label: initialCurrency.label,
      thousandSeparator: initialCurrency.thousandSeparator,
      decimalSeparator: initialCurrency.decimalSeparator,
      showDecimals: initialCurrency.showDecimals,
      labelPosition: initialCurrency.labelPosition,
    }),
    [initialCurrency],
  );
  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        layout: layoutOverrides,
        currency: currencyOverrides,
      }),
    [layoutOverrides, currencyOverrides],
  );
  const initialSignature = useMemo(
    () =>
      JSON.stringify({
        layout: initialLayoutOverride,
        currency: initialCurrencyOverride,
      }),
    [initialLayoutOverride, initialCurrencyOverride],
  );
  const baselineSignature = lastSavedSignature ?? initialSignature;
  const hasUnsavedChanges = currentSignature !== baselineSignature;
  const showStructureControls = builderFocus === "all" || builderFocus === "structure";
  const showCardControls = builderFocus === "all" || builderFocus === "cards";
  const showBrandControls = builderFocus === "all" || builderFocus === "brand";
  const showPricingControls = builderFocus === "all" || builderFocus === "pricing";
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
    params.set("hflShowLogo", showHeaderLogo ? "1" : "0");
    params.set("hflShowTitle", showHeaderTitle ? "1" : "0");
    params.set("hflShowDescription", showHeaderDescription ? "1" : "0");
    params.set("hflShowTags", showHeaderTags ? "1" : "0");
    params.set("hflLogoFull", headerLogoFullWidth ? "1" : "0");
    params.set("hflRatio", String(headerLogoAspectRatio));
    params.set("hflCorner", String(headerLogoCornerRadius));
    params.set("hflBgLight", headerBackgroundColorLight || "transparent");
    params.set("hflBgDark", headerBackgroundColorDark || "transparent");
    if (headerBannerLightPath.trim()) {
      params.set("hflBannerLight", headerBannerLightPath.trim());
    }
    if (headerBannerDarkPath.trim()) {
      params.set("hflBannerDark", headerBannerDarkPath.trim());
    }

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
    showHeaderLogo,
    showHeaderTitle,
    showHeaderDescription,
    showHeaderTags,
    headerLogoFullWidth,
    headerLogoAspectRatio,
    headerLogoCornerRadius,
    headerBackgroundColorLight,
    headerBackgroundColorDark,
    headerBannerLightPath,
    headerBannerDarkPath,
  ]);

  const handleSave = async () => {
    if (isSaving || !hasUnsavedChanges) return;
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
      header: {
        basicFreeLogo: {
          showLogo: showHeaderLogo,
          showTitle: showHeaderTitle,
          showDescription: showHeaderDescription,
          showTags: showHeaderTags,
          logoFullWidth: headerLogoFullWidth,
          logoAspectRatio: headerLogoAspectRatio,
          logoCornerRadius: headerLogoCornerRadius,
          bannerLightPath: headerBannerLightPath.trim() || null,
          bannerDarkPath: headerBannerDarkPath.trim() || null,
          backgroundColorLight: headerBackgroundColorLight.trim() || "transparent",
          backgroundColorDark: headerBackgroundColorDark.trim() || "transparent",
        } satisfies HeaderBasicFreeLogoSettings,
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
      void hapticError();
    } else {
      setLastSavedSignature(currentSignature);
      toast.success("Studio changes saved");
      void hapticSuccess();
    }

    setIsSaving(false);
  };

  const uploadHeaderBanner = async (
    variant: "light" | "dark",
    file: File,
  ) => {
    const setUploading =
      variant === "light"
        ? setIsUploadingHeaderBannerLight
        : setIsUploadingHeaderBannerDark;
    const setPath =
      variant === "light"
        ? setHeaderBannerLightPath
        : setHeaderBannerDarkPath;
    const currentPath =
      variant === "light" ? headerBannerLightPath : headerBannerDarkPath;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("catalogId", catalogId);
      formData.append("orgId", orgId);
      formData.append("variant", variant);
      formData.append("banner", file);
      if (currentPath.trim()) {
        formData.append("previousPath", currentPath.trim());
      }

      const response = await fetch("/api/catalogs/header-banner", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | { bannerPath?: string; error?: string }
        | null;

      if (!response.ok || !data?.bannerPath) {
        throw new Error(data?.error ?? "Failed to upload banner image.");
      }

      setPath(data.bannerPath);
      toast.success(
        `${variant === "light" ? "Light" : "Dark"} banner uploaded`,
      );
      void hapticSuccess();
    } catch (error) {
      toast.error("Banner upload failed", {
        description:
          error instanceof Error ? error.message : "Unknown upload error",
      });
      void hapticError();
    } finally {
      setUploading(false);
      const inputRef =
        variant === "light"
          ? headerBannerLightInputRef
          : headerBannerDarkInputRef;
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="mt-2 space-y-6">
      <section className="relative overflow-hidden rounded-2xl border bg-background">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(34,197,94,0.12),transparent_42%),radial-gradient(circle_at_88%_14%,rgba(59,130,246,0.1),transparent_40%),linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent)]" />
        <div className="relative p-5 md:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  Catalog Studio
                </Badge>
                <Badge
                  variant={hasUnsavedChanges ? "secondary" : "outline"}
                  className="rounded-full px-3 py-1"
                >
                  {hasUnsavedChanges ? "Unsaved changes" : "All changes saved"}
                </Badge>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight md:text-[32px]">
                  Shape the {catalogName} catalog experience
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                  Work in focused lanes instead of one long form. Start with structure,
                  polish card presentation, then tune brand and pricing details.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-muted-foreground">
                  Header: {headerOptions.find((option) => option.value === headerVariant)?.label}
                </span>
                <span className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-muted-foreground">
                  Cards: {itemCardOptions.find((option) => option.value === itemCardVariant)?.label}
                </span>
                <span className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-muted-foreground">
                  Nav: {navOptions.find((option) => option.value === categoryNavVariant)?.label}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
              >
                <Link
                  href={previewHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open preview
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
                size="sm"
              >
                {isSaving ? "Saving..." : hasUnsavedChanges ? "Save changes" : "Saved"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      <aside className="space-y-6 lg:sticky lg:top-6 lg:h-fit">
        <section className="rounded-xl border bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Customization flow</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Filter the controls so people design one decision area at a time.
              </p>
            </div>
            <Badge variant="outline" className="rounded-full">
              Focus mode
            </Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {BUILDER_FOCUS_OPTIONS.map((focus) => {
              const Icon = focus.icon;
              const isActive = builderFocus === focus.value;
              return (
                <button
                  key={focus.value}
                  type="button"
                  onClick={() => setBuilderFocus(focus.value)}
                  className={[
                    "rounded-lg border p-3 text-left transition",
                    isActive
                      ? "border-foreground bg-foreground text-background shadow-sm"
                      : "border-border bg-background hover:border-foreground/40",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-4" />
                    <span className="text-sm font-medium">{focus.label}</span>
                  </div>
                  <p
                    className={[
                      "mt-1 text-[11px]",
                      isActive ? "text-background/80" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {focus.description}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Suggested sequence
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Structure, Cards, Brand, then Pricing. Preview updates live while you
              work, then save once when the composition feels right.
            </p>
          </div>
        </section>

        {showBrandControls && (
          <>
            <section className="rounded-xl border border-dashed border-border/70 bg-muted/15 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Brand
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Define the catalog&apos;s first impression and visual identity.
              </p>
            </section>
            <OptionSection
              title="Headers"
              description="Top branding and catalog identity."
              options={headerOptions}
              selected={headerVariant}
              onSelect={setHeaderVariant}
            />
          </>
        )}

        {showBrandControls && headerVariant === "header-basic-free-logo" && (
          <section className="rounded-lg border bg-background p-4">
            <h2 className="text-sm font-semibold">Header: Free Logo Settings</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Tune visibility, logo framing, and themed media for this header.
            </p>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-3 rounded-md border border-border/70 p-3">
                <h3 className="text-xs font-medium text-foreground">Visibility</h3>
                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showHeaderLogo}
                    onChange={(event) => setShowHeaderLogo(event.target.checked)}
                    className="h-4 w-4 rounded border-border text-foreground"
                  />
                  Show logo
                </label>
                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showHeaderDescription}
                    onChange={(event) =>
                      setShowHeaderDescription(event.target.checked)
                    }
                    className="h-4 w-4 rounded border-border text-foreground"
                  />
                  Show description
                </label>
                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showHeaderTitle}
                    onChange={(event) => setShowHeaderTitle(event.target.checked)}
                    className="h-4 w-4 rounded border-border text-foreground"
                  />
                  Show title
                </label>
                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showHeaderTags}
                    onChange={(event) => setShowHeaderTags(event.target.checked)}
                    className="h-4 w-4 rounded border-border text-foreground"
                  />
                  Show tags
                </label>
              </div>

              <div
                className={[
                  "grid gap-3 rounded-md border border-border/70 p-3",
                  showHeaderLogo ? "" : "opacity-60",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium text-foreground">Logo frame</h3>
                  {!showHeaderLogo && (
                    <span className="text-[11px] text-muted-foreground">Logo hidden</span>
                  )}
                </div>
                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={headerLogoFullWidth}
                    onChange={(event) => setHeaderLogoFullWidth(event.target.checked)}
                    className="h-4 w-4 rounded border-border text-foreground"
                  />
                  Stretch logo edge-to-edge
                </label>
                <p className="text-[11px] text-muted-foreground">
                  This expands the logo across the full header width.
                </p>

                <div className="grid gap-2 text-xs text-muted-foreground">
                  <span>Aspect ratio</span>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={headerLogoAspectWidth}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        if (!Number.isFinite(nextValue)) return;
                        setHeaderLogoAspectWidth(Math.max(1, Math.round(nextValue)));
                      }}
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <span className="text-xs text-muted-foreground">/</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={headerLogoAspectHeight}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        if (!Number.isFinite(nextValue)) return;
                        setHeaderLogoAspectHeight(Math.max(1, Math.round(nextValue)));
                      }}
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    {LOGO_ASPECT_RATIOS.map((preset) => {
                      const presetLabel = `${preset.width}:${preset.height}`;
                      const isSelected =
                        headerLogoAspectWidth === preset.width &&
                        headerLogoAspectHeight === preset.height;
                      return (
                        <button
                          key={presetLabel}
                          type="button"
                          onClick={() => {
                            setHeaderLogoAspectWidth(preset.width);
                            setHeaderLogoAspectHeight(preset.height);
                          }}
                          className={[
                            "rounded-md border px-2 py-1 text-xs",
                            isSelected
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-foreground hover:border-foreground",
                          ].join(" ")}
                        >
                          {presetLabel}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Computed ratio: {headerLogoAspectRatio.toFixed(3)}
                  </span>
                </div>

                <label className="grid gap-2 text-xs text-muted-foreground">
                  Corner radius (px)
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={headerLogoCornerRadius}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      if (!Number.isFinite(nextValue)) return;
                      setHeaderLogoCornerRadius(Math.max(0, Math.round(nextValue)));
                    }}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>

                <div className="grid gap-2 text-xs text-muted-foreground">
                  <span>Fallback preview (original catalog logo)</span>
                  <div className="w-full max-w-[220px] overflow-hidden rounded-md border border-border/70 bg-muted/20">
                    <AspectRatio
                      ratio={Math.max(0.1, headerLogoAspectRatio)}
                      className="overflow-hidden"
                      style={{
                        borderRadius: `${Math.max(0, headerLogoCornerRadius)}px`,
                      }}
                    >
                      {catalogLogoFallbackUrl ? (
                        <Image
                          src={catalogLogoFallbackUrl}
                          alt={`${catalogName} original logo`}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-3 text-center text-[11px] text-muted-foreground">
                          No catalog logo in Settings yet
                        </div>
                      )}
                    </AspectRatio>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    This header uses the catalog logo from Settings as its base image.
                  </span>
                </div>
              </div>

              <div className="grid gap-3 rounded-md border border-border/70 p-3">
                <h3 className="text-xs font-medium text-foreground">Banner images</h3>
                <div className="grid gap-3 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      Light theme banner
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUploadingHeaderBannerLight}
                        onClick={() => headerBannerLightInputRef.current?.click()}
                      >
                        {isUploadingHeaderBannerLight ? "Uploading..." : "Upload"}
                      </Button>
                      {headerBannerLightPath.trim() ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setHeaderBannerLightPath("")}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <input
                    ref={headerBannerLightInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void uploadHeaderBanner("light", file);
                    }}
                  />
                  <label className="grid gap-2 text-xs text-muted-foreground">
                    Path or URL
                    <input
                      type="text"
                      value={headerBannerLightPath}
                      onChange={(event) => setHeaderBannerLightPath(event.target.value)}
                      placeholder="krafta/org/.../banner-light.png or https://..."
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <div className="relative h-20 overflow-hidden rounded-md border border-border/70 bg-muted/20">
                    {headerBannerLightPreviewUrl ? (
                      <Image
                        src={headerBannerLightPreviewUrl}
                        alt="Light banner preview"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                        No light banner selected
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 rounded-md border border-border/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">
                      Dark theme banner
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUploadingHeaderBannerDark}
                        onClick={() => headerBannerDarkInputRef.current?.click()}
                      >
                        {isUploadingHeaderBannerDark ? "Uploading..." : "Upload"}
                      </Button>
                      {headerBannerDarkPath.trim() ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setHeaderBannerDarkPath("")}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <input
                    ref={headerBannerDarkInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void uploadHeaderBanner("dark", file);
                    }}
                  />
                  <label className="grid gap-2 text-xs text-muted-foreground">
                    Path or URL
                    <input
                      type="text"
                      value={headerBannerDarkPath}
                      onChange={(event) => setHeaderBannerDarkPath(event.target.value)}
                      placeholder="krafta/org/.../banner-dark.png or https://..."
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <div className="relative h-20 overflow-hidden rounded-md border border-border/70 bg-muted/20">
                    {headerBannerDarkPreviewUrl ? (
                      <Image
                        src={headerBannerDarkPreviewUrl}
                        alt="Dark banner preview"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                        No dark banner selected
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Leave one side empty to reuse the other image in both themes.
                </p>
              </div>

              <div className="grid gap-3 rounded-md border border-border/70 p-3">
                <h3 className="text-xs font-medium text-foreground">Background colors</h3>
                <label className="grid gap-2 text-xs text-muted-foreground">
                  Light theme color
                  <input
                    type="text"
                    value={headerBackgroundColorLight}
                    onChange={(event) =>
                      setHeaderBackgroundColorLight(event.target.value)
                    }
                    placeholder="transparent, #ffffff, rgb(...)"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>

                <label className="grid gap-2 text-xs text-muted-foreground">
                  Dark theme color
                  <input
                    type="text"
                    value={headerBackgroundColorDark}
                    onChange={(event) =>
                      setHeaderBackgroundColorDark(event.target.value)
                    }
                    placeholder="transparent, #111827, rgb(...)"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
              </div>
            </div>
          </section>
        )}

        {showStructureControls && (
          <>
            <section className="rounded-xl border border-dashed border-border/70 bg-muted/15 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Structure
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Set how the catalog is organized before styling individual product cards.
              </p>
            </section>

            <OptionSection
          title="Sections"
          description="Category grouping and spacing."
          options={sectionOptions}
          selected={sectionVariant}
          onSelect={setSectionVariant}
        />
          </>
        )}

        {showCardControls && (
          <>
            <section className="rounded-xl border border-dashed border-border/70 bg-muted/15 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Cards
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tune the product browsing experience and image rhythm.
              </p>
            </section>

            <OptionSection
          title="Item Cards"
          description="How each item is rendered."
          options={itemCardOptions}
          selected={itemCardVariant}
          onSelect={setItemCardVariant}
        />
          </>
        )}

        {showCardControls && (
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
        )}

        {showStructureControls && (
          <OptionSection
          title="Item Detail"
          description="Full item view when a card is opened."
          options={itemDetailOptions}
          selected={itemDetailVariant}
          onSelect={setItemDetailVariant}
        />
        )}

        {showPricingControls && (
          <>
            <section className="rounded-xl border border-dashed border-border/70 bg-muted/15 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Pricing
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Control how price values read in every catalog layout.
              </p>
            </section>
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
          </>
        )}

        {showStructureControls && (
          <OptionSection
          title="Navigation"
          description="Category navigation style."
          options={navOptions}
          selected={categoryNavVariant}
          onSelect={setCategoryNavVariant}
        />
        )}
      </aside>

      <section className="rounded-2xl border bg-background p-4 md:p-6 lg:sticky lg:top-6 lg:h-fit">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Live preview</h2>
              <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wide">
                Draft canvas
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Instant snapshot of your Studio changes before publishing.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {hasUnsavedChanges
              ? "Preview includes unsaved edits"
              : "Preview matches saved settings"}
          </p>
        </div>

        <div className="mt-5 rounded-xl border border-dashed border-border/70 bg-muted/15 p-1.5 md:p-2">
          <CatalogPreviewFrame
            catalogSlug={catalogSlug}
            layoutOverrides={layoutOverrides}
            currencyOverrides={currencyOverrides}
          />
        </div>
      </section>
      </div>
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
    <section className="rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {description}
          </p>
        </div>
        <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wide">
          {options.length} options
        </Badge>
      </div>
      <div className="mt-4 grid gap-2">
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={[
                "group flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition",
                isSelected
                  ? "border-foreground bg-foreground text-background shadow-sm"
                  : "border-border bg-background hover:border-foreground/50 hover:bg-muted/30",
              ].join(" ")}
            >
              <span className="font-medium">{option.label}</span>
              {isSelected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-background/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  <Check className="size-3" />
                  Active
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground transition group-hover:text-foreground">
                  Switch
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
