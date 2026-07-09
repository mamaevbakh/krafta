"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Package, Truck, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import type {
  DashboardMessageKey,
  TranslateFn,
} from "@/lib/locales/dashboard/messages";

import type { OrderRow } from "./orders-panel";

const MODE_LABEL_KEY: Record<NonNullable<OrderRow["mode"]>, DashboardMessageKey> = {
  dine_in: "orders.mode_dine_in",
  pickup: "orders.mode_pickup",
  delivery: "orders.mode_delivery",
  digital: "orders.mode_digital",
};

const MODE_ICON: Record<NonNullable<OrderRow["mode"]>, LucideIcon> = {
  dine_in: Utensils,
  pickup: Package,
  delivery: Truck,
  // Reuse Package for digital until that mode actually ships.
  digital: Package,
};

export function createOrdersColumns(
  currencySettings: CurrencySettings,
  t: TranslateFn,
): ColumnDef<OrderRow>[] {
  return [
    {
      accessorKey: "reference",
      header: t("orders.col_order"),
      cell: ({ row }) => {
        const ref = row.getValue<string>("reference");
        const ticket = row.original.ticketName;
        return (
          <div className="flex flex-col">
            <span className="font-mono text-sm font-medium text-foreground">
              {ref}
            </span>
            {ticket ? (
              <span className="text-xs text-muted-foreground">{ticket}</span>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: t("orders.col_when"),
      cell: ({ row }) => {
        const iso = row.getValue<string>("createdAt");
        return (
          <span className="text-sm text-muted-foreground">
            {formatRelative(iso)}
          </span>
        );
      },
    },
    {
      accessorKey: "mode",
      header: t("orders.col_mode"),
      cell: ({ row }) => {
        const mode = row.getValue<OrderRow["mode"]>("mode");
        if (!mode) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const Icon = MODE_ICON[mode];
        return (
          <span className="inline-flex items-center gap-2 text-sm text-foreground">
            <Icon aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
            {t(MODE_LABEL_KEY[mode])}
          </span>
        );
      },
    },
    {
      accessorKey: "customerLabel",
      header: t("orders.col_customer"),
      cell: ({ row }) => (
        <span className="truncate text-sm text-foreground">
          {row.getValue<string>("customerLabel")}
        </span>
      ),
    },
    {
      accessorKey: "itemCount",
      header: t("orders.col_items"),
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-foreground">
          {row.getValue<number>("itemCount")}
        </span>
      ),
    },
    {
      accessorKey: "totalCents",
      header: () => <div className="text-right">{t("orders.col_total")}</div>,
      cell: ({ row }) => (
        <div className="text-right text-sm font-medium tabular-nums text-foreground">
          {formatPriceCents(row.getValue<number>("totalCents"), currencySettings)}
        </div>
      ),
    },
    {
      accessorKey: "state",
      header: t("orders.col_state"),
      cell: ({ row }) => {
        const state = row.getValue<OrderRow["state"]>("state");
        const fulfillmentState = row.original.fulfillmentState;
        return (
          <StateBadge
            state={state}
            fulfillmentState={fulfillmentState}
            t={t}
          />
        );
      },
    },
  ];
}

function StateBadge({
  state,
  fulfillmentState,
  t,
}: {
  state: OrderRow["state"];
  fulfillmentState: OrderRow["fulfillmentState"];
  t: TranslateFn;
}) {
  if (state === "completed") {
    return <Badge variant="secondary">{t("orders.status_completed")}</Badge>;
  }
  if (state === "canceled") {
    return <Badge variant="outline">{t("orders.status_canceled")}</Badge>;
  }
  if (state === "draft") {
    return <Badge variant="outline">{t("orders.status_draft")}</Badge>;
  }
  // open: surface fulfillment state if available
  const label = fulfillmentState
    ? t(FULFILLMENT_LABEL_KEY[fulfillmentState])
    : t("orders.status_open");
  return <Badge>{label}</Badge>;
}

const FULFILLMENT_LABEL_KEY: Record<
  NonNullable<OrderRow["fulfillmentState"]>,
  DashboardMessageKey
> = {
  proposed: "orders.status_new",
  reserved: "orders.status_accepted",
  prepared: "orders.status_ready",
  completed: "orders.status_completed",
  canceled: "orders.status_canceled",
  failed: "orders.status_failed",
};

// ---- helpers ---------------------------------------------------------------

const RTF =
  typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl
    ? new Intl.RelativeTimeFormat("en", { numeric: "auto" })
    : null;

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const seconds = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (!RTF) return iso;
  if (abs < 60) return RTF.format(seconds, "second");
  if (abs < 3600) return RTF.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(seconds / 3600), "hour");
  return RTF.format(Math.round(seconds / 86400), "day");
}
