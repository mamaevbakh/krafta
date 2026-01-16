import Image from "next/image";
import type { JSX } from "react";

type CatalogHeaderCenterProps = {
  catalogName: string;
  description?: string | null;
  logoUrl?: string | null;
  tags?: string[] | null;
};

export function CatalogHeaderCenter({
  catalogName,
  description,
  tags,
  logoUrl,
}: CatalogHeaderCenterProps): JSX.Element {
  return (
    <header className="flex flex-col items-center space-y-3 text-center">
      {logoUrl && (
        <div className="relative h-12 w-12 overflow-hidden rounded-sm bg-muted">
          <Image
            src={logoUrl}
            alt={`${catalogName} logo`}
            fill
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
