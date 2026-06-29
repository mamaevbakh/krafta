import { commerce } from "@/lib/commerce";
import { ProductCard } from "@/components/blocks/product-card";

// Server component — awaits the engine's catalog and maps categories → cards.
// The agent rewrites layout (grid/list/columns) freely; the data shape and the
// commerce import stay.
export async function MenuGrid() {
  const catalog = await commerce.getCatalog();

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      {catalog.categories.map((category) => (
        <section key={category.id}>
          <h2 className="mb-4 text-xl font-semibold tracking-tight">
            {category.name}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {category.items.map((item) => (
              <ProductCard key={item.id} item={item} currency={catalog.currency} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
