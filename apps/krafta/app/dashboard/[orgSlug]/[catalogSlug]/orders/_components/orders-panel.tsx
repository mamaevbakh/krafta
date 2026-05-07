"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { cn } from "@/lib/utils";

import { DataTable } from "../../items/_components/data-table";
import { createOrdersColumns } from "./columns";
import { OrderDetailSheet } from "./order-detail-sheet";

// Path is served from apps/krafta/public/sounds/notif.mp3
const NEW_ORDER_SOUND_SRC = "/sounds/notif.mp3";

export type OrderLineItem = {
  id: string;
  name: string;
  variationName: string | null;
  quantity: number;
  basePriceCents: number;
  totalPriceCents: number;
};

export type OrderCustomer = {
  id: string;
  given_name: string | null;
  family_name: string | null;
  email: string | null;
  phone: string | null;
};

export type OrderDineInDetails = {
  table_label: string;
  table_session_id: string;
  guest_session_id: string;
  party_size: number | null;
  course_number: number | null;
  closed_at: string | null;
};

export type OrderPickupDetails = {
  schedule_type: "asap" | "scheduled";
  pickup_at: string | null;
  pickup_window_minutes: number | null;
  prep_time_minutes: number | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  note: string | null;
  placed_at: string | null;
  accepted_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  is_curbside: boolean;
};

export type OrderPayment = {
  id: string;
  sourceType: "cash" | "external_card_recorded" | "krafta_pay";
  status: "pending" | "approved" | "completed" | "canceled" | "failed";
  totalCents: number;
  currency: string;
  completedAt: string | null;
  collectedByUserId: string | null;
};

export type OrderDeliveryDetails = {
  recipient_name: string;
  recipient_phone: string;
  address: Record<string, unknown> | null;
  scheduled_for: string | null;
  delivery_provider: string;
  external_courier_ref: string | null;
  note: string | null;
  placed_at: string | null;
  accepted_at: string | null;
  courier_assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
};

export type OrderRow = {
  id: string;
  state: "draft" | "open" | "completed" | "canceled";
  reference: string;
  ticketName: string | null;
  source: "web" | "tma" | "qr_scan" | "dashboard";
  createdAt: string;
  closedAt: string | null;
  version: number;
  mode: "dine_in" | "pickup" | "delivery" | "digital" | null;
  fulfillmentId: string | null;
  fulfillmentState:
    | "proposed"
    | "reserved"
    | "prepared"
    | "completed"
    | "canceled"
    | "failed"
    | null;
  dineIn: OrderDineInDetails | null;
  pickup: OrderPickupDetails | null;
  delivery: OrderDeliveryDetails | null;
  itemCount: number;
  totalCents: number;
  customer: OrderCustomer | null;
  customerLabel: string;
  lineItems: OrderLineItem[];
  payments: OrderPayment[];
};

type StatusTab = "all" | "open" | "completed" | "canceled";

const TABS: Array<{ id: StatusTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "completed", label: "Completed" },
  { id: "canceled", label: "Canceled" },
];

type OrdersPanelProps = {
  catalogId: string;
  rows: OrderRow[];
  currencySettings: CurrencySettings;
};

export function OrdersPanel({
  catalogId,
  rows,
  currencySettings,
}: OrdersPanelProps) {
  const router = useRouter();
  const [tab, setTab] = useState<StatusTab>("open");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Keep the sheet's content live: when realtime fires router.refresh(), the
  // server re-renders with fresh data, and the selected row is found again
  // by id on the next render. If the selected order vanishes (canceled
  // elsewhere, etc.), the sheet falls back to a "no longer available" state.
  const selectedOrder = useMemo(
    () => rows.find((row) => row.id === selectedOrderId) ?? null,
    [rows, selectedOrderId],
  );

  // Live updates: any insert/update/delete on commerce.orders or
  // commerce.fulfillments that touches this catalog triggers a refresh.
  // A new fulfillment INSERT (= a customer placed an order) also rings
  // the chime — that's the cash-flow-critical signal for staff.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Pin the merchant's JWT on the realtime connection before subscribing
      // so postgres_changes events get RLS-evaluated against the merchant's
      // identity (not anon, which has no commerce.orders SELECT policy).
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const token = data.session?.access_token ?? null;
      if (token) {
        try {
          await supabase.realtime.setAuth(token);
        } catch {
          // Non-fatal: subscribe will surface CHANNEL_ERROR if it bites.
        }
      }
      if (cancelled) return;

      channelRef = supabase
        .channel(`orders:catalog:${catalogId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "commerce",
            table: "orders",
            filter: `catalog_id=eq.${catalogId}`,
          },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "commerce",
            table: "fulfillments",
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const audio = audioRef.current;
              if (audio) {
                audio.currentTime = 0;
                void audio.play().catch(() => {});
              }
            }
            router.refresh();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channelRef) void supabase.removeChannel(channelRef);
    };
  }, [catalogId, router]);

  const counts = useMemo(() => {
    const acc = { all: rows.length, open: 0, completed: 0, canceled: 0 };
    for (const row of rows) {
      if (row.state in acc) {
        acc[row.state as keyof typeof acc] += 1;
      }
    }
    return acc;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (tab === "all") return rows;
    return rows.filter((row) => row.state === tab);
  }, [rows, tab]);

  return (
    <main className="w-full">
      <audio
        ref={audioRef}
        src={NEW_ORDER_SOUND_SRC}
        preload="auto"
        aria-hidden
      />
      <div className="w-full border-b">
        <div className="mx-auto flex h-[120px] max-w-[1248px] items-center justify-between px-6">
          <div className="space-y-1">
            <h1 className="text-[32px] font-semibold tracking-tight">Orders</h1>
            <p className="text-sm text-muted-foreground">
              Live queue from the customer-facing catalog. Drafts (in-flight
              carts) are hidden.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1248px] space-y-4 px-5 py-4">
        <div className="flex w-full gap-3">
          {TABS.map((entry) => {
            const value = counts[entry.id];
            const isActive = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={cn(
                  "min-w-0 flex-1 rounded-lg border px-3 py-3 text-left transition",
                  isActive
                    ? "border-foreground/40 bg-muted/40"
                    : "border-border hover:border-foreground/30",
                )}
              >
                <div className="text-sm font-medium text-muted-foreground">
                  {entry.label}
                </div>
                <div className="mt-2 text-2xl font-semibold">{value}</div>
              </button>
            );
          })}
        </div>

        <DataTable
          columns={createOrdersColumns(currencySettings)}
          data={filteredRows}
          searchPlaceholder="Search by order reference…"
          searchColumnId="reference"
          onRowClick={(row) => setSelectedOrderId(row.id)}
        />
      </div>

      <OrderDetailSheet
        open={Boolean(selectedOrderId)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
        order={selectedOrder}
        currencySettings={currencySettings}
      />
    </main>
  );
}
