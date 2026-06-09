"use client";

import {
  Check,
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
import { cn } from "@/lib/utils";

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
      <div className="flex min-h-0 flex-1 flex-col">
        <DrawerTitle className="sr-only">{t("placed.title")}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {t("placed.title")}
        </DrawerDescription>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <SuccessMark />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">
              {t("placed.title")}
            </h2>
            {placedOrderId ? (
              <p className="font-mono text-xs text-muted-foreground">
                #{placedOrderId.slice(0, 8)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="border-t border-border bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button type="button" size="xl" className="w-full" onClick={close}>
            {t("placed.done")}
          </Button>
        </div>
      </div>
    );
  }

  const { tagline, hint } = describePlacedOrder(placedOrder, t);
  const tipCents = placedOrder.tipCents ?? 0;
  const totalCents = placedOrder.subtotalCents + tipCents;

  return (
    // aria-live="polite" + role="status" so a screen reader announces
    // the confirmation as soon as the drawer transitions to placed
    // (otherwise the page silently swaps content under the user).
    // flex-1 + min-h-0: see checkout-step.tsx note re: drawer handle
    // and flexbox min-height:auto.
    <div className="flex min-h-0 flex-1 flex-col" role="status" aria-live="polite">
      <DrawerTitle className="sr-only">{t("placed.title")}</DrawerTitle>
      <DrawerDescription className="sr-only">{tagline}</DrawerDescription>

      {/* Plain overflow-y-auto div rather than Radix ScrollArea: Radix
          sets its inner wrapper to width:fit-content, which lets an
          unbreakable child (e.g. the tagline on a narrow drawer) force
          the wrapper wider than the viewport and break truncate on the
          summary lines. mx-auto max-w-md centers the column on wider
          drawers (tablet, in-app webviews). */}
      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-6 px-5 pt-6 pb-4">
          {/* Hero: animated success mark + title + subtitle. The mark
              zooms in from 60% scale and the title slides up from 8px —
              both decelerate into rest (ease-out) per the DESIGN.md
              motion rules. Total ~350ms; long enough to register, short
              enough to not feel sluggish on a "tap and wait" flow. */}
          <div className="flex flex-col items-center gap-4 text-center">
            <SuccessMark />
            <div className="space-y-1 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t("placed.title")}
              </h2>
              <p className="text-sm text-muted-foreground">{tagline}</p>
            </div>
          </div>

          <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 delay-100 fill-mode-both">
            <ModeDetails snapshot={placedOrder} t={t} />
          </div>

          <div className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 delay-150 fill-mode-both">
            <SummaryBlock
              snapshot={placedOrder}
              currencySettings={currencySettings}
              subtotalCents={placedOrder.subtotalCents}
              tipCents={tipCents}
              totalCents={totalCents}
              t={t}
            />
          </div>

          {hint ? (
            <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-center text-xs leading-relaxed text-muted-foreground animate-in fade-in-0 duration-300 delay-200 fill-mode-both">
              {hint}
            </p>
          ) : null}

          <p className="text-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            #{placedOrder.orderId.slice(0, 8)}
          </p>
        </div>
      </div>

      {/* Sticky bottom actions with safe-area padding — same pattern as
          the cart-list and checkout steps so all three steps feel like
          one continuous surface. Inner max-w-md mirrors the scroll
          content so the buttons read at the same width on wider drawers. */}
      <div className="mx-auto flex w-full max-w-md gap-2 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {/* Order more: keeps the drawer open and bounces back to the
            cart-list step. The cart is already empty (placeOrder cleared
            it locally + the server promoted the draft to 'open'), so the
            customer lands on the empty-state hint and can start a new
            order. */}
        <Button
          type="button"
          size="xl"
          variant="outline"
          className="flex-1"
          onClick={() => setStep("cart")}
        >
          {t("placed.order_more")}
        </Button>
        <Button type="button" size="xl" className="flex-1" onClick={close}>
          {t("placed.done")}
        </Button>
      </div>
    </div>
  );
}

