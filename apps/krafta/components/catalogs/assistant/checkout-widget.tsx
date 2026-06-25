"use client";

import * as React from "react";
import { Check, ChevronLeft, MapPin, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import { computePricing } from "@/lib/cart/pricing";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import {
  getStorefrontMessage,
  type StorefrontMessageKey,
} from "@/lib/locales/messages";
import { listAddressesAction } from "@/lib/cart/actions";
import type { CustomerAddress } from "@/lib/cart/addresses";
import {
  useOptionalCart,
  type CartFulfillmentMode,
} from "@/components/catalogs/cart/cart-provider";
import { PricingBreakdown } from "@/components/catalogs/cart/pricing-breakdown";
import {
  AddressMapPicker,
  type PickedAddress,
} from "@/components/catalogs/cart/address-map-picker";

// mode → one combined "details" form → review. Confirmation when placed.
type Step = "mode" | "details" | "review";

const MODE_KEY: Record<CartFulfillmentMode, StorefrontMessageKey> = {
  dine_in: "checkout.mode.dine_in",
  pickup: "checkout.mode.pickup",
  delivery: "checkout.mode.delivery",
};

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
        selected ? "border-foreground" : "border-muted-foreground/40",
      )}
    >
      {selected ? <span className="size-2.5 rounded-full bg-foreground" /> : null}
    </span>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60";

/**
 * Guided checkout rendered inline in the assistant. Picks the fulfillment mode
 * (QR dine-in lock > single mode > ?mode hint > picker), collects the per-mode
 * details in one form (delivery uses a saved-address selector + a create-new
 * map), reviews, then places a CASH/COD order via cart.placeOrder.
 */
