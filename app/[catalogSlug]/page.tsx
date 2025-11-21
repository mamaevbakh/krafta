// app/[catalogSlug]/page.tsx
import { Suspense, type JSX } from "react";
import { notFound } from "next/navigation";

import { getCatalogBySlug, getCatalogStructure } from "@/lib/catalogs/data";
import { CatalogLayout } from "@/lib/catalogs/layout";
import { CatalogPageFallback } from "@/components/catalogs/catalog-page-fallback";

type CatalogPageParams = { catalogSlug: string };

export default function CatalogPage({
  params,
}: {
  params: Promise<CatalogPageParams>;
}) {
  return (
    <Suspense fallback={<CatalogPageFallback />}>
      <CatalogPageContent params={params} />
    </Suspense>
  );
}

async function CatalogPageContent({
  params,
}: {
  params: Promise<CatalogPageParams>;
}): Promise<JSX.Element> {
  const { catalogSlug } = await params;

  const catalog = await getCatalogBySlug(catalogSlug);
  if (!catalog) notFound();

  const categoriesWithItems = await getCatalogStructure(catalog.id);

  return (
    <CatalogLayout
      catalog={catalog}
      categoriesWithItems={categoriesWithItems}
    />
  );
}