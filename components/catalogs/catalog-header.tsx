import Image from "next/image";
import type { JSX } from "react";

type CatalogHeaderProps = {
  catalogName: string;
  description?: string;
  logoUrl?: string | null;
  tags?: string[]; // e.g. ["Vintage shop", "Clothes", "Tashkent"]
};

export function CatalogHeader({
  catalogName,
  description,
  tags,
  logoUrl,
}: CatalogHeaderProps): JSX.Element {
  return (
    <header className="space-y-3">
      {/* Top: logo + name */}
      <div className="flex items-center gap-3">
        {logoUrl && (
          <div className="relative h-10 w-10 overflow-hidden rounded-sm bg-muted">
            <Image
              src={logoUrl}
              alt={`${catalogName} logo`}
              fill
              className="object-cover"
            />
          </div>
        )}

        <h1 className="text-2xl font-semibold">
          {catalogName}
        </h1>
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
