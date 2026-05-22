import Image from "next/image";
import type { JSX } from "react";

import type { PublicCatalogLocaleOption } from "@/lib/catalogs/data";
import { LocaleSwitcher } from "./locale-switcher";

type CatalogHeaderCenterProps = {
  catalogName: string;
  description?: string | null;
  logoUrl?: string | null;
  tags?: string[] | null;
  headerSettings?: unknown;
  locales?: PublicCatalogLocaleOption[];
  activeLocale?: string;
};

export function CatalogHeaderCenter({
  catalogName,
  description,
  tags,
  logoUrl,
  locales = [],
  activeLocale = "",
}: CatalogHeaderCenterProps): JSX.Element {
  return (
    <header className="relative flex flex-col items-center space-y-3 text-center">
      {/* The header layout is centered, so the switcher floats in the
          top-right corner instead of inline with the title. Customers
          scan the centered identity first; the switcher stays
          discoverable but visually subordinate. */}
      <div className="absolute right-0 top-0">
        <LocaleSwitcher options={locales} activeLocale={activeLocale} />
      </div>

      {logoUrl && (
        <div className="relative h-12 w-12 overflow-hidden rounded-sm bg-muted">
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

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{catalogName}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {tags && tags.length > 0 && (
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
