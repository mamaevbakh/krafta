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
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import {
  getStorefrontMessage,
  type StorefrontMessageKey,
} from "@/lib/locales/messages";

import { useCart, type PlacedOrderSnapshot } from "./cart-provider";

type CartPlacedStepProps = {
  currencySettings?: CurrencySettings;
};

export function CartPlacedStep({
  currencySettings = defaultCurrencySettings,
}: CartPlacedStepProps) {
  const { close, placedOrder, placedOrderId, setStep } = useCart();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (
    key: StorefrontMessageKey,
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });

  // Defensive empty state — should not normally render without a snapshot.
  if (!placedOrder) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <DrawerTitle className="sr-only">{t("placed.title")}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {t("placed.title")}
        </DrawerDescription>
        <CheckCircle2 className="h-12 w-12 text-foreground" aria-hidden />
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("placed.title")}
        </h2>
        {placedOrderId ? (
          <p className="text-xs text-muted-foreground">
            #{placedOrderId.slice(0, 8)}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="mt-4 w-full max-w-xs"
          onClick={close}
        >
          {t("placed.done")}
        </Button>
      </div>
    );
  }

  const { tagline, hint } = describePlacedOrder(placedOrder, t);

  return (
    // aria-live="polite" + role="status" so a screen reader announces
    // the confirmation as soon as the drawer transitions to placed
    // (otherwise the page silently swaps content under the user). The
    // visible UI is unchanged.
    <div className="flex h-full flex-col" role="status" aria-live="polite">
      <DrawerTitle className="sr-only">{t("placed.title")}</DrawerTitle>
      <DrawerDescription className="sr-only">{tagline}</DrawerDescription>
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="space-y-6 px-5 pb-4 pt-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-foreground" aria-hidden />
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {t("placed.title")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
            </div>
          </div>

          <ModeDetails snapshot={placedOrder} t={t} />

          <SummaryBlock
            snapshot={placedOrder}
            currencySettings={currencySettings}
            t={t}
          />

          {hint ? (
            <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}

          <p className="text-center text-xs text-muted-foreground">
            #{placedOrder.orderId.slice(0, 8)}
          </p>
        </div>
      </ScrollArea>

      <div className="flex gap-2 border-t border-border/60 px-4 pb-6 pt-4">
        {/* Order more: keeps the drawer open and bounces back to the
            cart-list step. The cart is already empty (placeOrder cleared
            it locally + the server promoted the draft to 'open'), so the
            customer lands on the empty-state hint and can start a new
            order. Dine-in lock survives via sessionStorage, so the next
            Place button still pre-fills the same table. */}
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="flex-1"
          onClick={() => setStep("cart")}
        >
          {t("placed.order_more")}
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-1"
          onClick={close}
        >
          {t("placed.done")}
        </Button>
      </div>
    </div>
  );
}

type Translator = (
  key: StorefrontMessageKey,
  vars?: Record<string, string | number>,
) => string;

// ---- helpers ---------------------------------------------------------------

function describePlacedOrder(
  snapshot: PlacedOrderSnapshot,
  t: Translator,
): {
  tagline: string;
  hint: string | null;
} {
  if (snapshot.mode === "dine_in") {
    return {
      tagline: t("placed.subtitle.dine_in", {
        table: snapshot.fields.tableLabel,
      }),
      hint: t("placed.pay.dine_in"),
    };
  }
  if (snapshot.mode === "pickup") {
    if (snapshot.fields.scheduleType === "scheduled" && snapshot.fields.pickupAt) {
      return {
        tagline: t("placed.scheduled_for", {
          time: formatScheduledTime(snapshot.fields.pickupAt),
        }),
        hint: t("placed.pay.pickup"),
      };
    }
    return {
      tagline: t("placed.subtitle.pickup"),
      hint: t("placed.pay.pickup"),
    };
  }
  // delivery
  if (snapshot.fields.scheduledFor) {
    return {
      tagline: t("placed.scheduled_for", {
        time: formatScheduledTime(snapshot.fields.scheduledFor),
      }),
      hint: t("placed.pay.delivery"),
    };
  }
  return {
    tagline: t("placed.subtitle.delivery"),
    hint: t("placed.pay.delivery"),
  };
}

function formatScheduledTime(isoLocal: string): string {
  // <Input type="datetime-local"> emits values like "2026-05-07T19:30".
  // Display as locale-formatted time without timezone gymnastics.
  const [date, time] = isoLocal.split("T");
  if (!date || !time) return isoLocal;
  return `${date} ${time}`;
}

function ModeDetails({
  snapshot,
  t,
}: {
  snapshot: PlacedOrderSnapshot;
  t: Translator;
}) {
  if (snapshot.mode === "dine_in") {
    return (
      <DetailRow
        icon={Utensils}
        primary={`${t("checkout.table.label")} ${snapshot.fields.tableLabel}`}
        secondary={t("checkout.mode.dine_in")}
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
              ? t("placed.scheduled_for", {
                  time: formatScheduledTime(snapshot.fields.pickupAt),
                })
              : t("checkout.schedule.asap")
          }
          secondary={t("checkout.mode.pickup")}
        />
        {snapshot.fields.recipientName || snapshot.fields.recipientPhone ? (
          <DetailRow
            icon={Receipt}
            primary={
              [snapshot.fields.recipientName, snapshot.fields.recipientPhone]
                .filter(Boolean)
                .join(" · ") ||
              t("checkout.recipient.label")
            }
            secondary={t("checkout.recipient.label")}
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
        secondary={t("checkout.address.label")}
      />
      <DetailRow
        icon={Receipt}
        primary={`${snapshot.fields.recipientName} · ${snapshot.fields.recipientPhone}`}
        secondary={t("checkout.recipient.label")}
      />
      {snapshot.fields.scheduledFor ? (
        <DetailRow
          icon={Clock}
          primary={formatScheduledTime(snapshot.fields.scheduledFor)}
          secondary={t("checkout.schedule.scheduled")}
        />
      ) : (
        <DetailRow
          icon={Truck}
          primary={t("checkout.schedule.asap")}
          secondary={t("checkout.schedule.when")}
        />
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
  t,
}: {
  snapshot: PlacedOrderSnapshot;
  currencySettings: CurrencySettings;
  t: Translator;
}) {
  const tipCents = snapshot.tipCents ?? 0;
  // Tip echoes back only when the customer actually left one. Showing
  // a "Tip — 0" line on a no-tip order would feel like a prompt for
  // doubt at exactly the wrong moment (right after they paid).
  const showTip = tipCents > 0;
  const totalCents = snapshot.subtotalCents + tipCents;
  return (
    <div className="rounded-xl border border-border bg-background">
      <ul className="divide-y divide-border/60 px-4 pt-2">
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
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <span className="text-muted-foreground">{t("cart.subtotal")}</span>
        <span className="font-mono tabular-nums text-foreground">
          {formatPriceCents(snapshot.subtotalCents, currencySettings)}
        </span>
      </div>
      {showTip ? (
        <div className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="text-muted-foreground">{t("cart.tip")}</span>
          <span className="font-mono tabular-nums text-foreground">
            {formatPriceCents(tipCents, currencySettings)}
          </span>
        </div>
      ) : null}
      <Separator />
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span className="text-muted-foreground">{t("cart.total")}</span>
        <span className="font-mono text-base font-semibold tabular-nums text-foreground">
          {formatPriceCents(totalCents, currencySettings)}
        </span>
      </div>
    </div>
  );
}
