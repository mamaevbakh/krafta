import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/auth/redirect";
import { normalizeCurrencySettings } from "@/lib/catalogs/settings/currency";
import { normalizeQrStyle } from "@/lib/qr/config";
import { renderQrSvg } from "@/lib/qr/render";
import { telegramLoginConfigured } from "@/lib/auth/telegram-bridge";
import { venueDayStartUtc, TODAY_FETCH_LIMIT } from "@/lib/dashboard/overview";

import { OverviewPanel } from "./_components/overview/overview-panel";
import type { OverviewOrder } from "./_components/overview/types";

type PageProps = {
  params: Promise<{ orgSlug: string; catalogSlug: string }>;
};

// Orders arrive with embedded fulfillment + line items; we flatten them into
// the lean OverviewOrder shape the panel and metric helpers consume. This is
// the same embed the Orders page uses, trimmed to what the home needs.
const ORDER_SELECT = `
  id, state, reference_id, ticket_name, source, created_at, version,
  customer:customers(id, given_name, family_name, email, phone),
  fulfillments(id, type, state),
  line_items:order_line_items(id, name, quantity, total_price_cents)
` as const;

function mapOrder(order: {
  id: string;
  state: string;
  reference_id: string | null;
  ticket_name: string | null;
  created_at: string;
  version: number;
  customer:
    | {
        given_name: string | null;
        family_name: string | null;
        email: string | null;
        phone: string | null;
      }
    | null;
  fulfillments: Array<{ id: string; type: string | null; state: string | null }>;
  line_items: Array<{
    id: string;
    name: string;
    quantity: number;
    total_price_cents: number;
  }>;
}): OverviewOrder {
  const fulfillment = order.fulfillments?.[0] ?? null;
  const lineItems = (order.line_items ?? []).map((li) => ({
    name: li.name,
    quantity: Number(li.quantity ?? 0),
    totalPriceCents: li.total_price_cents ?? 0,
  }));
  return {
    id: order.id,
    state: order.state as OverviewOrder["state"],
    reference: order.reference_id ?? order.id.slice(0, 8),
    ticketName: order.ticket_name,
    createdAt: order.created_at,
    version: order.version,
    mode: (fulfillment?.type ?? null) as OverviewOrder["mode"],
    fulfillmentId: fulfillment?.id ?? null,
    fulfillmentState: (fulfillment?.state ??
      null) as OverviewOrder["fulfillmentState"],
    customerLabel: formatCustomerLabel(order.customer),
    itemCount: lineItems.reduce((sum, li) => sum + li.quantity, 0),
    lineItems,
  };
}

function formatCustomerLabel(
  customer:
    | {
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
  return name || customer.phone || customer.email || "Guest";
}

export default async function DashboardOverviewPage({ params }: PageProps) {
  const { orgSlug, catalogSlug } = await params;
  const supabase = await createClient();

  const { data: catalog } = await supabase
    .from("catalogs")
    .select(
      "id, name, slug, status, org_id, settings_currency, pricing_config, settings_qr_style",
    )
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

  const { data: venue } = await supabase
    .from("venues")
    .select("id, status, timezone, tma_enabled")
    .eq("catalog_id", catalog.id)
    .maybeSingle();

  const timeZone = venue?.timezone || "Asia/Tashkent";
  const now = new Date();
  const startOfToday = venueDayStartUtc(now, timeZone);
  const sevenDaysAgo = new Date(
    startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000,
  );

  const currencySettings = normalizeCurrencySettings(
    (catalog.pricing_config ??
      catalog.settings_currency ??
      {}) as Record<string, unknown>,
  );

  // One wave: today (full detail), the 7 prior days (for bars/top-items/delta),
  // and the lifetime count (brand-new gate). All cheap, all catalog-scoped.
  const [todayRes, priorRes, lifetimeRes] = await Promise.all([
    supabase
      .schema("commerce")
      .from("orders")
      .select(ORDER_SELECT)
      .eq("catalog_id", catalog.id)
      .neq("state", "draft")
      .gte("created_at", startOfToday.toISOString())
      .order("created_at", { ascending: false })
      .limit(TODAY_FETCH_LIMIT),
    supabase
      .schema("commerce")
      .from("orders")
      .select("id, state, created_at, line_items:order_line_items(name, quantity, total_price_cents)")
      .eq("catalog_id", catalog.id)
      .neq("state", "draft")
      .gte("created_at", sevenDaysAgo.toISOString())
      .lt("created_at", startOfToday.toISOString())
      .limit(2000),
    supabase
      .schema("commerce")
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("catalog_id", catalog.id)
      .neq("state", "draft"),
  ]);

  const todayOrders: OverviewOrder[] = (todayRes.data ?? []).map(mapOrder);
  const priorOrders = (priorRes.data ?? []).map((o) => ({
    state: o.state as string,
    createdAt: o.created_at,
    lineItems: (o.line_items ?? []).map((li) => ({
      name: li.name,
      quantity: Number(li.quantity ?? 0),
      totalPriceCents: li.total_price_cents ?? 0,
    })),
  }));
  const lifetimeOrders = lifetimeRes.count ?? todayOrders.length;

  const origin = getRequestOrigin(await headers());
  const storefrontUrl = `${origin}/${catalogSlug}`;

  // Brand-new shops get the distribution card, which needs a real QR. Only
  // render the (relatively heavy) SVG when we're actually in that state.
  let mainQrSvg: string | null = null;
  let telegramUrl: string | null = null;
  if (lifetimeOrders === 0 && venue) {
    const { data: mainQr } = await supabase
      .from("qr_codes")
      .select("shortcode")
      .eq("venue_id", venue.id)
      .eq("kind", "main")
      .maybeSingle();
    if (mainQr?.shortcode) {
      mainQrSvg = await renderQrSvg(`${origin}/q/${mainQr.shortcode}`, {
        style: normalizeQrStyle(catalog.settings_qr_style),
      });
    }
    const botUsername = telegramLoginConfigured()
      ? process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "")
      : null;
    if (botUsername && venue.tma_enabled) {
      telegramUrl = `https://t.me/${botUsername}?startapp=${catalogSlug}`;
    }
  }

  const todayTruncated = todayOrders.length >= TODAY_FETCH_LIMIT;

  return (
    <OverviewPanel
      catalogId={catalog.id}
      catalogName={catalog.name}
      orgSlug={orgSlug}
      catalogSlug={catalogSlug}
      catalogStatus={catalog.status as string}
      venueStatus={(venue?.status ?? null) as string | null}
      timeZone={timeZone}
      currencySettings={currencySettings}
      todayOrders={todayOrders}
      priorOrders={priorOrders}
      lifetimeOrders={lifetimeOrders}
      todayTruncated={todayTruncated}
      storefrontUrl={storefrontUrl}
      published={venue?.status === "active"}
      mainQrSvg={mainQrSvg}
      telegramUrl={telegramUrl}
      nowIso={now.toISOString()}
    />
  );
}
