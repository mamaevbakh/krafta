import { Suspense } from "react";
import type { Metadata } from "next";

import { getCatalogBySlug, getCatalogStructure } from "@/lib/catalogs/data";
import { normalizeCurrencySettings } from "@/lib/catalogs/settings/currency";
import { LabAssistant } from "./lab-assistant";

// Internal design-exploration page: the SAME shop-assistant backend
// (/api/shop-assistant + searchCatalog) rendered with the Vercel AI Elements
// component suite (Conversation / Message / MessageResponse / Tool / PromptInput),
// to evaluate AI Elements as a UI direction vs the hand-built storefront
// assistant. Not linked anywhere; not for production storefront use.
//
//   /lab/assistant            -> defaults to the demo "vintage-shop" catalog
//   /lab/assistant?catalog=X  -> any catalog slug that has the assistant enabled
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Static shell. All dynamic work (searchParams access + the useChat client
// component, which generates ids with Math.random()) lives under <Suspense>,
// as Next 16 Cache Components requires.
export default function LabAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ catalog?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <LabAssistantLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function LabAssistantLoader({
  searchParams,
}: {
  searchParams: Promise<{ catalog?: string }>;
}) {
  const { catalog: slugParam } = await searchParams;
  const slug = slugParam || "vintage-shop";
  const catalog = await getCatalogBySlug(slug);

  if (!catalog) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-sm text-muted-foreground">
        Catalog “{slug}” not found. Pass <code>?catalog=&lt;slug&gt;</code> for a
        catalog that has the AI assistant enabled.
      </div>
    );
  }

  // Items + currency so the tool output can render as real product cards
  // (the hybrid: AI Elements chrome + the storefront's product cards).
  const categoriesWithItems = await getCatalogStructure(catalog.id);
  const currencySettings = normalizeCurrencySettings(
    (catalog.settings_currency ?? {}) as Record<string, unknown>,
  );

  return (
    <LabAssistant
      catalogId={catalog.id}
      orgId={catalog.org_id ?? null}
      shopName={catalog.name}
      slug={slug}
      categoriesWithItems={categoriesWithItems}
      currencySettings={currencySettings}
    />
  );
}
