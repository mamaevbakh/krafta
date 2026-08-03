import { cn } from "@/lib/utils";

/**
 * The providers Krafta Pay can talk to, and how they present.
 *
 * ON THE MARKS
 * ------------
 * These are brand-coloured monogram tiles, NOT the providers' official logos —
 * we do not have licensed copies of those, and shipping an approximation while
 * calling it their logo would misrepresent a company we integrate with.
 *
 * Each provider's mark is a single component below, so replacing one with an
 * official SVG the provider supplies is a one-function change and touches
 * nothing else. The brand colour is kept in `brand` for exactly that reason.
 *
 * ON `status`
 * -----------
 * `available` means the adapter genuinely exists and can charge a card today.
 * `soon` means the adapter is a `throw` stub in packages/payments-core. Showing
 * them greyed is honest — it tells a merchant which rails are coming without
 * letting them connect one that would fail at the first charge.
 */

export type CatalogProviderId = "atmos" | "uzum" | "payme" | "click";

export type CatalogProvider = {
  id: CatalogProviderId;
  name: string;
  /** Message key for the one-line description. */
  taglineKey: string;
  status: "available" | "soon";
  brand: string;
  Mark: (props: { className?: string }) => React.ReactElement;
};

function MarkTile({
  children,
  brand,
  className,
}: {
  children: React.ReactNode;
  brand: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: brand }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl font-semibold text-white",
        "size-10 text-base",
        className,
      )}
    >
      {children}
    </span>
  );
}

export const PROVIDER_CATALOG: Record<CatalogProviderId, CatalogProvider> = {
  atmos: {
    id: "atmos",
    name: "Atmos",
    taglineKey: "providers.atmos.tagline",
    status: "available",
    brand: "#0F62FE",
    Mark: ({ className }) => (
      <MarkTile brand="#0F62FE" className={className}>
        A
      </MarkTile>
    ),
  },
  uzum: {
    id: "uzum",
    name: "Uzum",
    taglineKey: "providers.uzum.tagline",
    status: "available",
    brand: "#7F4DFF",
    Mark: ({ className }) => (
      <MarkTile brand="#7F4DFF" className={className}>
        U
      </MarkTile>
    ),
  },
  payme: {
    id: "payme",
    name: "Payme",
    taglineKey: "providers.payme.tagline",
    status: "soon",
    brand: "#00CFC1",
    Mark: ({ className }) => (
      <MarkTile brand="#00CFC1" className={className}>
        P
      </MarkTile>
    ),
  },
  click: {
    id: "click",
    name: "Click",
    taglineKey: "providers.click.tagline",
    status: "soon",
    brand: "#00A3E0",
    Mark: ({ className }) => (
      <MarkTile brand="#00A3E0" className={className}>
        C
      </MarkTile>
    ),
  },
};

/** Picker order: what works first, what's coming after. */
export const CATALOG_ORDER: CatalogProviderId[] = ["atmos", "uzum", "payme", "click"];

/** Providers whose adapter can actually charge a card. */
export type ConnectableProviderId = "atmos" | "uzum";

export function isConnectable(id: CatalogProviderId): id is ConnectableProviderId {
  return PROVIDER_CATALOG[id].status === "available";
}

/**
 * Sensible defaults so a merchant is not asked for things we already know.
 *
 * `apiBaseUrl` is the same host for both environments on Atmos — the test/live
 * split lives in the credentials, not the URL. Asking for it on a connect form
 * implies a choice that does not exist, so it is pre-filled and tucked behind
 * an advanced disclosure rather than presented as a question.
 */
export function defaultApiBaseUrl(provider: ConnectableProviderId): string {
  if (provider === "atmos") return "https://apigw.atmos.uz";
  return "";
}

/** A merchant connecting Atmos has one Atmos account. Do not make them name it. */
export function defaultDisplayLabel(provider: ConnectableProviderId): string {
  return PROVIDER_CATALOG[provider].name;
}
