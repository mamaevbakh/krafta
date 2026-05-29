import Image from "next/image";
import type { JSX } from "react";

import type { PublicCatalogLocaleOption } from "@/lib/catalogs/data";
import { LocaleSwitcher } from "./locale-switcher";
import { ModeToggle } from "./mode-toggle";

type CatalogHeaderProps = {
  catalogName: string;
  description?: string | null;
  logoUrl?: string | null;
  tags?: string[] | null;
  headerSettings?: unknown;
  locales?: PublicCatalogLocaleOption[];
  activeLocale?: string;
};

export function CatalogHeader({
  catalogName,
  description,
  tags,
  logoUrl,
  locales = [],
  activeLocale = "",
}: CatalogHeaderProps): JSX.Element {
  return (
    <header className="space-y-3">
      {/* Top: logo + name + language switcher.
          Switcher sits right-aligned so it doesn't compete with the
          catalog title for visual weight — language is secondary to
          the shop's identity. */}
      <div className="flex items-center gap-3">
        {logoUrl && (
          <div className="relative h-10 w-10 overflow-hidden rounded-sm bg-muted">
            <Image
              src={logoUrl}
              alt={`${catalogName} logo`}
              fill
              sizes="40px"
              priority
              className="object-cover"
            />
          </div>
        )}

        <h1 className="flex-1 text-2xl font-semibold">
          {catalogName}
        </h1>

        {/* Mode toggle sits LEFT of the locale switcher so the two
            icon buttons cluster as a single trailing utility group. */}
        <div className="flex items-center gap-2">
          <ModeToggle />
          <LocaleSwitcher options={locales} activeLocale={activeLocale} />
        </div>
      </div>

      {/* Middle: description */}
      {description && (
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      )}

      {/* Bottom: tags row */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
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
