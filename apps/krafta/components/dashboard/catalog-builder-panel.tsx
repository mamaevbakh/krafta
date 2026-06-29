"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Layers2,
  Palette,
  PanelsTopLeft,
  ReceiptText,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import type {
  CatalogLayoutOverride,
  CatalogLayoutSettings,
  HeaderBasicFreeLogoSettings,
} from "@/lib/catalogs/settings/layout";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import type { CatalogBehaviorSettings } from "@/lib/catalogs/settings/behavior";
import { CatalogPreviewFrame } from "@/components/dashboard/catalog-preview-frame";
import { StudioCodegenPanel } from "@/components/dashboard/studio-codegen-panel";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { toast } from "sonner";
import { hapticError, hapticSuccess } from "@/lib/haptics-client";
import { saveCatalogLayout } from "@/app/dashboard/[orgSlug]/[catalogSlug]/builder/actions";
import { getCatalogAssetUrl } from "@/lib/catalogs/media";
import { cn } from "@/lib/utils";

type OptionConfig<T extends string> = {
  label: string;
  value: T;
};

type AspectPreset = {
  width: number;
  height: number;
};

type BuilderFocus =
  | "structure"
  | "cards"
  | "brand"
  | "pricing"
  | "cart"
  | "assistant";

type BrandTokenKey =
  | "pageBackground"
  | "cardSurface"
  | "mutedSurface"
  | "primaryText"
  | "secondaryText"
  | "border";

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
    value: "structure",
    label: "Structure",
    description: "Header, sections, and navigation",
    icon: PanelsTopLeft,
  },
  {
    value: "cards",
    label: "Cards",
    description: "Grid rhythm and item presentation",
    icon: Layers2,
  },
  {
    value: "brand",
    label: "Brand",
    description: "Visual tokens and header polish",
    icon: Palette,
  },
  {
    value: "pricing",
    label: "Pricing",
    description: "Currency formatting and readability",
    icon: ReceiptText,
  },
  {
    value: "cart",
    label: "Cart",
    description: "Cart and checkout entry points",
    icon: ShoppingBag,
  },
  {
    value: "assistant",
    label: "Krafta Studio",
    description: "Build your shop with AI",
    icon: Sparkles,
  },
];

const COMPACT_HEADER_LABELS: Record<string, string> = {
  "header-basic": "Basic",
  "header-basic-free-logo": "Free Logo",
  "header-center": "Center",
  "header-hero": "Hero",
};

const NAV_DESCRIPTIONS: Record<string, string> = {
  "nav-tabs": "Classic category pills",
  "nav-tabs-motion": "Animated active pill",
  "nav-tabs-dashboard": "Underline treatment, closer to Studio",
  "nav-none": "No category bar",
};

const ITEM_DETAIL_LABELS: Record<string, string> = {
  "item-fullscreen": "Fullscreen",
};

const BRAND_TOKEN_DEFAULTS: Record<BrandTokenKey, string> = {
  pageBackground: "#ffffff",
  cardSurface: "#ffffff",
  mutedSurface: "#f4f4f5",
  primaryText: "#18181b",
  secondaryText: "#71717a",
  border: "#e4e4e7",
};

const BRAND_TOKEN_CONFIG: Array<{
  key: BrandTokenKey;
  label: string;
  description: string;
  mapsTo: string;
}> = [
  {
    key: "pageBackground",
    label: "Page background",
    description: "Base catalog canvas color.",
    mapsTo: "Maps to `background`",
  },
  {
    key: "cardSurface",
    label: "Card surface",
    description: "Primary product card body.",
    mapsTo: "Maps to `card`",
  },
  {
    key: "mutedSurface",
    label: "Muted surface",
    description: "Used for quiet surfaces and image placeholders.",
    mapsTo: "Maps to `muted`",
  },
  {
    key: "primaryText",
    label: "Primary text",
    description: "Main reading color for titles and prices.",
    mapsTo: "Maps to `foreground` / `card-foreground`",
  },
  {
    key: "secondaryText",
    label: "Secondary text",
    description: "Used for helper copy and metadata.",
    mapsTo: "Maps to `muted-foreground`",
  },
  {
    key: "border",
    label: "Border",
    description: "Default stroke around cards and controls.",
    mapsTo: "Maps to `border`",
  },
];

const CARD_SURFACE_MAP: Record<string, string[]> = {
  "card-big-photo": ["bg-card", "text-card-foreground", "bg-muted image slot", "border"],
  "card-default": ["bg-card", "text-card-foreground", "border", "muted metadata"],
  "card-photo-row": ["bg-card", "text-card-foreground", "wide image rail", "border"],
  "card-minimal": ["bg-card", "text-card-foreground", "subtle border", "quiet metadata"],
  "card-glass-blur": ["bg-card/80", "text-card-foreground", "backdrop blur", "glow edge"],
  "card-row-compact": ["bg-card", "text-card-foreground", "48px row", "tabular-num price"],
};

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

function formatSamplePrice(amount: number, settings: CurrencySettings): string {
  const precision = settings.showDecimals ? 2 : 0;
  const fixed = Math.abs(amount).toFixed(precision);
  const [integerPart, decimalPart] = fixed.split(".");
  const groupedInteger = integerPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    settings.thousandSeparator,
  );

  const numberText = decimalPart
    ? `${groupedInteger}${settings.decimalSeparator}${decimalPart}`
    : groupedInteger;
  const signedText = amount < 0 ? `-${numberText}` : numberText;

  return settings.labelPosition === "prefix"
    ? `${settings.label}${signedText}`
    : `${signedText} ${settings.label}`.trim();
}

