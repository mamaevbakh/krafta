import type { ItemCardProps } from "@/lib/catalogs/layout-registry";

export function MinimalCard({ item }: ItemCardProps) {
  return (
    <div className="flex flex-col rounded-xs border px-3 py-3">
      <span className="text-sm font-medium">{item.name}</span>

      {item.description && (
        <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {item.description}
        </span>
      )}
    </div>
  );
}
