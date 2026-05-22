"use client";

import {
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  Receipt,
  Truck,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  type CurrencySettings,
  defaultCurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";

import { useCart, type PlacedOrderSnapshot } from "./cart-provider";

type CartPlacedStepProps = {
  currencySettings?: CurrencySettings;
};

export function CartPlacedStep({
  currencySettings = defaultCurrencySettings,
}: CartPlacedStepProps) {
  const { close, placedOrder, placedOrderId } = useCart();

  // Defensive empty state — should not normally render without a snapshot.
  if (!placedOrder) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <DrawerTitle className="sr-only">Order placed</DrawerTitle>
        <DrawerDescription className="sr-only">
          Confirmation that the order has been submitted.
        </DrawerDescription>
        <CheckCircle2 className="h-12 w-12 text-foreground" aria-hidden />
        <h2 className="text-2xl font-semibold tracking-tight">Order placed</h2>
        {placedOrderId ? (
          <p className="text-xs text-muted-foreground">
            Reference: {placedOrderId.slice(0, 8)}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="mt-4 w-full max-w-xs"
          onClick={close}
        >
          Done
        </Button>
      </div>
    );
  }

  const { tagline, hint } = describePlacedOrder(placedOrder);

  return (
    <div className="flex h-full flex-col">
      <DrawerTitle className="sr-only">Order placed</DrawerTitle>
      <DrawerDescription className="sr-only">{tagline}</DrawerDescription>
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="space-y-6 px-5 pb-4 pt-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-foreground" aria-hidden />
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Order placed
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
            </div>
          </div>

          <ModeDetails snapshot={placedOrder} />

          <SummaryBlock
            snapshot={placedOrder}
            currencySettings={currencySettings}
          />

          {hint ? (
            <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}

          <p className="text-center text-xs text-muted-foreground">
            Order #{placedOrder.orderId.slice(0, 8)}
          </p>
        </div>
      </ScrollArea>

      <div className="border-t border-border/60 px-4 pb-6 pt-4">
        <Button type="button" size="lg" className="w-full" onClick={close}>
          Done
        </Button>
      </div>
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------

function describePlacedOrder(snapshot: PlacedOrderSnapshot): {
  tagline: string;
  hint: string | null;
} {
  if (snapshot.mode === "dine_in") {
    return {
      tagline: `We sent it to the kitchen — Table ${snapshot.fields.tableLabel}.`,
      hint: "Pay at the table when your server brings the bill.",
    };
  }
  if (snapshot.mode === "pickup") {
    if (snapshot.fields.scheduleType === "scheduled" && snapshot.fields.pickupAt) {
      return {
        tagline: `Pickup at ${formatScheduledTime(snapshot.fields.pickupAt)}.`,
        hint: "Pay at the counter when you collect.",
      };
    }
    return {
      tagline: "We'll have it ready at the counter shortly.",
      hint: "Pay at the counter when you collect.",
    };
  }
  // delivery
  if (snapshot.fields.scheduledFor) {
    return {
      tagline: `Scheduled for ${formatScheduledTime(snapshot.fields.scheduledFor)}.`,
      hint: "Pay the courier on arrival.",
    };
  }
  return {
    tagline: "Out for delivery.",
    hint: "Pay the courier on arrival.",
  };
}

function formatScheduledTime(isoLocal: string): string {
  // <Input type="datetime-local"> emits values like "2026-05-07T19:30".
  // Display as locale-formatted time without timezone gymnastics.
  const [date, time] = isoLocal.split("T");
  if (!date || !time) return isoLocal;
  return `${date} ${time}`;
}

function ModeDetails({ snapshot }: { snapshot: PlacedOrderSnapshot }) {
  if (snapshot.mode === "dine_in") {
    return (
      <DetailRow
        icon={Utensils}
        primary={`Table ${snapshot.fields.tableLabel}`}
        secondary="Dine-in"
      />
    );
  }
  if (snapshot.mode === "pickup") {
    return (
      <div className="space-y-2">
        <DetailRow
          icon={Package}
          primary={
            snapshot.fields.scheduleType === "scheduled" &&
            snapshot.fields.pickupAt
              ? `Pickup at ${formatScheduledTime(snapshot.fields.pickupAt)}`
              : "Pickup as soon as ready"
          }
          secondary="Pickup"
        />
        {snapshot.fields.recipientName || snapshot.fields.recipientPhone ? (
          <DetailRow
            icon={Receipt}
            primary={
              [snapshot.fields.recipientName, snapshot.fields.recipientPhone]
                .filter(Boolean)
                .join(" · ") || "Anonymous"
            }
            secondary="For"
          />
        ) : null}
      </div>
    );
  }
  // delivery
  return (
    <div className="space-y-2">
      <DetailRow
        icon={MapPin}
        primary={snapshot.fields.address}
        secondary="Delivery to"
      />
      <DetailRow
        icon={Receipt}
        primary={`${snapshot.fields.recipientName} · ${snapshot.fields.recipientPhone}`}
        secondary="Recipient"
      />
      {snapshot.fields.scheduledFor ? (
        <DetailRow
          icon={Clock}
          primary={formatScheduledTime(snapshot.fields.scheduledFor)}
          secondary="Scheduled"
        />
      ) : (
        <DetailRow icon={Truck} primary="As soon as possible" secondary="When" />
      )}
    </div>
  );
}

function DetailRow({
  icon: Icon,
  primary,
  secondary,
}: {
  icon: LucideIcon;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {secondary}
        </div>
        <div className="mt-0.5 truncate text-sm font-medium text-foreground">
          {primary}
        </div>
      </div>
    </div>
  );
}

function SummaryBlock({
  snapshot,
  currencySettings,
}: {
  snapshot: PlacedOrderSnapshot;
  currencySettings: CurrencySettings;
}) {
  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="px-4 pb-2 pt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Items
      </div>
      <ul className="divide-y divide-border/60 px-4">
        {snapshot.lineItems.map((line) => (
          <li
            key={line.id}
            className="flex items-baseline justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-foreground">
              {line.quantity} × {line.name}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-foreground">
              {formatPriceCents(line.total_price_cents, currencySettings)}
            </span>
          </li>
        ))}
      </ul>
      <Separator />
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-mono text-base font-semibold tabular-nums text-foreground">
          {formatPriceCents(snapshot.subtotalCents, currencySettings)}
        </span>
      </div>
    </div>
  );
}