type BuilderPanelProps = {
  catalogId: string;
  orgId: string;
  catalogSlug: string;
  catalogName: string;
  catalogLogoPath: string | null;
  initialLayout: CatalogLayoutSettings;
  initialCurrency: CurrencySettings;
  initialBehavior: CatalogBehaviorSettings;
  headerOptions: OptionConfig<CatalogLayoutSettings["headerVariant"]>[];
  sectionOptions: OptionConfig<CatalogLayoutSettings["sectionVariant"]>[];
  itemCardOptions: OptionConfig<CatalogLayoutSettings["itemCardVariant"]>[];
  itemDetailOptions: OptionConfig<CatalogLayoutSettings["itemDetailVariant"]>[];
  navOptions: OptionConfig<CatalogLayoutSettings["categoryNavVariant"]>[];
  /** Tab to open on mount (e.g. "assistant" via ?tab=assistant after creating a
   *  coded shop). Defaults to "structure". */
  initialFocus?: BuilderFocus;
  /** The coded shop's publishable commerce key (Studio-created shops only), so the
   *  codegen agent can wire the sandbox shop to this catalog's data. */
  studioPublishableKey?: string | null;
};

export function CatalogBuilderPanel({
  catalogId,
  orgId,
  catalogSlug,
  catalogName,
  catalogLogoPath,
  initialLayout,
  initialCurrency,
  initialBehavior,
  headerOptions,
  sectionOptions,
  itemCardOptions,
  itemDetailOptions,
  navOptions,
  initialFocus,
  studioPublishableKey,
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

  const [headerVariant, setHeaderVariant] = useState(initialLayout.headerVariant);
  const [sectionVariant, setSectionVariant] = useState(initialLayout.sectionVariant);
  const [itemCardVariant, setItemCardVariant] = useState(initialLayout.itemCardVariant);
  const [categoryNavVariant, setCategoryNavVariant] = useState(
    initialLayout.categoryNavVariant,
  );
  const [itemDetailVariant, setItemDetailVariant] = useState(
    initialLayout.itemDetailVariant,
  );
  const [itemCardColumns, setItemCardColumns] = useState(initialLayout.itemCard.columns);
  const [aspectWidth, setAspectWidth] = useState(initialAspectInputs.width);
  const [aspectHeight, setAspectHeight] = useState(initialAspectInputs.height);
  const [currencyCode, setCurrencyCode] = useState(initialCurrency.defaultCurrency);
  const [currencyLabel, setCurrencyLabel] = useState(initialCurrency.label);
  const [thousandSeparator, setThousandSeparator] = useState(
    initialCurrency.thousandSeparator,
  );
  const [decimalSeparator, setDecimalSeparator] = useState(
    initialCurrency.decimalSeparator,
  );
  const [showDecimals, setShowDecimals] = useState(initialCurrency.showDecimals);
  const [labelPosition, setLabelPosition] = useState(initialCurrency.labelPosition);
  const [cartEnabled, setCartEnabled] = useState(initialBehavior.enableCart);
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
  const [brandTokens, setBrandTokens] = useState(BRAND_TOKEN_DEFAULTS);
  const [isUploadingHeaderBannerLight, setIsUploadingHeaderBannerLight] =
    useState(false);
  const [isUploadingHeaderBannerDark, setIsUploadingHeaderBannerDark] =
    useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // The Krafta Studio (codegen) tab is only meaningful for coded shops, which
  // carry a publishable commerce key. Regular catalogs have none, so the agent
  // would build against an empty NEXT_PUBLIC_KRAFTA_PUBLISHABLE_KEY.
  const isCodedShop = Boolean(studioPublishableKey);
  const [builderFocus, setBuilderFocus] = useState<BuilderFocus>(() => {
    const requested = initialFocus ?? "structure";
    // Guard the ?tab=assistant deep link landing on a non-coded catalog.
    return requested === "assistant" && !isCodedShop ? "structure" : requested;
  });
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
    const safeWidth = Number.isFinite(aspectWidth) && aspectWidth > 0 ? aspectWidth : 1;
    const safeHeight =
      Number.isFinite(aspectHeight) && aspectHeight > 0 ? aspectHeight : 1;
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
    () =>
      ({
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
      }) satisfies CatalogLayoutOverride,
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

  const initialLayoutOverride = useMemo(
    () =>
      ({
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
            backgroundColorLight:
              initialLayout.header.basicFreeLogo.backgroundColorLight,
            backgroundColorDark: initialLayout.header.basicFreeLogo.backgroundColorDark,
          },
        },
      }) satisfies CatalogLayoutOverride,
    [initialLayout],
  );

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

  // Carry enableAssistant through unchanged — the builder has no assistant
  // toggle (it lives in Settings → Catalog), so the builder must PRESERVE it on
  // save rather than overwrite settings_behavior to a cart-only object.
  const behaviorOverrides = useMemo<CatalogBehaviorSettings>(
    () => ({
      enableCart: cartEnabled,
      enableAssistant: initialBehavior.enableAssistant,
    }),
    [cartEnabled, initialBehavior.enableAssistant],
  );
  const initialBehaviorOverride = useMemo<CatalogBehaviorSettings>(
    () => ({
      enableCart: initialBehavior.enableCart,
      enableAssistant: initialBehavior.enableAssistant,
    }),
    [initialBehavior.enableCart, initialBehavior.enableAssistant],
  );

  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        layout: layoutOverrides,
        currency: currencyOverrides,
        behavior: behaviorOverrides,
      }),
    [layoutOverrides, currencyOverrides, behaviorOverrides],
  );
  const initialSignature = useMemo(
    () =>
      JSON.stringify({
        layout: initialLayoutOverride,
        currency: initialCurrencyOverride,
        behavior: initialBehaviorOverride,
      }),
    [initialLayoutOverride, initialCurrencyOverride, initialBehaviorOverride],
  );

  const baselineSignature = lastSavedSignature ?? initialSignature;
  const hasUnsavedChanges = currentSignature !== baselineSignature;
  const pricingSample = useMemo(
    () => formatSamplePrice(19900, currencyOverrides),
    [currencyOverrides],
  );
  const pricingSaleSample = useMemo(
    () => formatSamplePrice(12500, currencyOverrides),
    [currencyOverrides],
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

    const settingsBehavior: CatalogBehaviorSettings = {
      ...initialBehavior,
      enableCart: cartEnabled,
    };

    const result = await saveCatalogLayout({
      catalogId,
      catalogSlug,
      settingsLayout,
      settingsCurrency,
      settingsBehavior,
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

  const uploadHeaderBanner = async (variant: "light" | "dark", file: File) => {
    const setUploading =
      variant === "light"
        ? setIsUploadingHeaderBannerLight
        : setIsUploadingHeaderBannerDark;
    const setPath =
      variant === "light" ? setHeaderBannerLightPath : setHeaderBannerDarkPath;
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
      toast.success(`${variant === "light" ? "Light" : "Dark"} banner uploaded`);
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
        variant === "light" ? headerBannerLightInputRef : headerBannerDarkInputRef;
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <main className="w-full">
      <div className="w-full border-b">
        <div className="mx-auto flex h-30 max-w-312 items-center justify-between px-6">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">Studio</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href={previewHref} target="_blank" rel="noreferrer">
                Open preview
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
            >
              {isSaving ? "Saving..." : hasUnsavedChanges ? "Save changes" : "Saved"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-312 px-6 py-8">
      {builderFocus === "assistant" && isCodedShop ? (
        <div className="space-y-4">
          <StudioSectionSwitcher
            builderFocus={builderFocus}
            onChange={setBuilderFocus}
            showAssistant={isCodedShop}
          />
          <StudioCodegenPanel
            shopName={catalogName}
            catalogId={catalogId}
            publishableKey={studioPublishableKey}
          />
        </div>
      ) : (
      <div className="grid gap-6 xl:grid-cols-[384px_minmax(0,1fr)] xl:items-start">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
          <StudioSectionSwitcher
            builderFocus={builderFocus}
            onChange={setBuilderFocus}
            showAssistant={isCodedShop}
          />

          {builderFocus === "structure" ? (
            <StructureInspector
              headerOptions={headerOptions}
              headerVariant={headerVariant}
              onHeaderVariantChange={setHeaderVariant}
              sectionOptions={sectionOptions}
              sectionVariant={sectionVariant}
              onSectionVariantChange={setSectionVariant}
              navOptions={navOptions}
              categoryNavVariant={categoryNavVariant}
              onCategoryNavVariantChange={setCategoryNavVariant}
            />
          ) : null}

          {builderFocus === "cards" ? (
            <CardsInspector
              itemCardOptions={itemCardOptions}
              itemCardVariant={itemCardVariant}
              onItemCardVariantChange={setItemCardVariant}
              itemCardColumns={itemCardColumns}
              onItemCardColumnsChange={setItemCardColumns}
              aspectWidth={aspectWidth}
              onAspectWidthChange={setAspectWidth}
              aspectHeight={aspectHeight}
              onAspectHeightChange={setAspectHeight}
              itemDetailOptions={itemDetailOptions}
              itemDetailVariant={itemDetailVariant}
              onItemDetailVariantChange={setItemDetailVariant}
              pricingSample={pricingSample}
            />
          ) : null}

          {builderFocus === "brand" ? (
            <BrandInspector
              brandTokens={brandTokens}
              onBrandTokenChange={(key, value) =>
                setBrandTokens((current) => ({
                  ...current,
                  [key]: value,
                }))
              }
              headerBackgroundColorLight={headerBackgroundColorLight}
              onHeaderBackgroundColorLightChange={setHeaderBackgroundColorLight}
              headerBackgroundColorDark={headerBackgroundColorDark}
              onHeaderBackgroundColorDarkChange={setHeaderBackgroundColorDark}
              headerLogoCornerRadius={headerLogoCornerRadius}
              onHeaderLogoCornerRadiusChange={setHeaderLogoCornerRadius}
              headerLogoAspectWidth={headerLogoAspectWidth}
              onHeaderLogoAspectWidthChange={setHeaderLogoAspectWidth}
              headerLogoAspectHeight={headerLogoAspectHeight}
              onHeaderLogoAspectHeightChange={setHeaderLogoAspectHeight}
              headerBannerLightPath={headerBannerLightPath}
              onHeaderBannerLightPathChange={setHeaderBannerLightPath}
              headerBannerDarkPath={headerBannerDarkPath}
              onHeaderBannerDarkPathChange={setHeaderBannerDarkPath}
              headerBannerLightPreviewUrl={headerBannerLightPreviewUrl}
              headerBannerDarkPreviewUrl={headerBannerDarkPreviewUrl}
              isUploadingHeaderBannerLight={isUploadingHeaderBannerLight}
              isUploadingHeaderBannerDark={isUploadingHeaderBannerDark}
              onUploadBanner={uploadHeaderBanner}
              headerBannerLightInputRef={headerBannerLightInputRef}
              headerBannerDarkInputRef={headerBannerDarkInputRef}
              showHeaderLogo={showHeaderLogo}
              onShowHeaderLogoChange={setShowHeaderLogo}
              showHeaderTitle={showHeaderTitle}
              onShowHeaderTitleChange={setShowHeaderTitle}
              showHeaderDescription={showHeaderDescription}
              onShowHeaderDescriptionChange={setShowHeaderDescription}
              showHeaderTags={showHeaderTags}
              onShowHeaderTagsChange={setShowHeaderTags}
              headerLogoFullWidth={headerLogoFullWidth}
              onHeaderLogoFullWidthChange={setHeaderLogoFullWidth}
              headerLogoAspectRatio={headerLogoAspectRatio}
              catalogLogoFallbackUrl={catalogLogoFallbackUrl}
              catalogName={catalogName}
            />
          ) : null}

          {builderFocus === "pricing" ? (
            <PricingInspector
              currencyCode={currencyCode}
              onCurrencyCodeChange={setCurrencyCode}
              currencyLabel={currencyLabel}
              onCurrencyLabelChange={setCurrencyLabel}
              labelPosition={labelPosition}
              onLabelPositionChange={setLabelPosition}
              showDecimals={showDecimals}
              onShowDecimalsChange={setShowDecimals}
              thousandSeparator={thousandSeparator}
              onThousandSeparatorChange={setThousandSeparator}
              decimalSeparator={decimalSeparator}
              onDecimalSeparatorChange={setDecimalSeparator}
              pricingSample={pricingSample}
              pricingSaleSample={pricingSaleSample}
            />
          ) : null}

          {builderFocus === "cart" ? (
            <CartInspector
              cartEnabled={cartEnabled}
              onCartEnabledChange={setCartEnabled}
            />
          ) : null}
        </aside>

        <CatalogPreviewFrame
          catalogSlug={catalogSlug}
          layoutOverrides={layoutOverrides}
          currencyOverrides={currencyOverrides}
        />
      </div>
      )}
      </div>
    </main>
  );
}

function StudioSectionSwitcher({
  builderFocus,
  onChange,
  showAssistant,
}: {
  builderFocus: BuilderFocus;
  onChange: (value: BuilderFocus) => void;
  /** Coded shops only — gate the "Krafta Studio" (codegen) tab. */
  showAssistant: boolean;
}) {
  const focusOptions = showAssistant
    ? BUILDER_FOCUS_OPTIONS
    : BUILDER_FOCUS_OPTIONS.filter((focus) => focus.value !== "assistant");
  return (
    <StudioCard className="p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Studio sections</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Move across structure, cards, brand, and pricing without growing the
          page into one long form.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {focusOptions.map((focus) => {
          const Icon = focus.icon;
          const isActive = builderFocus === focus.value;
          return (
            <button
              key={focus.value}
              type="button"
              onClick={() => onChange(focus.value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition",
                isActive
                  ? "border-foreground bg-foreground text-background shadow-sm"
                  : "border-border bg-background hover:border-foreground/40 hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span>{focus.label}</span>
              {focus.value === "assistant" ? (
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
                    isActive
                      ? "border-background/40 text-background/80"
                      : "border-border text-muted-foreground",
                  )}
                >
                  Beta
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </StudioCard>
  );
}

function StructureInspector({
  headerOptions,
  headerVariant,
  onHeaderVariantChange,
  sectionOptions,
  sectionVariant,
  onSectionVariantChange,
  navOptions,
  categoryNavVariant,
  onCategoryNavVariantChange,
}: {
  headerOptions: OptionConfig<CatalogLayoutSettings["headerVariant"]>[];
  headerVariant: CatalogLayoutSettings["headerVariant"];
  onHeaderVariantChange: (value: CatalogLayoutSettings["headerVariant"]) => void;
  sectionOptions: OptionConfig<CatalogLayoutSettings["sectionVariant"]>[];
  sectionVariant: CatalogLayoutSettings["sectionVariant"];
  onSectionVariantChange: (
    value: CatalogLayoutSettings["sectionVariant"],
  ) => void;
  navOptions: OptionConfig<CatalogLayoutSettings["categoryNavVariant"]>[];
  categoryNavVariant: CatalogLayoutSettings["categoryNavVariant"];
  onCategoryNavVariantChange: (
    value: CatalogLayoutSettings["categoryNavVariant"],
  ) => void;
}) {
  return (
    <StudioCard>
      <InspectorIntro
        title="Structure"
        description="Control how the catalog is arranged before people start reading items."
      />

      <SegmentedField
        label="Header"
        options={headerOptions.map((option) => ({
          ...option,
          label: COMPACT_HEADER_LABELS[option.value] ?? option.label,
        }))}
        selected={headerVariant}
        onSelect={onHeaderVariantChange}
      />

      <SegmentedField
        label="Section style"
        options={sectionOptions}
        selected={sectionVariant}
        onSelect={onSectionVariantChange}
      />

      <div className="space-y-3">
        <FieldLabel
          label="Navigation"
          hint="Choose how categories appear at the top of the public catalog."
        />
        <div className="space-y-2">
          {navOptions.map((option) => {
            const isActive = option.value === categoryNavVariant;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onCategoryNavVariantChange(option.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition",
                  isActive
                    ? "border-foreground bg-foreground text-background shadow-sm"
                    : "border-border bg-background hover:border-foreground/30",
                )}
              >
                <div>
                  <div className="text-sm font-medium">{option.label}</div>
                  <div
                    className={cn(
                      "mt-1 text-xs",
                      isActive ? "text-background/75" : "text-muted-foreground",
                    )}
                  >
                    {NAV_DESCRIPTIONS[option.value] ?? "Switch navigation behavior"}
                  </div>
                </div>
                <div className="text-xs uppercase tracking-[0.18em]">
                  {isActive ? "Active" : "Switch"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </StudioCard>
  );
}

function CardsInspector({
  itemCardOptions,
  itemCardVariant,
  onItemCardVariantChange,
  itemCardColumns,
  onItemCardColumnsChange,
  aspectWidth,
  onAspectWidthChange,
  aspectHeight,
  onAspectHeightChange,
  itemDetailOptions,
  itemDetailVariant,
  onItemDetailVariantChange,
  pricingSample,
}: {
  itemCardOptions: OptionConfig<CatalogLayoutSettings["itemCardVariant"]>[];
  itemCardVariant: CatalogLayoutSettings["itemCardVariant"];
  onItemCardVariantChange: (
    value: CatalogLayoutSettings["itemCardVariant"],
  ) => void;
  itemCardColumns: number;
  onItemCardColumnsChange: (value: number) => void;
  aspectWidth: number;
  onAspectWidthChange: (value: number) => void;
  aspectHeight: number;
  onAspectHeightChange: (value: number) => void;
  itemDetailOptions: OptionConfig<CatalogLayoutSettings["itemDetailVariant"]>[];
  itemDetailVariant: CatalogLayoutSettings["itemDetailVariant"];
  onItemDetailVariantChange: (
    value: CatalogLayoutSettings["itemDetailVariant"],
  ) => void;
  pricingSample: string;
}) {
  const surfaceTags = CARD_SURFACE_MAP[itemCardVariant] ?? [];

  return (
    <StudioCard>
      <InspectorIntro
        title="Cards"
        description="Tune layout and item presentation without opening several separate blocks."
      />

      <SegmentedField
        label="Card family"
        options={itemCardOptions}
        selected={itemCardVariant}
        onSelect={onItemCardVariantChange}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <StudioInputField
          label="Columns"
          value={String(itemCardColumns)}
          onChange={(value) => {
            const nextValue = Number(value);
            if (!Number.isFinite(nextValue)) return;
            onItemCardColumnsChange(Math.min(4, Math.max(1, Math.round(nextValue))));
          }}
          inputMode="numeric"
        />
        <StudioInputField
          label="Aspect ratio"
          value={`${aspectWidth} : ${aspectHeight}`}
          readOnly
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <StudioInputField
          label="Aspect width"
          value={String(aspectWidth)}
          onChange={(value) => {
            const nextValue = Number(value);
            if (!Number.isFinite(nextValue)) return;
            onAspectWidthChange(Math.max(0.1, nextValue));
          }}
          inputMode="decimal"
        />
        <div className="hidden pb-3 text-center text-muted-foreground sm:block">/</div>
        <StudioInputField
          label="Aspect height"
          value={String(aspectHeight)}
          onChange={(value) => {
            const nextValue = Number(value);
            if (!Number.isFinite(nextValue)) return;
            onAspectHeightChange(Math.max(0.1, nextValue));
          }}
          inputMode="decimal"
        />
      </div>

      <SegmentedField
        label="Item detail"
        options={itemDetailOptions.map((option) => ({
          ...option,
          label: ITEM_DETAIL_LABELS[option.value] ?? option.label,
        }))}
        selected={itemDetailVariant}
        onSelect={onItemDetailVariantChange}
      />

      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <FieldLabel label="Card preview" />
        <div className="mt-3 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-xl border border-border bg-background p-3 shadow-sm">
            <div className="h-28 rounded-md bg-[linear-gradient(180deg,#e89b59_0%,#c25b33_100%)]" />
            <div className="mt-3 space-y-1">
              <div className="text-sm font-medium">Медовик</div>
              <div className="text-xs text-muted-foreground">
                {itemCardOptions.find((option) => option.value === itemCardVariant)?.label}
              </div>
              <div className="pt-1 text-lg font-semibold">{pricingSample}</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-sm font-medium">Current card surfaces map to:</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {surfaceTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-muted/20 px-3 py-1 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </StudioCard>
  );
}

function BrandInspector({
  brandTokens,
  onBrandTokenChange,
  headerBackgroundColorLight,
  onHeaderBackgroundColorLightChange,
  headerBackgroundColorDark,
  onHeaderBackgroundColorDarkChange,
  headerLogoCornerRadius,
  onHeaderLogoCornerRadiusChange,
  headerLogoAspectWidth,
  onHeaderLogoAspectWidthChange,
  headerLogoAspectHeight,
  onHeaderLogoAspectHeightChange,
  headerBannerLightPath,
  onHeaderBannerLightPathChange,
  headerBannerDarkPath,
  onHeaderBannerDarkPathChange,
  headerBannerLightPreviewUrl,
  headerBannerDarkPreviewUrl,
  isUploadingHeaderBannerLight,
  isUploadingHeaderBannerDark,
  onUploadBanner,
  headerBannerLightInputRef,
  headerBannerDarkInputRef,
  showHeaderLogo,
  onShowHeaderLogoChange,
  showHeaderTitle,
  onShowHeaderTitleChange,
  showHeaderDescription,
  onShowHeaderDescriptionChange,
  showHeaderTags,
  onShowHeaderTagsChange,
  headerLogoFullWidth,
  onHeaderLogoFullWidthChange,
  headerLogoAspectRatio,
  catalogLogoFallbackUrl,
  catalogName,
}: {
  brandTokens: Record<BrandTokenKey, string>;
  onBrandTokenChange: (key: BrandTokenKey, value: string) => void;
  headerBackgroundColorLight: string;
  onHeaderBackgroundColorLightChange: (value: string) => void;
  headerBackgroundColorDark: string;
  onHeaderBackgroundColorDarkChange: (value: string) => void;
  headerLogoCornerRadius: number;
  onHeaderLogoCornerRadiusChange: (value: number) => void;
  headerLogoAspectWidth: number;
  onHeaderLogoAspectWidthChange: (value: number) => void;
  headerLogoAspectHeight: number;
  onHeaderLogoAspectHeightChange: (value: number) => void;
  headerBannerLightPath: string;
  onHeaderBannerLightPathChange: (value: string) => void;
  headerBannerDarkPath: string;
  onHeaderBannerDarkPathChange: (value: string) => void;
  headerBannerLightPreviewUrl: string | null;
  headerBannerDarkPreviewUrl: string | null;
  isUploadingHeaderBannerLight: boolean;
  isUploadingHeaderBannerDark: boolean;
  onUploadBanner: (variant: "light" | "dark", file: File) => Promise<void>;
  headerBannerLightInputRef: React.RefObject<HTMLInputElement | null>;
  headerBannerDarkInputRef: React.RefObject<HTMLInputElement | null>;
  showHeaderLogo: boolean;
  onShowHeaderLogoChange: (value: boolean) => void;
  showHeaderTitle: boolean;
  onShowHeaderTitleChange: (value: boolean) => void;
  showHeaderDescription: boolean;
  onShowHeaderDescriptionChange: (value: boolean) => void;
  showHeaderTags: boolean;
  onShowHeaderTagsChange: (value: boolean) => void;
  headerLogoFullWidth: boolean;
  onHeaderLogoFullWidthChange: (value: boolean) => void;
  headerLogoAspectRatio: number;
  catalogLogoFallbackUrl: string | null;
  catalogName: string;
}) {
  return (
    <StudioCard>
      <InspectorIntro
        title="Brand"
        description="Token-based styling for the public catalog. These controls mirror the redesign now and backend persistence can follow later."
      />

      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <FieldLabel
          label="Core tokens"
          hint="Frontend-only for now. These values help us stage the redesigned Brand panel before backend settings land."
        />
        <div className="mt-3 space-y-3">
          {BRAND_TOKEN_CONFIG.map((token) => (
            <div
              key={token.key}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-start gap-3">
                <input
                  type="color"
                  value={brandTokens[token.key]}
                  onChange={(event) =>
                    onBrandTokenChange(token.key, event.target.value)
                  }
                  className="mt-1 h-9 w-9 rounded-full border border-border bg-background"
                  aria-label={token.label}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{token.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {token.mapsTo}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {brandTokens[token.key]}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {token.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <FieldLabel label="Header tokens" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SwatchTextField
            label="Header light background"
            value={headerBackgroundColorLight}
            onChange={onHeaderBackgroundColorLightChange}
            placeholder="transparent / custom"
          />
          <SwatchTextField
            label="Header dark background"
            value={headerBackgroundColorDark}
            onChange={onHeaderBackgroundColorDarkChange}
            placeholder="transparent / custom"
          />
          <StudioInputField
            label="Logo radius"
            value={`${headerLogoCornerRadius}`}
            onChange={(value) => {
              const nextValue = Number(value);
              if (!Number.isFinite(nextValue)) return;
              onHeaderLogoCornerRadiusChange(Math.max(0, Math.round(nextValue)));
            }}
            inputMode="numeric"
          />
          <StudioInputField
            label="Logo ratio"
            value={`${headerLogoAspectWidth} : ${headerLogoAspectHeight}`}
            readOnly
          />
          <StudioInputField
            label="Logo width"
            value={String(headerLogoAspectWidth)}
            onChange={(value) => {
              const nextValue = Number(value);
              if (!Number.isFinite(nextValue)) return;
              onHeaderLogoAspectWidthChange(Math.max(1, Math.round(nextValue)));
            }}
            inputMode="numeric"
          />
          <StudioInputField
            label="Logo height"
            value={String(headerLogoAspectHeight)}
            onChange={(value) => {
              const nextValue = Number(value);
              if (!Number.isFinite(nextValue)) return;
              onHeaderLogoAspectHeightChange(Math.max(1, Math.round(nextValue)));
            }}
            inputMode="numeric"
          />
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-border bg-background p-4">
          <div className="text-sm font-medium">Banner media</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload light and dark header banners or paste a stored path directly.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <BannerUploadField
              label="Light banner"
              value={headerBannerLightPath}
              previewUrl={headerBannerLightPreviewUrl}
              isUploading={isUploadingHeaderBannerLight}
              inputRef={headerBannerLightInputRef}
              onValueChange={onHeaderBannerLightPathChange}
              onUpload={(file) => onUploadBanner("light", file)}
              onClear={() => onHeaderBannerLightPathChange("")}
            />
            <BannerUploadField
              label="Dark banner"
              value={headerBannerDarkPath}
              previewUrl={headerBannerDarkPreviewUrl}
              isUploading={isUploadingHeaderBannerDark}
              inputRef={headerBannerDarkInputRef}
              onValueChange={onHeaderBannerDarkPathChange}
              onUpload={(file) => onUploadBanner("dark", file)}
              onClear={() => onHeaderBannerDarkPathChange("")}
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-background p-4">
          <div className="text-sm font-medium">Logo preview</div>
          <div className="mt-3 max-w-[220px] overflow-hidden rounded-xl border border-border/70 bg-muted/20">
            <AspectRatio
              ratio={Math.max(0.1, headerLogoAspectRatio)}
              className="overflow-hidden"
              style={{ borderRadius: `${Math.max(0, headerLogoCornerRadius)}px` }}
            >
              {catalogLogoFallbackUrl ? (
                <Image
                  src={catalogLogoFallbackUrl}
                  alt={`${catalogName} original logo`}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-3 text-center text-[11px] text-muted-foreground">
                  No catalog logo in Settings yet
                </div>
              )}
            </AspectRatio>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <FieldLabel
          label="Header content"
          hint="These controls are already real and continue to affect the live preview."
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <BinaryPill
            label="Show logo"
            active={showHeaderLogo}
            onClick={() => onShowHeaderLogoChange(!showHeaderLogo)}
          />
          <BinaryPill
            label="Show title"
            active={showHeaderTitle}
            onClick={() => onShowHeaderTitleChange(!showHeaderTitle)}
          />
          <BinaryPill
            label="Show description"
            active={showHeaderDescription}
            onClick={() => onShowHeaderDescriptionChange(!showHeaderDescription)}
          />
          <BinaryPill
            label="Show tags"
            active={showHeaderTags}
            onClick={() => onShowHeaderTagsChange(!showHeaderTags)}
          />
          <BinaryPill
            label="Stretch logo"
            active={headerLogoFullWidth}
            onClick={() => onHeaderLogoFullWidthChange(!headerLogoFullWidth)}
            className="sm:col-span-2"
          />
        </div>
      </div>
    </StudioCard>
  );
}

function PricingInspector({
  currencyCode,
  onCurrencyCodeChange,
  currencyLabel,
  onCurrencyLabelChange,
  labelPosition,
  onLabelPositionChange,
  showDecimals,
  onShowDecimalsChange,
  thousandSeparator,
  onThousandSeparatorChange,
  decimalSeparator,
  onDecimalSeparatorChange,
  pricingSample,
  pricingSaleSample,
}: {
  currencyCode: string;
  onCurrencyCodeChange: (value: string) => void;
  currencyLabel: string;
  onCurrencyLabelChange: (value: string) => void;
  labelPosition: CurrencySettings["labelPosition"];
  onLabelPositionChange: (value: CurrencySettings["labelPosition"]) => void;
  showDecimals: boolean;
  onShowDecimalsChange: (value: boolean) => void;
  thousandSeparator: CurrencySettings["thousandSeparator"];
  onThousandSeparatorChange: (value: CurrencySettings["thousandSeparator"]) => void;
  decimalSeparator: CurrencySettings["decimalSeparator"];
  onDecimalSeparatorChange: (value: CurrencySettings["decimalSeparator"]) => void;
  pricingSample: string;
  pricingSaleSample: string;
}) {
  return (
    <StudioCard>
      <InspectorIntro
        title="Pricing"
        description="Format item prices and see the result update immediately."
      />

      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Live sample
        </div>
        <div className="mt-3 rounded-xl border border-border bg-background p-5 shadow-sm">
          <div className="text-[44px] font-semibold leading-none tracking-tight">
            {pricingSample}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-muted/20 px-3 py-1">
              Regular price
            </span>
            <span className="rounded-full border border-border bg-muted/20 px-3 py-1">
              {pricingSaleSample} sale
            </span>
          </div>
        </div>
      </div>

      <StudioInputField
        label="Currency code"
        value={currencyCode}
        onChange={onCurrencyCodeChange}
      />

      <StudioInputField
        label="Currency label"
        value={currencyLabel}
        onChange={onCurrencyLabelChange}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SegmentedField
          label="Position"
          options={[
            { label: "Before", value: "prefix" },
            { label: "After", value: "suffix" },
          ]}
          selected={labelPosition}
          onSelect={onLabelPositionChange}
          columns={2}
        />
        <SegmentedField
          label="Decimals"
          options={[
            { label: "On", value: "on" },
            { label: "Off", value: "off" },
          ]}
          selected={showDecimals ? "on" : "off"}
          onSelect={(value) => onShowDecimalsChange(value === "on")}
          columns={2}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SegmentedField
          label="Thousands"
          options={[
            { label: "Space", value: " " },
            { label: "Comma", value: "," },
            { label: "Dot", value: "." },
          ]}
          selected={thousandSeparator}
          onSelect={onThousandSeparatorChange}
          columns={3}
        />
        <SegmentedField
          label="Decimal"
          options={[
            { label: "Dot", value: "." },
            { label: "Comma", value: "," },
          ]}
          selected={decimalSeparator}
          onSelect={onDecimalSeparatorChange}
          columns={2}
        />
      </div>

      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Changes update the catalog cards on the right in real time.
      </div>
    </StudioCard>
  );
}

function CartInspector({
  cartEnabled,
  onCartEnabledChange,
}: {
  cartEnabled: boolean;
  onCartEnabledChange: (value: boolean) => void;
}) {
  return (
    <StudioCard>
      <InspectorIntro
        title="Cart"
        description="Ordering is on by default. Switch off for a browse-only menu."
      />

      <button
        type="button"
        onClick={() => onCartEnabledChange(!cartEnabled)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition",
          cartEnabled
            ? "border-foreground bg-foreground text-background shadow-sm"
            : "border-border bg-background hover:border-foreground/30",
        )}
        aria-pressed={cartEnabled}
      >
        <div>
          <div className="text-sm font-medium">Enable cart</div>
          <div
            className={cn(
              "mt-1 text-xs",
              cartEnabled ? "text-background/75" : "text-muted-foreground",
            )}
          >
            Floating cart button + Add-to-cart CTA on item details.
          </div>
        </div>
        <div className="text-xs uppercase tracking-[0.18em]">
          {cartEnabled ? "On" : "Switch"}
        </div>
      </button>

      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        On by default. Customers add items and check out using the order modes
        you enable under Settings → Venue. Turn this off only for a browse-only
        menu (no cart, no Add-to-cart).
      </div>
    </StudioCard>
  );
}

function StudioCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border/70 bg-background p-5 shadow-[0_10px_30px_-22px_rgba(16,24,40,0.35)]",
        className,
      )}
    >
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function InspectorIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-[30px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function FieldLabel({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-sm font-medium">{label}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function SegmentedField<T extends string>({
  label,
  options,
  selected,
  onSelect,
  columns,
}: {
  label: string;
  options: Array<{ label: string; value: T }>;
  selected: T;
  onSelect: (value: T) => void;
  columns?: number;
}) {
  return (
    <div className="space-y-3">
      <FieldLabel label={label} />
      <div
        className={cn(
          "flex flex-wrap gap-2",
          columns === 2 && "grid grid-cols-2",
          columns === 3 && "grid grid-cols-3",
        )}
      >
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={cn(
                "rounded-md border px-4 py-2 text-sm transition",
                isSelected
                  ? "border-foreground bg-foreground text-background shadow-sm"
                  : "border-border bg-background hover:border-foreground/30",
                columns ? "w-full" : "",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StudioInputField({
  label,
  value,
  onChange,
  inputMode,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium">{label}</div>
      <input
        type="text"
        value={value}
        inputMode={inputMode}
        readOnly={readOnly}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={cn(
          "w-full rounded-md border border-border bg-background px-4 py-3 text-sm outline-none transition",
          readOnly
            ? "cursor-default text-muted-foreground"
            : "focus:border-foreground/35 focus:ring-2 focus:ring-foreground/5",
        )}
      />
    </label>
  );
}

function SwatchTextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block rounded-xl border border-border bg-background p-3">
      <div className="mb-2 text-sm font-medium">{label}</div>
      <div className="flex items-center gap-3">
        <div
          className="h-5 w-5 rounded-full border border-border"
          style={{ background: value || "transparent" }}
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </label>
  );
}

function BannerUploadField({
  label,
  value,
  previewUrl,
  isUploading,
  inputRef,
  onValueChange,
  onUpload,
  onClear,
}: {
  label: string;
  value: string;
  previewUrl: string | null;
  isUploading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onValueChange: (value: string) => void;
  onUpload: (file: File) => Promise<void>;
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{label}</div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
          {value.trim() ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void onUpload(file);
        }}
      />

      <input
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder="krafta/org/... or https://..."
        className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"
      />

      <div className="mt-3 relative h-24 overflow-hidden rounded-md border border-border bg-background">
        {previewUrl ? (
          <Image src={previewUrl} alt={`${label} preview`} fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No image selected
          </div>
        )}
      </div>
    </div>
  );
}

function BinaryPill({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition",
        active
          ? "border-foreground bg-foreground text-background shadow-sm"
          : "border-border bg-background hover:border-foreground/30",
        className,
      )}
    >
      <span>{label}</span>
      <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em]">
        {active ? (
          <>
            <Check className="size-3" />
            On
          </>
        ) : (
          "Off"
        )}
      </span>
    </button>
  );
}
