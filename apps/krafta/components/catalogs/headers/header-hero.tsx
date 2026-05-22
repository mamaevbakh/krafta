import Image from "next/image";
import type { JSX } from "react";

import type { PublicCatalogLocaleOption } from "@/lib/catalogs/data";
import { LocaleSwitcher } from "./locale-switcher";

type CatalogHeaderHeroProps = {
  catalogName: string;
  description?: string | null;
  logoUrl?: string | null;
  tags?: string[] | null;
  headerSettings?: unknown;
  locales?: PublicCatalogLocaleOption[];
  activeLocale?: string;
};

export function CatalogHeaderHero({
  catalogName,
  description,
  tags,
  logoUrl,
  locales = [],
  activeLocale = "",
}: CatalogHeaderHeroProps): JSX.Element {
  return (
    <header className="rounded-lg border bg-muted/40 px-4 py-5">
      <div className="flex flex-col gap-4">
        {/* The hero header puts identity (logo + title) on the left and
            the switcher trailing on the right — mirrors the basic
            variant but inside the rounded card chrome. */}
        <div className="flex items-start gap-3">
          {logoUrl && (
            <div className="relative h-12 w-12 overflow-hidden rounded-md bg-background">
              <Image
                src={logoUrl}
                alt={`${catalogName} logo`}
                fill
                sizes="48px"
                priority
                className="object-cover"
              />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">{catalogName}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <LocaleSwitcher options={locales} activeLocale={activeLocale} />
        </div>

        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