export function CheckoutWidget({
  currency,
  onClose,
  onEditCart,
}: {
  currency: CurrencySettings;
  onClose: () => void;
  onEditCart: () => void;
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
    apt: "",
    scheduleType: "asap" as "asap" | "scheduled",
    scheduledFor: "",
    note: "",
  });
  const setField = <K extends keyof typeof fields>(
    key: K,
    value: (typeof fields)[K],
  ) => setFields((f) => ({ ...f, [key]: value }));
  const [orderError, setOrderError] = React.useState<string | null>(null);

  // Delivery address: saved-address selector + create-new map. Real coords are
  // required (no 0,0 fallback per the locked decision).
  const [addresses, setAddresses] = React.useState<CustomerAddress[]>([]);
  const [addressesLoaded, setAddressesLoaded] = React.useState(false);
  const [selectedAddressId, setSelectedAddressId] = React.useState<string | null>(
    null,
  );
  const [showNewAddress, setShowNewAddress] = React.useState(false);
  const [pickedAddress, setPickedAddress] = React.useState<PickedAddress | null>(
    null,
  );
  const [addrResolving, setAddrResolving] = React.useState(false);

  const steps: Step[] = React.useMemo(() => {
    if (mode === null) return ["mode"];
    return [...(needsPicker ? (["mode"] as Step[]) : []), "details", "review"];
  }, [mode, needsPicker]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  // Load the shopper's saved addresses when they reach delivery details.
  React.useEffect(() => {
    if (mode !== "delivery" || step !== "details" || addressesLoaded) return;
    let cancelled = false;
    listAddressesAction()
      .then((rows) => {
        if (cancelled) return;
        setAddresses(rows);
        setAddressesLoaded(true);
        const def = rows.find((a) => a.isDefault) ?? rows[0];
        if (def) {
          setSelectedAddressId(def.id);
          setField("apt", def.apartment ?? "");
        } else {
          setShowNewAddress(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAddressesLoaded(true);
        setShowNewAddress(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step, addressesLoaded]);

  const selectedSaved = selectedAddressId
    ? (addresses.find((a) => a.id === selectedAddressId) ?? null)
    : null;
  // The address that will be ordered to — the freshly-pinned one wins, else the
  // selected saved one.
  const deliveryAddr = pickedAddress
    ? {
        freeform: pickedAddress.freeform,
        latitude: pickedAddress.latitude as number | null,
        longitude: pickedAddress.longitude as number | null,
        district: pickedAddress.district,
        street: pickedAddress.street,
        building: pickedAddress.building,
      }
    : selectedSaved
      ? {
          freeform: selectedSaved.freeform,
          latitude: selectedSaved.latitude,
          longitude: selectedSaved.longitude,
          district: selectedSaved.district,
          street: selectedSaved.street,
          building: selectedSaved.building,
        }
      : null;

  const subtotalCents = cart?.summary.subtotalCents ?? 0;
  const tipPresets = [0, 0.05, 0.1].map((p) => Math.round(subtotalCents * p));
  const phoneValid = (v: string) => /\+?\d[\d\s()-]{6,}/.test(v.trim());
  const scheduleOk =
    fields.scheduleType === "asap" || fields.scheduledFor.trim() !== "";

  const canContinue = (() => {
    if (step === "details") {
      if (mode === "dine_in") return fields.tableLabel.trim().length > 0;
      if (mode === "pickup") return scheduleOk;
      // delivery — real coords + name + phone + schedule
      return (
        !!deliveryAddr &&
        deliveryAddr.latitude != null &&
        deliveryAddr.longitude != null &&
        !addrResolving &&
        fields.name.trim().length > 0 &&
        phoneValid(fields.phone) &&
        scheduleOk
      );
    }
    return true;
  })();

  const isLast = step === "review";
  const placing = cart?.isPlacingOrder ?? false;
  const placed = cart?.placedOrder ?? null;

  const buildInput = () => {
    if (!mode) return null;
    if (mode === "dine_in")
      return { mode, fields: { tableLabel: fields.tableLabel.trim() } } as const;
    const scheduledFor =
      fields.scheduleType === "scheduled" && fields.scheduledFor
        ? new Date(fields.scheduledFor).toISOString()
        : null;
    if (mode === "pickup")
      return {
        mode,
        fields: {
          scheduleType: fields.scheduleType,
          pickupAt: scheduledFor,
          recipientName: fields.name.trim() || null,
          recipientPhone: fields.phone.trim() || null,
          note: fields.note.trim() || null,
        },
      } as const;
    // Apartment isn't a placeOrder field — fold it into the courier note.
    const apt = fields.apt.trim();
    const note =
      [apt ? `${t("address.field.apartment")}: ${apt}` : "", fields.note.trim()]
        .filter(Boolean)
        .join(" · ") || null;
    return {
      mode: "delivery" as const,
      fields: {
        address: deliveryAddr?.freeform ?? "",
        latitude: deliveryAddr?.latitude ?? null,
        longitude: deliveryAddr?.longitude ?? null,
        district: deliveryAddr?.district ?? null,
        street: deliveryAddr?.street ?? null,
        building: deliveryAddr?.building ?? null,
        recipientName: fields.name.trim(),
        recipientPhone: fields.phone.trim(),
        scheduledFor,
        note,
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
    if (stepIndex === 0) onEditCart();
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

  // Title + subtitle per step.
  const title =
    step === "mode"
      ? t("checkout.mode.title")
      : step === "review"
        ? t("checkout.summary.heading")
        : mode
          ? t(MODE_KEY[mode])
          : "";
  const subtitle = step === "mode" ? t("checkout.mode.subtitle") : null;

  const whenControl = (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {t(
          mode === "delivery"
            ? "checkout.schedule.delivery_when"
            : "checkout.schedule.pickup_when",
        )}
      </p>
      <div className="flex items-center gap-5">
        {(["asap", "scheduled"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setField("scheduleType", opt)}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <RadioDot selected={fields.scheduleType === opt} />
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
          className={inputCls}
        />
      ) : null}
    </div>
  );

  const contactFields = (
    <>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("checkout.your_name")}</span>
        <input
          value={fields.name}
          onChange={(e) => setField("name", e.target.value)}
          placeholder={t("checkout.recipient.placeholder")}
          className={inputCls}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("checkout.phone.label")}</span>
        <input
          value={fields.phone}
          inputMode="tel"
          onChange={(e) => setField("phone", e.target.value)}
          placeholder={t("checkout.phone.placeholder")}
          className={inputCls}
        />
      </label>
    </>
  );

  return (
    <div className="mt-2 w-full max-w-md space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="space-y-4 p-4">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            {subtitle ? (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>

          {/* ── Mode ─────────────────────────────────────────────────────── */}
          {step === "mode" ? (
            <div className="space-y-1">
              {modes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition hover:bg-muted/60"
                >
                  <RadioDot selected={mode === m} />
                  <span className="text-sm font-medium">{t(MODE_KEY[m])}</span>
                </button>
              ))}
            </div>
          ) : null}

          {/* ── Details ──────────────────────────────────────────────────── */}
          {step === "details" && mode === "dine_in" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                {t("checkout.table.label")}
              </span>
              <input
                value={fields.tableLabel}
                disabled={!!lockedTable}
                onChange={(e) => setField("tableLabel", e.target.value)}
                placeholder={t("checkout.table.placeholder")}
                className={inputCls}
              />
            </label>
          ) : null}

          {step === "details" && mode === "pickup" ? (
            <div className="space-y-4">
              {whenControl}
              {contactFields}
            </div>
          ) : null}

          {step === "details" && mode === "delivery" ? (
            <div className="space-y-4">
              {/* Address selector: saved list / create new on the map. */}
              <div className="space-y-1.5">
                <span className="text-sm font-medium">{t("address.title")}</span>
                {!showNewAddress && addresses.length > 0 ? (
                  <div className="space-y-1.5">
                    {addresses.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setSelectedAddressId(a.id);
                          setPickedAddress(null);
                          setField("apt", a.apartment ?? "");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-foreground/30"
                      >
                        <RadioDot selected={selectedAddressId === a.id} />
                        <MapPin className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {a.freeform}
                        </span>
                        {a.isDefault ? (
                          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t("address.default")}
                          </span>
                        ) : null}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewAddress(true);
                        setPickedAddress(null);
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border p-3 text-sm font-medium text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                    >
                      <Plus className="size-4" />
                      {t("address.add")}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {addresses.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewAddress(false);
                          setPickedAddress(null);
                        }}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
                      >
                        <ChevronLeft className="size-4" />
                        {t("address.title")}
                      </button>
                    ) : null}
                    <div className="h-60 w-full overflow-hidden rounded-xl border border-border">
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
                )}
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">
                  {t("address.field.apartment")}
                </span>
                <input
                  value={fields.apt}
                  onChange={(e) => setField("apt", e.target.value)}
                  placeholder={t("address.field.apartment")}
                  className={inputCls}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium">
                  {t("checkout.note.label")}
                </span>
                <input
                  value={fields.note}
                  onChange={(e) => setField("note", e.target.value)}
                  placeholder={t("checkout.note.placeholder")}
                  className={inputCls}
                />
              </label>

              {whenControl}
              {contactFields}
            </div>
          ) : null}

          {/* ── Review ───────────────────────────────────────────────────── */}
          {step === "review" ? (
            <div className="space-y-4">
              <div className="space-y-1">
                {cart?.summary.lineItems.map((l) => (
                  <div
                    key={l.id}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        {l.quantity}
                      </span>
                      × {l.name}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">
                      {formatPriceCents(l.total_price_cents, currency)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-3">
                <PricingBreakdown
                  subtotalCents={subtotalCents}
                  taxes={cart?.taxes ?? []}
                  tipCents={cart?.tipCents ?? 0}
                  currencySettings={currency}
                  compact
                />
              </div>

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
                        {i === 0 ? (
                          t("checkout.tip.none")
                        ) : (
                          <span className="font-mono tabular-nums">
                            {i === 1 ? "5%" : "10%"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {orderError ? (
                <p className="text-sm text-destructive">{orderError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Actions — below the card, like the reference layout. */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canContinue || placing}
          onClick={advance}
          className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
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
        <button
          type="button"
          onClick={back}
          className="rounded-full border border-border px-4 py-3 text-sm font-medium transition hover:border-foreground/30"
        >
          {stepIndex === 0 ? t("checkout.edit_cart") : t("checkout.back")}
        </button>
      </div>
    </div>
  );
}
