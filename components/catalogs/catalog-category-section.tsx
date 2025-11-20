// components/catalogs/catalog-category-section.tsx
import type { Tables } from "@/lib/supabase/types";
import { CatalogItemCard } from "@/components/catalogs/catalog-item-card";

type CatalogCategory = Tables<"catalog_categories">;
type Item = Tables<"items">;

type CategoryWithItems = CatalogCategory & { items: Item[] };

type CategorySectionProps = {
  category: CategoryWithItems;
  getItemImageUrl: (item: Item) => string | null;
};

export function CatalogCategorySection({
  category,
  getItemImageUrl,
}: CategorySectionProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{category.name}</h2>

      {category.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No items in this category yet.
        </p>
      ) : (
        <div className="space-y-2">
          {category.items.map((item) => {
            const imageUrl = getItemImageUrl(item);

            return (
              <CatalogItemCard
                key={item.id}
                item={item}
                imageUrl={imageUrl}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
