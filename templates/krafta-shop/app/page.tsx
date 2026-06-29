import { commerce } from "@/lib/commerce";
import { siteConfig } from "@/lib/site.config";
import { SiteHeader } from "@/components/blocks/site-header";
import { ProductCard } from "@/components/blocks/product-card";

// Landing page that leads into the shop — mirrors the Krafta storefront: hero
// header (brand + title + description + tags) over a grid of products. Pure
// structure the agent reshapes per the merchant brief; only the product reads
// touch the engine (read-only).
export default async function HomePage() {
  const catalog = await commerce.getCatalog();
  const featured = catalog.categories
    .flatMap((category) => category.items)
    .slice(0, 6);

  return (
    <main className="pb-20">
      <SiteHeader
        shopName={catalog.name}
        description={catalog.description}
        tags={siteConfig.tags}
      />
      {featured.length > 0 ? (
        <section className="mx-auto max-w-5xl px-4">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Featured</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3">
            {featured.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                currency={catalog.currency}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
