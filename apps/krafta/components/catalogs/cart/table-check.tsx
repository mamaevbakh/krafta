"use client";

import * as React from "react";
import { Check, ChevronRight, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  type CurrencySettings,
  defaultCurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { getRunningCheckAction, requestBillAction } from "@/lib/cart/actions";
import { haptic } from "@/lib/telegram/webapp";
import { cn } from "@/lib/utils";

import { useOptionalCart } from "./cart-provider";

/**
 * TableCheck — the dine-in "running check" (ADR 0004 / KRA-116).
 *
 * Cart = the round you're building; this is the rounds you've already PLACED at
 * the table. A persistent tab bar above the dock keeps the running total in
 * view while you browse for more; tapping it opens the Table Check sheet (your
 * rounds + live-ish status + total + "ask for the bill").
 *
 * Per-guest scope: shows only the caller's own rounds (the data layer enforces
 * it). No-ops entirely outside an active dine-in session with ≥1 placed round.
 *
 * Refresh model (v1): fetch on mount, when a new round is placed (placedOrder
 * changes), and each time the sheet opens — no realtime subscription yet
 * (ADR §7 followup). Strings are RU-only for v1 (TODO: move to messages.ts).
 */

type RunningCheck = Awaited<ReturnType<typeof getRunningCheckAction>>;

export function TableCheck({
  orgId,
  venueId,
  currencySettings = defaultCurrencySettings,
}: {
  orgId: string;
  venueId: string;
  currencySettings?: CurrencySettings;
}) {
  const cart = useOptionalCart();
  const tableLabel = cart?.dineInLock?.tableLabel ?? null;
  // Changes on every successful place — our cue to re-fetch the check.
  const placedOrderId = cart?.placedOrder?.orderId ?? null;

  const [check, setCheck] = React.useState<RunningCheck | null>(null);
  const [open, setOpen] = React.useState(false);
  const [requesting, setRequesting] = React.useState(false);
  const [billRequestedLocal, setBillRequestedLocal] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!tableLabel) {
      setCheck(null);
      return;
    }
    try {
      const next = await getRunningCheckAction({ orgId, venueId, tableLabel });
      setCheck(next);
    } catch {
      /* best-effort — the check is read-only chrome */
    }
  }, [orgId, venueId, tableLabel]);

  // Fetch on dine-in + whenever a new round lands.
  React.useEffect(() => {
    void refresh();
  }, [refresh, placedOrderId]);

  // Fresh status each time the sheet opens.
  React.useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!tableLabel || !check || !check.active || check.rounds.length === 0) {
    return null;
  }

  const money = (cents: number) => formatPriceCents(cents, currencySettings);
  const billRequested = Boolean(check.billRequestedAt) || billRequestedLocal;

  const onAskBill = async () => {
    if (requesting || billRequested) return;
    setRequesting(true);
    haptic.impact("medium");
    try {
      const res = await requestBillAction({ orgId, venueId, tableLabel });
      // Flip immediately on success — don't make the guest wait on a second
      // full check fetch. Sync server state in the background.
      if (res.ok) setBillRequestedLocal(true);
      void refresh();
    } finally {
      setRequesting(false);
    }
  };

  return (
    <>
      {/* Persistent table-tab bar — sits just above the storefront dock so the
          running total is never lost while the guest browses for more. */}
      <div className="fixed inset-x-0 z-40 px-4 bottom-[calc(5rem+max(env(safe-area-inset-bottom),var(--tg-safe-bottom,0px)))]">
        <button
          type="button"
          onClick={() => {
            haptic.impact("light");
            setOpen(true);
          }}
          aria-label="Открыть счёт стола"
          className={cn(
            "mx-auto flex w-full max-w-md items-center gap-3 rounded-full border border-border",
            "bg-background/90 px-4 py-2.5 backdrop-blur-2xl",
            "transition-colors hover:bg-background",
          )}
        >
          <Receipt className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
            Стол {tableLabel} · {check.rounds.length}{" "}
            {pluralRu(check.rounds.length, "заказ", "заказа", "заказов")}
          </span>
          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
            {money(check.runningTotalCents)}
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </button>
      </div>

      {/* Table Check sheet — the placed rounds + running total + actions. */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          className={cn(
            "data-[vaul-drawer-direction=bottom]:max-h-[88dvh]",
            "sm:data-[vaul-drawer-direction=bottom]:max-w-md sm:data-[vaul-drawer-direction=bottom]:mx-auto",
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DrawerHeader className="text-center">
              <DrawerTitle className="text-lg">Стол {tableLabel}</DrawerTitle>
              <DrawerDescription className="text-xs">
                Ваш счёт за этим столом
              </DrawerDescription>
            </DrawerHeader>

            <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto overflow-x-hidden px-4">
              <ul className="space-y-3 pb-2">
                {check.rounds.map((round, i) => (
                  <li
                    key={round.orderId}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Заказ {i + 1}
                      </span>
                      <StatusPill state={round.state} />
                    </div>
                    <ul className="space-y-1">
                      {round.items.map((item, j) => (
                        <li
                          key={j}
                          className="flex items-baseline justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            <span className="font-mono tabular-nums text-muted-foreground">
                              {item.quantity}×
                            </span>{" "}
                            {item.name}
                          </span>
                          <span className="shrink-0 font-mono tabular-nums text-foreground">
                            {money(item.totalCents)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <div className="mx-auto w-full max-w-md px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-foreground">
                    Итого по столу
                  </span>
                  <span className="font-mono text-base font-semibold tabular-nums text-foreground">
                    {money(check.runningTotalCents)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="xl"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setOpen(false)}
                  >
                    Заказать ещё
                  </Button>
                  <Button
                    type="button"
                    size="xl"
                    className="flex-1"
                    disabled={requesting || billRequested}
                    onClick={onAskBill}
                  >
                    {billRequested
                      ? "Счёт запрошен"
                      : requesting
                        ? "Запрашиваем…"
                        : "Попросить счёт"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function StatusPill({ state }: { state: "open" | "completed" }) {
  if (state === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground">
        <Check className="size-3" aria-hidden />
        Подано
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Готовится
    </span>
  );
}

// ru plural: 1 заказ / 2 заказа / 5 заказов.
function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
