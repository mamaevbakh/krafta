import Image from "next/image";
import type { CSSProperties, JSX } from "react";
import type { HeaderBasicFreeLogoSettings } from "@/lib/catalogs/settings/layout";
import { getCatalogAssetUrl } from "@/lib/catalogs/media";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { cn } from "@/lib/utils";
import type { PublicCatalogLocaleOption } from "@/lib/catalogs/data";
import { LocaleSwitcher } from "./locale-switcher";

type CatalogHeaderProps = {
  catalogName: string;
  description?: string | null;
  logoUrl?: string | null;
  tags?: string[] | null;
  headerSettings?: {
    basicFreeLogo?: Partial<HeaderBasicFreeLogoSettings>;
  };
  locales?: PublicCatalogLocaleOption[];
  activeLocale?: string;
};

export function CatalogHeaderBasicFreeLogo({
  catalogName,
  description,
  tags,
  logoUrl,
  headerSettings,
  locales = [],
  activeLocale = "",
}: CatalogHeaderProps): JSX.Element {
  const settings = headerSettings?.basicFreeLogo;
  const showLogo = settings?.showLogo ?? true;
  const showTitle = settings?.showTitle ?? true;
  const showDescription = settings?.showDescription ?? true;
  const showTags = settings?.showTags ?? true;
  const logoFullWidth = settings?.logoFullWidth ?? false;
  const logoAspectRatio = settings?.logoAspectRatio ?? 1;
  const logoCornerRadius = settings?.logoCornerRadius ?? 4;

  const bannerLightUrl = getCatalogAssetUrl(settings?.bannerLightPath ?? null);
  const bannerDarkUrl = getCatalogAssetUrl(settings?.bannerDarkPath ?? null);
  const hasBanner = Boolean(bannerLightUrl || bannerDarkUrl);
  const resolvedBannerLightUrl = bannerLightUrl ?? bannerDarkUrl;
  const resolvedBannerDarkUrl = bannerDarkUrl ?? bannerLightUrl;

  const headerStyle = {
    "--header-bg-light": settings?.backgroundColorLight ?? "transparent",
    "--header-bg-dark": settings?.backgroundColorDark ?? "transparent",
  } as CSSProperties;

  return (
    <header
      className={cn(
        "relative flex flex-col items-center gap-4 overflow-hidden rounded-lg px-4 py-5 text-center",
        "bg-[var(--header-bg-light)] dark:bg-[var(--header-bg-dark)]",
      )}
      style={headerStyle}
    >
      {/* Float the switcher in the top-right corner so it sits above
          the banner (when present) and never displaces the centered
          identity. z-10 keeps it above the banner image; the popover
          itself portals to body so layering inside the rounded card
          doesn't clip the dropdown. */}
      <div className="absolute right-3 top-3 z-10">
        <LocaleSwitcher options={locales} activeLocale={activeLocale} />
      </div>

      {hasBanner && (
        <AspectRatio
          ratio={16 / 6}
          className="w-full overflow-hidden rounded-md"
        >
          {resolvedBannerLightUrl &&
            resolvedBannerDarkUrl &&
            resolvedBannerLightUrl !== resolvedBannerDarkUrl && (
            <Image
              src={resolvedBannerLightUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              priority
              className="object-cover dark:hidden"
              aria-hidden="true"
            />
          )}
          {resolvedBannerDarkUrl &&
            resolvedBannerLightUrl &&
            resolvedBannerLightUrl !== resolvedBannerDarkUrl && (
            <Image
              src={resolvedBannerDarkUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              priority
              className="hidden object-cover dark:block"
              aria-hidden="true"
            />
          )}
          {resolvedBannerLightUrl &&
            resolvedBannerDarkUrl &&
            resolvedBannerLightUrl === resolvedBannerDarkUrl && (
            <Image
              src={resolvedBannerLightUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              priority
              className="object-cover"
              aria-hidden="true"
            />
          )}
        </AspectRatio>
      )}

      {showLogo && logoUrl && (
        <div
          className={cn(
            "relative overflow-hidden",
            logoFullWidth
              ? "w-[calc(100%+2rem)] -mx-4 max-w-none"
              : "w-full max-w-[360px]",
          )}
        >
          <AspectRatio
            ratio={Math.max(0.1, logoAspectRatio)}
            className="overflow-hidden"
            style={{ borderRadius: `${Math.max(0, logoCornerRadius)}px` }}
          >
            <Image
              src={logoUrl}
              alt={`${catalogName} logo`}
              fill
              sizes="(max-width: 768px) 100vw, 360px"
              priority
              className="object-cover"
            />
          </AspectRatio>
        </div>
      )}

      <div className="space-y-2">
        {showTitle && <h1 className="text-2xl font-semibold">{catalogName}</h1>}
        {showDescription && description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {showTags && tags && tags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
