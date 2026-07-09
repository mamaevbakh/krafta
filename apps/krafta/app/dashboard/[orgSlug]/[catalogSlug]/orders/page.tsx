import { createClient } from "@/lib/supabase/server";
import { normalizeCurrencySettings } from "@/lib/catalogs/settings/currency";
import { getDashboardT } from "@/lib/locales/dashboard/server";
import type { TranslateFn } from "@/lib/locales/dashboard/messages";

import {
  OrdersPanel,
  type OrderLineItem,
  type OrderRow,
} from "./_components/orders-panel";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

export default async function DashboardOrdersPage({ params }: PageProps) {
  const { catalogSlug } = await params;
  const supabase = await createClient();
  const t = await getDashboardT();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select("id, org_id, settings_currency, pricing_config")
    .eq("slug", catalogSlug)
    .maybeSingle();

  if (!catalog) {
    return (
      <main className="w-full">
        <div className="mx-auto max-w-[1248px] px-6 py-8">
          <p className="text-sm text-muted-foreground">
            {t("orders.catalog_not_found")}
          </p>
        </div>
      </main>
    );
  }

  const currencySettings = normalizeCurrencySettings(
    (catalog.pricing_config ??
      catalog.settings_currency ??
      {}) as Record<string, unknown>,
  );

  // Pull orders + customer + fulfillment (with per-mode subtype details) +
  // line items in a single round trip via PostgREST embedded selects. The
  // subtype details for the modes that don't match return [] / null and
  // get filtered out below.
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
        fulfillments(
          id, type, state,
          dine_in_details:fulfillment_dine_in_details(
            table_label, table_session_id, guest_session_id, party_size,
            course_number, closed_at
          ),
          pickup_details:fulfillment_pickup_details(
            schedule_type, pickup_at, pickup_window_minutes, prep_time_minutes,
            recipient_name, recipient_phone, note,
            placed_at, accepted_at, ready_at, picked_up_at, canceled_at,
            cancel_reason, is_curbside
          ),
          delivery_details:fulfillment_delivery_details(
            recipient_name, recipient_phone, address, scheduled_for,
            delivery_provider, external_courier_ref, note,
            placed_at, accepted_at, courier_assigned_at, picked_up_at,
            delivered_at, canceled_at, cancel_reason
          )
        ),
        line_items:order_line_items(
          id, name, variation_name, quantity, base_price_cents,
          total_price_cents
        ),
        payments:order_payments(
          id, source_type, status, total_cents, currency, completed_at,
          collected_by_user_id
        )
      `,
    )
    .eq("catalog_id", catalog.id)
    .neq("state", "draft")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows: OrderRow[] = (orders ?? []).map((order) => {
    const fulfillment = order.fulfillments?.[0] ?? null;
    const lineItems: OrderLineItem[] = (order.line_items ?? []).map((line) => ({
      id: line.id,
      name: line.name,
      variationName: line.variation_name,
      quantity: Number(line.quantity ?? 0),
      basePriceCents: line.base_price_cents,
      totalPriceCents: line.total_price_cents,
    }));
    const itemCount = lineItems.reduce((sum, line) => sum + line.quantity, 0);
    const totalCents = lineItems.reduce(
      (sum, line) => sum + line.totalPriceCents,
      0,
    );
    const customerLabel = formatCustomerLabel(order.customer, t);

    const payments = (order.payments ?? []).map((payment) => ({
      id: payment.id,
      sourceType: payment.source_type,
      status: payment.status,
      totalCents: payment.total_cents,
      currency: payment.currency,
      completedAt: payment.completed_at,
      collectedByUserId: payment.collected_by_user_id,
    }));

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
      fulfillmentId: fulfillment?.id ?? null,
      fulfillmentState: fulfillment?.state ?? null,
      // The fulfillment_*_details tables have PRIMARY KEY (fulfillment_id),
      // so PostgREST infers a one-to-one relation and Supabase typegen
      // returns a single object (or null), not an array.
      dineIn: fulfillment?.dine_in_details ?? null,
      pickup: fulfillment?.pickup_details ?? null,
      delivery:
        fulfillment?.delivery_details
          ? {
              ...fulfillment.delivery_details,
              address:
                typeof fulfillment.delivery_details.address === "object" &&
                fulfillment.delivery_details.address !== null
                  ? (fulfillment.delivery_details.address as Record<string, unknown>)
                  : null,
            }
          : null,
      itemCount,
      totalCents,
      customer: order.customer ?? null,
      customerLabel,
      lineItems,
      payments,
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
  t: TranslateFn,
): string {
  if (!customer) return t("orders.customer_guest");
  const name = [customer.given_name, customer.family_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (name) return name;
  if (customer.phone) return customer.phone;
  if (customer.email) return customer.email;
  return t("orders.customer_guest");
}
