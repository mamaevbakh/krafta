"use client";

import { useState, useTransition } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  CircleDollarSign,
  MapPin,
  Package,
  Receipt,
  Truck,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { useT } from "@/lib/locales/dashboard/context";
import type { DashboardMessageKey } from "@/lib/locales/dashboard/messages";

import {
  markCashPaymentReceived,
  transitionOrderState,
  type OrderAction,
} from "./actions";
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
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/60 px-6 pb-4 pt-6">
          <SheetTitle>
            {order
              ? t("orders.detail_title", { reference: order.reference })
              : t("orders.detail_title_empty")}
          </SheetTitle>
          <SheetDescription>
            {order
              ? formatLongDateTime(order.createdAt)
              : t("orders.detail_empty_hint")}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 px-6 py-5">
            {!order ? (
              <p className="text-sm text-muted-foreground">
                {t("orders.detail_unavailable")}
              </p>
            ) : (
              <>
                <StatusRow order={order} />

                <ActionsBlock order={order} />

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

                <PaymentBlock
                  order={order}
                  currencySettings={currencySettings}
                />

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

function ActionsBlock({ order }: { order: OrderRow }) {
  const t = useT();
  const params = useParams<{ orgSlug: string; catalogSlug: string }>();
  const catalogPath = `/${params.catalogSlug}`;
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  // Hide the action panel for terminal-state orders. The badges already
  // tell the merchant the order is settled; nothing left to do here.
  if (order.state === "completed" || order.state === "canceled") return null;
  if (!order.fulfillmentId) return null;

  const fulfillmentId = order.fulfillmentId;
  const ff = order.fulfillmentState;

  const fire = (action: OrderAction, cancelReason?: string) =>
    startTransition(async () => {
      const result = await transitionOrderState({
        orderId: order.id,
        fulfillmentId,
        action,
        cancelReason,
        catalogPath,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Realtime will refresh router state automatically; no manual call.
    });

  // Action availability per current fulfillment state. Mirrors the
  // server-side state machine in actions.ts.
  // Dine-in skips the "ready" stage — there is no counter to make ready
  // for; the server brings food straight to the table. Pickup and
  // delivery use the full ladder.
  const canAccept = ff === "proposed";
  const isDineIn = order.mode === "dine_in";
  const canMarkReady =
    !isDineIn && (ff === "proposed" || ff === "reserved");
  const canMarkCompleted = ff === "reserved" || ff === "prepared" ||
    // Dine-in can close the bill straight from accepted, no ready stage.
    (isDineIn && ff === "proposed");

  const completeLabel =
    order.mode === "delivery"
      ? t("orders.action_mark_delivered")
      : order.mode === "pickup"
        ? t("orders.action_mark_picked_up")
        : t("orders.action_close_bill");

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {t("orders.actions_label")}
      </div>
      <div className="flex flex-wrap gap-2">
        {canAccept ? (
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => fire("accept")}
          >
            {t("orders.action_accept")}
          </Button>
        ) : null}
        {canMarkReady ? (
          <Button
            type="button"
            size="sm"
            variant={canAccept ? "outline" : "default"}
            disabled={isPending}
            onClick={() => fire("mark_ready")}
          >
            {t("orders.action_mark_ready")}
          </Button>
        ) : null}
        {canMarkCompleted ? (
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => fire("mark_completed")}
          >
            {completeLabel}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={isPending}
          onClick={() => setCancelOpen(true)}
        >
          {t("common.cancel")}
        </Button>
      </div>

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        isPending={isPending}
        onConfirm={(reason) => {
          setCancelOpen(false);
          fire("cancel", reason || undefined);
        }}
      />
    </div>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  isPending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("orders.cancel_title")}</DialogTitle>
          <DialogDescription>
            {t("orders.cancel_description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("orders.cancel_reason_placeholder")}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t("orders.cancel_keep")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => onConfirm(reason.trim())}
          >
            {t("orders.cancel_confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DineInDetails({ details }: { details: OrderDineInDetails }) {
  const t = useT();
  return (
    <SectionCard title={t("orders.mode_dine_in")} icon={Utensils}>
      <DetailLine
        label={t("orders.detail_table")}
        value={t("orders.detail_table_value", { label: details.table_label })}
      />
      {details.party_size ? (
        <DetailLine
          label={t("orders.detail_party_size")}
          value={String(details.party_size)}
        />
      ) : null}
      {details.course_number ? (
        <DetailLine
          label={t("orders.detail_course")}
          value={String(details.course_number)}
        />
      ) : null}
    </SectionCard>
  );
}

function PickupDetails({ details }: { details: OrderPickupDetails }) {
  const t = useT();
  const when =
    details.schedule_type === "scheduled" && details.pickup_at
      ? formatLongDateTime(details.pickup_at)
      : t("orders.pickup_asap");
  return (
    <SectionCard title={t("orders.mode_pickup")} icon={Package}>
      <DetailLine label={t("orders.detail_when")} value={when} />
      {details.recipient_name ? (
        <DetailLine
          label={t("orders.detail_name")}
          value={details.recipient_name}
        />
      ) : null}
      {details.recipient_phone ? (
        <DetailLine
          label={t("orders.detail_phone")}
          value={details.recipient_phone}
        />
      ) : null}
      {details.note ? (
        <DetailLine label={t("orders.detail_note")} value={details.note} multiline />
      ) : null}
      {details.is_curbside ? (
        <DetailLine label={t("orders.detail_curbside")} value={t("common.yes")} />
      ) : null}
      <TimestampLadder
        entries={[
          [t("orders.ts_placed"), details.placed_at],
          [t("orders.ts_accepted"), details.accepted_at],
          [t("orders.ts_ready"), details.ready_at],
          [t("orders.ts_picked_up"), details.picked_up_at],
          [t("orders.ts_canceled"), details.canceled_at],
        ]}
      />
    </SectionCard>
  );
}

function DeliveryDetails({ details }: { details: OrderDeliveryDetails }) {
  const t = useT();
  const addressLine = formatAddress(details.address);
  const when = details.scheduled_for
    ? formatLongDateTime(details.scheduled_for)
    : t("orders.delivery_asap");
  return (
    <SectionCard title={t("orders.mode_delivery")} icon={Truck}>
      <DetailLine label={t("orders.detail_when")} value={when} />
      <DetailLine label={t("orders.detail_address")} value={addressLine} multiline />
      <DetailLine
        label={t("orders.detail_recipient")}
        value={details.recipient_name}
      />
      <DetailLine label={t("orders.detail_phone")} value={details.recipient_phone} />
      {details.delivery_provider ? (
        <DetailLine
          label={t("orders.detail_provider")}
          value={details.delivery_provider}
        />
      ) : null}
      {details.note ? (
        <DetailLine label={t("orders.detail_note")} value={details.note} multiline />
      ) : null}
      <TimestampLadder
        entries={[
          [t("orders.ts_placed"), details.placed_at],
          [t("orders.ts_accepted"), details.accepted_at],
          [t("orders.ts_courier_assigned"), details.courier_assigned_at],
          [t("orders.ts_picked_up"), details.picked_up_at],
          [t("orders.ts_delivered"), details.delivered_at],
          [t("orders.ts_canceled"), details.canceled_at],
        ]}
      />
    </SectionCard>
  );
}

function CustomerBlock({ order }: { order: OrderRow }) {
  const t = useT();
  return (
    <SectionCard title={t("orders.section_customer")} icon={Receipt}>
      <DetailLine label={t("orders.detail_name")} value={order.customerLabel} />
      {order.customer?.email ? (
        <DetailLine label={t("orders.detail_email")} value={order.customer.email} />
      ) : null}
      {order.customer?.phone &&
      order.customer.phone !== order.customerLabel ? (
        <DetailLine label={t("orders.detail_phone")} value={order.customer.phone} />
      ) : null}
      <DetailLine
        label={t("orders.detail_source")}
        value={t(SOURCE_LABEL_KEY[order.source])}
      />
    </SectionCard>
  );
}

function PaymentBlock({
  order,
  currencySettings,
}: {
  order: OrderRow;
  currencySettings: CurrencySettings;
}) {
  const t = useT();
  const params = useParams<{ catalogSlug: string }>();
  const catalogPath = `/${params.catalogSlug}`;
  const [isPending, startTransition] = useTransition();

  const completedCash = order.payments.find(
    (payment) =>
      payment.sourceType === "cash" && payment.status === "completed",
  );

  const totalCents = order.totalCents;
  const currency =
    completedCash?.currency ??
    (currencySettings.defaultCurrency || "UZS");

  const payAt = t(PAY_AT_LABEL_KEY[order.mode ?? "pickup"]);

  const onMarkReceived = () =>
    startTransition(async () => {
      const result = await markCashPaymentReceived({
        orderId: order.id,
        totalCents,
        currency,
        catalogPath,
      });
      if (!result.ok) toast.error(result.error);
    });

  return (
    <SectionCard title={t("orders.section_payment")} icon={CircleDollarSign}>
      <DetailLine
        label={t("orders.detail_method")}
        value={
          completedCash
            ? t("orders.payment_cash_collected")
            : t("orders.payment_cash_pay_at", { location: payAt })
        }
      />
      <DetailLine
        label={t("orders.detail_amount")}
        value={formatPriceCents(totalCents, currencySettings)}
      />
      {completedCash?.completedAt ? (
        <DetailLine
          label={t("orders.detail_collected")}
          value={formatLongDateTime(completedCash.completedAt)}
        />
      ) : null}
      {completedCash ? (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3 w-3" aria-hidden />{" "}
          {t("orders.payment_cash_recorded")}
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          className="mt-2 w-full"
          disabled={isPending}
          onClick={onMarkReceived}
        >
          {t("orders.payment_mark_collected")}
        </Button>
      )}
    </SectionCard>
  );
}

const PAY_AT_LABEL_KEY: Record<
  NonNullable<OrderRow["mode"]> | "pickup",
  DashboardMessageKey
> = {
  dine_in: "orders.pay_at_table",
  pickup: "orders.pay_at_counter",
  delivery: "orders.pay_at_delivery",
  digital: "orders.pay_at_counter",
};

function ItemsBlock({
  order,
  currencySettings,
}: {
  order: OrderRow;
  currencySettings: CurrencySettings;
}) {
  const t = useT();
  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="px-4 pb-2 pt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {t("orders.section_items")}
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
        <span className="text-muted-foreground">{t("orders.subtotal")}</span>
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
  digital: Package,
};

const SOURCE_LABEL_KEY: Record<OrderRow["source"], DashboardMessageKey> = {
  web: "orders.source_web",
  tma: "orders.source_tma",
  qr_scan: "orders.source_qr_scan",
  dashboard: "orders.source_dashboard",
};

function ModeBadge({ mode }: { mode: OrderRow["mode"] }) {
  const t = useT();
  if (!mode) return null;
  const Icon = MODE_ICON[mode];
  return (
    <Badge variant="secondary" className="gap-1.5">
      <Icon className="h-3 w-3" aria-hidden />
      {t(MODE_LABEL_KEY[mode])}
    </Badge>
  );
}

function StateBadge({ order }: { order: OrderRow }) {
  const t = useT();
  if (order.state === "completed") return <Badge>{t("orders.status_completed")}</Badge>;
  if (order.state === "canceled")
    return <Badge variant="outline">{t("orders.status_canceled")}</Badge>;
  if (order.state === "draft")
    return <Badge variant="outline">{t("orders.status_draft")}</Badge>;
  // open: surface fulfillment.state
  const label = order.fulfillmentState
    ? t(FULFILLMENT_LABEL_KEY[order.fulfillmentState])
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
