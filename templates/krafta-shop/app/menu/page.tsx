import { commerce } from "@/lib/commerce";
import { SiteHeader } from "@/components/blocks/site-header";
import { MenuGrid } from "@/components/blocks/menu-grid";

export default async function MenuPage() {
  const catalog = await commerce.getCatalog();
  return (
    <main>
      <SiteHeader shopName={catalog.name} />
      <MenuGrid />
    </main>
  );
}
