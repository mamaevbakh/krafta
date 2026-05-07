"use client";

import { useMemo, useState } from "react";

import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { cn } from "@/lib/utils";

import { DataTable } from "../../items/_components/data-table";
import { createOrdersColumns } from "./columns";

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
  rows: OrderRow[];
  currencySettings: CurrencySettings;
};

export function OrdersPanel({ rows, currencySettings }: OrdersPanelProps) {
  const [tab, setTab] = useState<StatusTab>("open");

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
