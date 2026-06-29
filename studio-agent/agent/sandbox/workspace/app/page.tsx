import { commerce } from "@/lib/commerce";
import { SiteHeader } from "@/components/blocks/site-header";
import { Hero } from "@/components/blocks/hero";
import { ProductCard } from "@/components/blocks/product-card";

// Landing page that leads into the shop. Pure structure the agent reshapes per
// the merchant brief; only the featured row touches the engine (read-only).
export default async function HomePage() {
  const catalog = await commerce.getCatalog();
  const featured = catalog.categories.flatMap((category) => category.items).slice(0, 4);

  return (
    <main>
      <SiteHeader shopName={catalog.name} />
      <Hero shopName={catalog.name} description={catalog.description} />
      {featured.length > 0 ? (
        <section className="mx-auto max-w-5xl px-4 pb-20">
          <h2 className="mb-6 text-xl font-semibold tracking-tight">Featured</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {featured.map((item) => (
              <ProductCard key={item.id} item={item} currency={catalog.currency} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
