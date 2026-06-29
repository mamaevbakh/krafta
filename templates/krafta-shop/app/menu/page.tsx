import { commerce } from "@/lib/commerce";
import { siteConfig } from "@/lib/site.config";
import { SiteHeader } from "@/components/blocks/site-header";
import { MenuGrid } from "@/components/blocks/menu-grid";

export default async function MenuPage() {
  const catalog = await commerce.getCatalog();
  return (
    <main className="pb-20">
      <SiteHeader
        shopName={catalog.name}
        description={catalog.description}
        tags={siteConfig.tags}
      />
      <MenuGrid />
    </main>
  );
}
