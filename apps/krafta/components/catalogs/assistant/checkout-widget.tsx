"use client";

import * as React from "react";
import { Check, X, ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { computePricing } from "@/lib/cart/pricing";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import {
  getStorefrontMessage,
  type StorefrontMessageKey,
} from "@/lib/locales/messages";
import {
  useOptionalCart,
  type CartFulfillmentMode,
} from "@/components/catalogs/cart/cart-provider";
import { PricingBreakdown } from "@/components/catalogs/cart/pricing-breakdown";
import {
  AddressMapPicker,
  type PickedAddress,
} from "@/components/catalogs/cart/address-map-picker";

type Step = "mode" | "table" | "address" | "contact" | "schedule" | "review";

// The per-mode question sequence (a final "review" step is always appended).
// Delivery's "address" step is the map widget (Phase 4); until then it blocks.
function modeSteps(mode: CartFulfillmentMode): Step[] {
  if (mode === "dine_in") return ["table"];
  if (mode === "pickup") return ["schedule", "contact"];
  return ["address", "contact", "schedule"]; // delivery
}

const MODE_KEY: Record<CartFulfillmentMode, StorefrontMessageKey> = {
  dine_in: "checkout.mode.dine_in",
  pickup: "checkout.mode.pickup",
  delivery: "checkout.mode.delivery",
};

/**
 * Guided, one-question-at-a-time checkout rendered as an overlay inside the
 * assistant. Resolves the fulfillment mode (QR dine-in lock > single mode >
 * ?mode hint > picker), walks the per-mode questions, then a review step
 * places a CASH/COD order via cart.placeOrder and shows the confirmation.
 */
export function CheckoutWidget({
  currency,
  onClose,
}: {
  currency: CurrencySettings;
  onClose: () => void;
}) {
  const cart = useOptionalCart();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = React.useCallback(
    (key: StorefrontMessageKey, vars?: Record<string, string | number>) =>
      getStorefrontMessage(key, { activeLocale, defaultLocale, vars }),
    [activeLocale, defaultLocale],
  );

  const modes = cart?.modes ?? [];
  const lockedTable = cart?.dineInLock?.tableLabel ?? null;
  const forcedMode: CartFulfillmentMode | null = lockedTable
    ? "dine_in"
    : modes.length === 1
      ? modes[0]
      : null;
  const needsPicker = !forcedMode && modes.length > 1;

  const [mode, setMode] = React.useState<CartFulfillmentMode | null>(
    forcedMode ?? cart?.initialModeHint ?? (needsPicker ? null : (modes[0] ?? null)),
  );
  const [stepIndex, setStepIndex] = React.useState(0);
  const [fields, setFields] = React.useState({
    tableLabel: lockedTable ?? "",
    name: "",
    phone: "",
    address: "",
    scheduleType: "asap" as "asap" | "scheduled",
    scheduledFor: "",
    note: "",
  });
  const setField = <K extends keyof typeof fields>(
    key: K,
    value: (typeof fields)[K],
  ) => setFields((f) => ({ ...f, [key]: value }));
  const [orderError, setOrderError] = React.useState<string | null>(null);
  // Delivery address captured from the map (real coords — required for a
  // delivery order; no 0,0 fallback per the locked decision).
  const [pickedAddress, setPickedAddress] = React.useState<PickedAddress | null>(
    null,
  );
  const [addrResolving, setAddrResolving] = React.useState(false);

  const steps: Step[] = React.useMemo(() => {
    if (mode === null) return ["mode"];
    const list: Step[] = [];
    if (needsPicker) list.push("mode");
    list.push(...modeSteps(mode), "review");
    return list;
  }, [mode, needsPicker]);

  const step = steps[Math.min(stepIndex, steps.length - 1)];

  // Tip presets off the subtotal (capped server-side at half of charged total).
  const subtotalCents = cart?.summary.subtotalCents ?? 0;
  const tipPresets = [0, 0.05, 0.1].map((p) => Math.round(subtotalCents * p));

  const phoneValid = (v: string) => /\+?\d[\d\s()-]{6,}/.test(v.trim());

  // Per-step "can continue" gate.
  const canContinue = (() => {
    switch (step) {
      case "table":
        return fields.tableLabel.trim().length > 0;
      case "address":
        // Require a real pinned coordinate (the map onChange supplies it).
        return !!pickedAddress && !addrResolving;
      case "contact":
        if (mode === "delivery")
          return fields.name.trim().length > 0 && phoneValid(fields.phone);
        return true; // pickup: name/phone optional (validated if present)
      case "schedule":
        return (
          fields.scheduleType === "asap" || fields.scheduledFor.trim() !== ""
        );
      default:
        return true;
    }
  })();

  const isLast = step === "review";
  const placing = cart?.isPlacingOrder ?? false;
  const placed = cart?.placedOrder ?? null;

  const buildInput = () => {
    if (!mode) return null;
    if (mode === "dine_in")
      return { mode, fields: { tableLabel: fields.tableLabel.trim() } } as const;
    if (mode === "pickup")
      return {
        mode,
        fields: {
          scheduleType: fields.scheduleType,
          pickupAt:
            fields.scheduleType === "scheduled" && fields.scheduledFor
              ? new Date(fields.scheduledFor).toISOString()
              : null,
          recipientName: fields.name.trim() || null,
          recipientPhone: fields.phone.trim() || null,
          note: fields.note.trim() || null,
        },
      } as const;
    return {
      mode: "delivery" as const,
      fields: {
        address: pickedAddress?.freeform ?? "",
        latitude: pickedAddress?.latitude ?? null,
        longitude: pickedAddress?.longitude ?? null,
        district: pickedAddress?.district ?? null,
        street: pickedAddress?.street ?? null,
        building: pickedAddress?.building ?? null,
        recipientName: fields.name.trim(),
        recipientPhone: fields.phone.trim(),
        scheduledFor:
          fields.scheduleType === "scheduled" && fields.scheduledFor
            ? new Date(fields.scheduledFor).toISOString()
            : null,
        note: fields.note.trim() || null,
      },
    };
  };

  const errorMessage = (code: string): string => {
    if (code === "out_of_zone") return t("checkout.out_of_zone");
    if (code === "below_min_order") return t("checkout.below_min_order");
    if (code === "phone_invalid") return t("checkout.missing.phone");
    if (code.startsWith("price_changed"))
      return t("cart.modifier_pricing_hint");
    return code;
  };

  const place = async () => {
    if (!cart) return;
    const input = buildInput();
    if (!input) return;
    setOrderError(null);
    await cart.flush();
    const res = await cart.placeOrder(
      input as Parameters<typeof cart.placeOrder>[0],
    );
    if (!res.ok) setOrderError(errorMessage(res.error));
  };

  const back = () => {
    if (stepIndex === 0) onClose();
    else setStepIndex((i) => i - 1);
  };
  const advance = () => {
    if (isLast) void place();
    else setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  // ── Confirmation ──────────────────────────────────────────────────────────
  if (placed && mode) {
    const subtitleKey = (
      {
        dine_in: "placed.subtitle.dine_in",
        pickup: "placed.subtitle.pickup",
        delivery: "placed.subtitle.delivery",
      } as const
    )[mode];
    const payKey = (
      {
        dine_in: "placed.pay.dine_in",
        pickup: "placed.pay.pickup",
        delivery: "placed.pay.delivery",
      } as const
    )[mode];
    return (
      <div className="mt-2 flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold">{t("placed.title")}</p>
          <p className="text-sm text-muted-foreground">{t(subtitleKey)}</p>
          <p className="text-sm text-muted-foreground">{t(payKey)}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            cart?.resetForNewCart();
            onClose();
          }}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium transition hover:border-foreground/30"
        >
          {t("placed.order_more")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={back}
          aria-label={stepIndex === 0 ? "Close" : "Back"}
          className="grid size-7 place-items-center rounded-full text-muted-foreground transition hover:bg-muted"
        >
          {stepIndex === 0 ? (
            <X className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
        <span className="text-sm font-semibold">{t("checkout.title")}</span>
        <span className="w-7" />
      </div>

      <div className="px-3 py-3">
        <div className="space-y-5">
          {step === "mode" ? (
            <div className="space-y-3">
              <div className="grid gap-2">
                {modes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setStepIndex(1);
                    }}
                    className="w-full rounded-2xl border border-border px-4 py-3 text-left text-sm font-medium transition hover:border-foreground/40"
                  >
                    {t(MODE_KEY[m])}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === "table" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                {t("checkout.table.label")}
              </span>
              <input
                value={fields.tableLabel}
                disabled={!!lockedTable}
                onChange={(e) => setField("tableLabel", e.target.value)}
                placeholder={t("checkout.table.placeholder")}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
              />
            </label>
          ) : null}

          {step === "address" ? (
            <div className="space-y-2">
              {/* Inline Yandex map — drag to pin the entrance or use the
                  locate button. onChange supplies real coords; delivery can't
                  continue without them (no 0,0 fallback). */}
              <div className="h-64 w-full overflow-hidden rounded-xl border border-border">
                <AddressMapPicker
                  onChange={setPickedAddress}
                  onResolvingChange={setAddrResolving}
                  searchPlaceholder={t("address.search")}
                />
              </div>
              <p className="text-sm">
                {addrResolving ? (
                  <span className="text-muted-foreground">
                    {t("address.resolving")}
                  </span>
                ) : pickedAddress ? (
                  pickedAddress.freeform
                ) : (
                  <span className="text-muted-foreground">
                    {t("address.map_hint")}
                  </span>
                )}
              </p>
            </div>
          ) : null}

          {step === "contact" ? (
            <div className="space-y-4">
              <p className="text-sm font-medium">
                {t("checkout.section.contact")}
              </p>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">
                  {t("checkout.your_name")}
                </span>
                <input
                  value={fields.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder={t("checkout.recipient.placeholder")}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">
                  {t("checkout.phone.label")}
                </span>
                <input
                  value={fields.phone}
                  inputMode="tel"
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder={t("checkout.phone.placeholder")}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </label>
            </div>
          ) : null}

          {step === "schedule" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {t(
                  mode === "delivery"
                    ? "checkout.schedule.delivery_when"
                    : "checkout.schedule.pickup_when",
                )}
              </p>
              <div className="flex gap-2">
                {(["asap", "scheduled"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setField("scheduleType", opt)}
                    className={cn(
                      "flex-1 rounded-full border px-3 py-2 text-sm font-medium transition",
                      fields.scheduleType === opt
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    {t(
                      opt === "asap"
                        ? "checkout.schedule.asap"
                        : "checkout.schedule.scheduled",
                    )}
                  </button>
                ))}
              </div>
              {fields.scheduleType === "scheduled" ? (
                <input
                  type="datetime-local"
                  value={fields.scheduledFor}
                  onChange={(e) => setField("scheduledFor", e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              ) : null}
            </div>
          ) : null}

          {step === "review" ? (
            <div className="space-y-4">
              {/* Compact order summary */}
              <div className="rounded-2xl border border-border bg-card p-3">
                <p className="mb-2 text-sm font-semibold">
                  {t("checkout.summary.heading")}
                </p>
                <div className="space-y-1">
                  {cart?.summary.lineItems.map((l) => (
                    <div
                      key={l.id}
                      className="flex justify-between gap-3 text-sm"
                    >
                      <span className="truncate text-muted-foreground">
                        {l.quantity}× {l.name}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatPriceCents(l.total_price_cents, currency)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 border-t border-border pt-2">
                  <PricingBreakdown
                    subtotalCents={subtotalCents}
                    taxes={cart?.taxes ?? []}
                    tipCents={cart?.tipCents ?? 0}
                    currencySettings={currency}
                    compact
                  />
                </div>
              </div>

              {/* Tip */}
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("checkout.tip.label")}</p>
                <div className="flex flex-wrap gap-2">
                  {tipPresets.map((cents, i) => {
                    const selected = (cart?.tipCents ?? 0) === cents;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => cart?.setTipCents(cents)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border hover:border-foreground/30",
                        )}
                      >
                        {i === 0
                          ? t("checkout.tip.none")
                          : `${i === 1 ? 5 : 10}%`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">
                  {t("checkout.note.label")}
                </span>
                <input
                  value={fields.note}
                  onChange={(e) => setField("note", e.target.value)}
                  placeholder={t("checkout.note.placeholder")}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </label>

              {orderError ? (
                <p className="text-sm text-destructive">{orderError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Action */}
      <div className="border-t border-border p-3">
        <div>
          {step === "mode" ? null : (
            <button
              type="button"
              disabled={!canContinue || placing}
              onClick={advance}
              className="w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              {isLast
                ? placing
                  ? t("checkout.placing")
                  : `${t("checkout.place_order")} · ${formatPriceCents(
                      computePricing({
                        subtotalCents,
                        taxes: cart?.taxes ?? [],
                        tipCents: cart?.tipCents ?? 0,
                      }).totalCents,
                      currency,
                    )}`
                : t("cart.continue")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
