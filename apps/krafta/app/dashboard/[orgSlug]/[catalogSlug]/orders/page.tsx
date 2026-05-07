import { createClient } from "@/lib/supabase/server";
import { normalizeCurrencySettings } from "@/lib/catalogs/settings/currency";

import { OrdersPanel, type OrderRow } from "./_components/orders-panel";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function DashboardOrdersPage({ params }: PageProps) {
  const { catalogSlug } = await params;
  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id, org_id, settings_currency, pricing_config")
    .eq("slug", catalogSlug)
    .maybeSingle();

  if (!catalog) {
    return (
      <main className="w-full">
        <div className="mx-auto max-w-[1248px] px-6 py-8">
          <p className="text-sm text-muted-foreground">Catalog not found.</p>
        </div>
      </main>
    );
  }

  const currencySettings = normalizeCurrencySettings(
    (catalog.pricing_config ??
      catalog.settings_currency ??
      {}) as Record<string, unknown>,
  );

  // Pull orders + customer + fulfillment + line items in one round trip via
  // PostgREST embedded selects. Drafts are excluded — they're customer
  // carts in flight, not orders the merchant should act on yet.
  const { data: orders } = await supabase
    .schema("commerce")
    .from("orders")
    .select(
      `
        id,
        state,
        reference_id,
        ticket_name,
        source,
        created_at,
        closed_at,
        version,
        customer:customers(id, given_name, family_name, email, phone),
        fulfillments(id, type, state),
        line_items:order_line_items(id, name, quantity, total_price_cents)
      `,
    )
    .eq("catalog_id", catalog.id)
    .neq("state", "draft")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows: OrderRow[] = (orders ?? []).map((order) => {
    const fulfillment = order.fulfillments?.[0] ?? null;
    const itemCount = (order.line_items ?? []).reduce(
      (sum, line) => sum + Number(line.quantity ?? 0),
      0,
    );
    const totalCents = (order.line_items ?? []).reduce(
      (sum, line) => sum + (line.total_price_cents ?? 0),
      0,
    );
    const customerLabel = formatCustomerLabel(order.customer);

    return {
      id: order.id,
      state: order.state,
      reference: order.reference_id ?? order.id.slice(0, 8),
      ticketName: order.ticket_name,
      source: order.source,
      createdAt: order.created_at,
      closedAt: order.closed_at,
      version: order.version,
      mode: fulfillment?.type ?? null,
      fulfillmentState: fulfillment?.state ?? null,
      itemCount,
      totalCents,
      customerLabel,
    };
  });

  return (
    <OrdersPanel
      catalogId={catalog.id}
      rows={rows}
      currencySettings={currencySettings}
    />
  );
}

function formatCustomerLabel(
  customer:
    | {
        id: string;
        given_name: string | null;
        family_name: string | null;
        email: string | null;
        phone: string | null;
      }
    | null
    | undefined,
): string {
  if (!customer) return "Guest";
  const name = [customer.given_name, customer.family_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (name) return name;
  if (customer.phone) return customer.phone;
  if (customer.email) return customer.email;
  return "Guest";
}
