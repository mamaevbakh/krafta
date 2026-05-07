"use client";

import {
  Clock,
  MapPin,
  Package,
  Receipt,
  Truck,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";

import type {
  OrderDeliveryDetails,
  OrderDineInDetails,
  OrderPickupDetails,
  OrderRow,
} from "./orders-panel";

type OrderDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderRow | null;
  currencySettings: CurrencySettings;
};

export function OrderDetailSheet({
  open,
  onOpenChange,
  order,
  currencySettings,
}: OrderDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60 px-6 pb-4 pt-6">
          <SheetTitle>
            {order ? `Order ${order.reference}` : "Order"}
          </SheetTitle>
          <SheetDescription>
            {order
              ? formatLongDateTime(order.createdAt)
              : "Pick an order from the list to see its details."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 px-6 py-5">
            {!order ? (
              <p className="text-sm text-muted-foreground">
                This order is no longer available.
              </p>
            ) : (
              <>
                <StatusRow order={order} />

                {order.mode === "dine_in" && order.dineIn ? (
                  <DineInDetails details={order.dineIn} />
                ) : null}
                {order.mode === "pickup" && order.pickup ? (
                  <PickupDetails details={order.pickup} />
                ) : null}
                {order.mode === "delivery" && order.delivery ? (
                  <DeliveryDetails details={order.delivery} />
                ) : null}

                <CustomerBlock order={order} />

                <ItemsBlock
                  order={order}
                  currencySettings={currencySettings}
                />
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ---- subsections -----------------------------------------------------------

function StatusRow({ order }: { order: OrderRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ModeBadge mode={order.mode} />
      <StateBadge order={order} />
      {order.ticketName ? (
        <Badge variant="outline" className="text-muted-foreground">
          {order.ticketName}
        </Badge>
      ) : null}
    </div>
  );
}

function DineInDetails({ details }: { details: OrderDineInDetails }) {
  return (
    <SectionCard title="Dine-in" icon={Utensils}>
      <DetailLine label="Table" value={`Table ${details.table_label}`} />
      {details.party_size ? (
        <DetailLine label="Party size" value={String(details.party_size)} />
      ) : null}
      {details.course_number ? (
        <DetailLine label="Course" value={String(details.course_number)} />
      ) : null}
    </SectionCard>
  );
}

function PickupDetails({ details }: { details: OrderPickupDetails }) {
  const when =
    details.schedule_type === "scheduled" && details.pickup_at
      ? formatLongDateTime(details.pickup_at)
      : "As soon as ready";
  return (
    <SectionCard title="Pickup" icon={Package}>
      <DetailLine label="When" value={when} />
      {details.recipient_name ? (
        <DetailLine label="Name" value={details.recipient_name} />
      ) : null}
      {details.recipient_phone ? (
        <DetailLine label="Phone" value={details.recipient_phone} />
      ) : null}
      {details.note ? (
        <DetailLine label="Note" value={details.note} multiline />
      ) : null}
      {details.is_curbside ? (
        <DetailLine label="Curbside" value="Yes" />
      ) : null}
      <TimestampLadder
        entries={[
          ["Placed", details.placed_at],
          ["Accepted", details.accepted_at],
          ["Ready", details.ready_at],
          ["Picked up", details.picked_up_at],
          ["Canceled", details.canceled_at],
        ]}
      />
    </SectionCard>
  );
}

function DeliveryDetails({ details }: { details: OrderDeliveryDetails }) {
  const addressLine = formatAddress(details.address);
  const when = details.scheduled_for
    ? formatLongDateTime(details.scheduled_for)
    : "As soon as possible";
  return (
    <SectionCard title="Delivery" icon={Truck}>
      <DetailLine label="When" value={when} />
      <DetailLine label="Address" value={addressLine} multiline />
      <DetailLine label="Recipient" value={details.recipient_name} />
      <DetailLine label="Phone" value={details.recipient_phone} />
      {details.delivery_provider ? (
        <DetailLine label="Provider" value={details.delivery_provider} />
      ) : null}
      {details.note ? (
        <DetailLine label="Note" value={details.note} multiline />
      ) : null}
      <TimestampLadder
        entries={[
          ["Placed", details.placed_at],
          ["Accepted", details.accepted_at],
          ["Courier assigned", details.courier_assigned_at],
          ["Picked up", details.picked_up_at],
          ["Delivered", details.delivered_at],
          ["Canceled", details.canceled_at],
        ]}
      />
    </SectionCard>
  );
}

function CustomerBlock({ order }: { order: OrderRow }) {
  return (
    <SectionCard title="Customer" icon={Receipt}>
      <DetailLine label="Name" value={order.customerLabel} />
      {order.customer?.email ? (
        <DetailLine label="Email" value={order.customer.email} />
      ) : null}
      {order.customer?.phone &&
      order.customer.phone !== order.customerLabel ? (
        <DetailLine label="Phone" value={order.customer.phone} />
      ) : null}
      <DetailLine label="Source" value={SOURCE_LABEL[order.source]} />
    </SectionCard>
  );
}

function ItemsBlock({
  order,
  currencySettings,
}: {
  order: OrderRow;
  currencySettings: CurrencySettings;
}) {
  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="px-4 pb-2 pt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Items
      </div>
      <ul className="divide-y divide-border/60 px-4">
        {order.lineItems.map((line) => (
          <li
            key={line.id}
            className="flex items-baseline justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 text-foreground">
              <span className="font-medium tabular-nums">{line.quantity}×</span>{" "}
              <span className="truncate">{line.name}</span>
              {line.variationName && line.variationName !== "Default" ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({line.variationName})
                </span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">
              {formatPriceCents(line.totalPriceCents, currencySettings)}
            </span>
          </li>
        ))}
      </ul>
      <Separator />
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="text-base font-semibold tabular-nums text-foreground">
          {formatPriceCents(order.totalCents, currencySettings)}
        </span>
      </div>
    </div>
  );
}

// ---- primitives ------------------------------------------------------------

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
      </div>
      <div className="space-y-1.5 px-4 pb-3">{children}</div>
    </div>
  );
}

function DetailLine({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={
          multiline
            ? "max-w-[60%] whitespace-pre-wrap text-right text-foreground"
            : "max-w-[60%] truncate text-right text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

function TimestampLadder({
  entries,
}: {
  entries: Array<[string, string | null]>;
}) {
  const populated = entries.filter(([, value]) => Boolean(value));
  if (populated.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
      {populated.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between text-xs text-muted-foreground"
        >
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" aria-hidden />
            {label}
          </span>
          <span className="tabular-nums">
            {value ? formatLongDateTime(value) : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- shared bits -----------------------------------------------------------

const MODE_LABEL: Record<NonNullable<OrderRow["mode"]>, string> = {
  dine_in: "Dine-in",
  pickup: "Pickup",
  delivery: "Delivery",
  digital: "Digital",
};

const MODE_ICON: Record<NonNullable<OrderRow["mode"]>, LucideIcon> = {
  dine_in: Utensils,
  pickup: Package,
  delivery: Truck,
  digital: Package,
};

const SOURCE_LABEL: Record<OrderRow["source"], string> = {
  web: "Web",
  tma: "Telegram",
  qr_scan: "QR scan",
  dashboard: "Dashboard",
};

function ModeBadge({ mode }: { mode: OrderRow["mode"] }) {
  if (!mode) return null;
  const Icon = MODE_ICON[mode];
  return (
    <Badge variant="secondary" className="gap-1.5">
      <Icon className="h-3 w-3" aria-hidden />
      {MODE_LABEL[mode]}
    </Badge>
  );
}

function StateBadge({ order }: { order: OrderRow }) {
  if (order.state === "completed") return <Badge>Completed</Badge>;
  if (order.state === "canceled")
    return <Badge variant="outline">Canceled</Badge>;
  if (order.state === "draft") return <Badge variant="outline">Draft</Badge>;
  // open: surface fulfillment.state
  const label = order.fulfillmentState
    ? FULFILLMENT_LABEL[order.fulfillmentState]
    : "Open";
  return <Badge>{label}</Badge>;
}

const FULFILLMENT_LABEL: Record<NonNullable<OrderRow["fulfillmentState"]>, string> = {
  proposed: "New",
  reserved: "Accepted",
  prepared: "Ready",
  completed: "Completed",
  canceled: "Canceled",
  failed: "Failed",
};

// ---- helpers ---------------------------------------------------------------

function formatLongDateTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatAddress(address: Record<string, unknown> | null): string {
  if (!address) return "—";
  if (typeof address.freeform === "string") return address.freeform;
  // Fallback: stringify a stable subset of common fields.
  const parts = [
    address.street,
    address.building,
    address.apartment,
    address.city,
    address.region,
  ]
    .filter((value): value is string => typeof value === "string" && Boolean(value));
  return parts.length > 0 ? parts.join(", ") : JSON.stringify(address);
}

// `MapPin` is used by future map preview work; keep the import alive while
// we build out the rest of KRA-32.
void MapPin;
