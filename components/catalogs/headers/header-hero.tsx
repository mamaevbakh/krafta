import Image from "next/image";
import type { JSX } from "react";

type CatalogHeaderHeroProps = {
  catalogName: string;
  description?: string | null;
  logoUrl?: string | null;
  tags?: string[] | null;
};

export function CatalogHeaderHero({
  catalogName,
  description,
  tags,
  logoUrl,
}: CatalogHeaderHeroProps): JSX.Element {
  return (
    <header className="rounded-lg border bg-muted/40 px-4 py-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {logoUrl && (
            <div className="relative h-12 w-12 overflow-hidden rounded-md bg-background">
              <Image
                src={logoUrl}
                alt={`${catalogName} logo`}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold">{catalogName}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
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