// Animated success badge. Outer ring + inner check stagger their entrance
// to give the moment a beat — ring lands first, then the check draws in.
// Both use Tailwind's animate-in / zoom-in utilities (from tw-animate-css)
// so we keep the motion in the same vocabulary as the rest of the system.
function SuccessMark() {
  return (
    <div
      className={cn(
        "relative grid h-16 w-16 place-items-center rounded-full",
        "border border-foreground/15 bg-foreground/[0.04]",
        "animate-in fade-in-0 zoom-in-50 duration-500 ease-out",
      )}
      aria-hidden
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-foreground text-background animate-in zoom-in-75 fade-in-0 duration-300 delay-150 fill-mode-both ease-out">
        <Check className="h-6 w-6" strokeWidth={3} />
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
        secondary={t("checkout.mode.dine_in")}
        primary={`${t("checkout.table.label")} ${snapshot.fields.tableLabel}`}
      />
    );
  }
  if (snapshot.mode === "pickup") {
    return (
      <div className="space-y-2">
        <DetailRow
          icon={Package}
          secondary={t("checkout.mode.pickup")}
          primary={
            snapshot.fields.scheduleType === "scheduled" &&
            snapshot.fields.pickupAt
              ? t("placed.scheduled_for", {
                  time: formatScheduledTime(snapshot.fields.pickupAt),
                })
              : t("checkout.schedule.asap")
          }
        />
        {snapshot.fields.recipientName || snapshot.fields.recipientPhone ? (
          <DetailRow
            icon={Receipt}
            secondary={t("checkout.recipient.label")}
            primary={
              [snapshot.fields.recipientName, snapshot.fields.recipientPhone]
                .filter(Boolean)
                .join(" · ") || t("checkout.recipient.label")
            }
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
        secondary={t("checkout.address.label")}
        primary={snapshot.fields.address}
      />
      <DetailRow
        icon={Receipt}
        secondary={t("checkout.recipient.label")}
        primary={`${snapshot.fields.recipientName} · ${snapshot.fields.recipientPhone}`}
      />
      {snapshot.fields.scheduledFor ? (
        <DetailRow
          icon={Clock}
          secondary={t("checkout.schedule.scheduled")}
          primary={formatScheduledTime(snapshot.fields.scheduledFor)}
        />
      ) : (
        <DetailRow
          icon={Truck}
          secondary={t("checkout.schedule.when")}
          primary={t("checkout.schedule.asap")}
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
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
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
  subtotalCents,
  tipCents,
  totalCents,
  t,
}: {
  snapshot: PlacedOrderSnapshot;
  currencySettings: CurrencySettings;
  subtotalCents: number;
  tipCents: number;
  totalCents: number;
  t: Translator;
}) {
  // Tip echoes back only when the customer actually left one. Showing
  // a "Tip — 0" line on a no-tip order would feel like a prompt for
  // doubt at exactly the wrong moment (right after they paid).
  const showTip = tipCents > 0;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <ul className="divide-y divide-border/60">
        {snapshot.lineItems.map((line) => (
          <li
            key={line.id}
            className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-foreground">
              <span className="font-mono tabular-nums text-muted-foreground">
                {line.quantity}×
              </span>{" "}
              {line.name}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-foreground">
              {formatPriceCents(line.total_price_cents, currencySettings)}
            </span>
          </li>
        ))}
      </ul>
      <Separator />
      <div className="space-y-1.5 px-4 py-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">{t("cart.subtotal")}</span>
          <span className="font-mono tabular-nums text-foreground">
            {formatPriceCents(subtotalCents, currencySettings)}
          </span>
        </div>
        {showTip ? (
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">{t("cart.tip")}</span>
            <span className="font-mono tabular-nums text-foreground">
              {formatPriceCents(tipCents, currencySettings)}
            </span>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm font-medium text-foreground">
            {t("cart.total")}
          </span>
          <span className="font-mono text-base font-semibold tabular-nums text-foreground">
            {formatPriceCents(totalCents, currencySettings)}
          </span>
        </div>
      </div>
    </div>
  );
}
