"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { cn } from "@/lib/utils";

import { DataTable } from "../../items/_components/data-table";
import { createOrdersColumns } from "./columns";

// Path is served from apps/krafta/public/sounds/notif.mp3
const NEW_ORDER_SOUND_SRC = "/sounds/notif.mp3";

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
  fulfillmentState:
    | "proposed"
    | "reserved"
    | "prepared"
    | "completed"
    | "canceled"
    | "failed"
    | null;
  itemCount: number;
  totalCents: number;
  customerLabel: string;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Live updates: any insert/update/delete on commerce.orders or
  // commerce.fulfillments that touches this catalog triggers a refresh.
  // A new fulfillment INSERT (= a customer placed an order) also rings
  // the chime — that's the cash-flow-critical signal for staff.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
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
              // Restart from 0 in case multiple events land in quick
              // succession; some browsers ignore a play() while already
              // playing the same element.
              audio.currentTime = 0;
              // Browser autoplay policies block sound until the user has
              // interacted with the page — swallow the rejection so we
              // don't surface a noisy console error every reload.
              void audio.play().catch(() => {});
            }
          }
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
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
        />
      </div>
    </main>
  );
}
