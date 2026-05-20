"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Package, Truck, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type CurrencySettings,
  defaultCurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { cn } from "@/lib/utils";

import {
  useCart,
  type CartFulfillmentMode,
} from "./cart-provider";
import { PricingBreakdown } from "./pricing-breakdown";

const MODE_LABELS: Record<CartFulfillmentMode, string> = {
  dine_in: "Dine-in",
  pickup: "Pickup",
  delivery: "Delivery",
};

const MODE_ICONS: Record<CartFulfillmentMode, LucideIcon> = {
  dine_in: Utensils,
  pickup: Package,
  delivery: Truck,
};

// In-picker mode order. dine_in is excluded — that intent always comes from
// a QR scan (or future URL param), so a customer who needs the picker is
// choosing between pickup and delivery. Ranked by general popularity for
// non-dine-in restaurant flows: pickup is simpler (no address) so we lead
// with it; users who want delivery tap the second option.
const PICKER_MODE_ORDER: CartFulfillmentMode[] = ["pickup", "delivery"];

type CartCheckoutStepProps = {
  currencySettings?: CurrencySettings;
};

export function CartCheckoutStep({
  currencySettings = defaultCurrencySettings,
}: CartCheckoutStepProps = {}) {
  const {
    modes,
    isPlacingOrder,
    placeOrder,
    setStep,
    taxes,
    summary,
    tipCents,
    setTipCents,
  } = useCart();

  // Picker shows pickup/delivery in popularity order. dine_in is excluded
  // here on purpose — it's QR-only (intent inferred from the scan, no
  // need to ask). If the venue happens to enable only dine_in, fall back
  // to it so the form still renders.
  const pickerOptions = useMemo<CartFulfillmentMode[]>(() => {
    const ordered = PICKER_MODE_ORDER.filter((m) => modes.includes(m));
    if (ordered.length > 0) return ordered;
    return modes;
  }, [modes]);

  const [mode, setMode] = useState<CartFulfillmentMode>(
    () => pickerOptions[0] ?? "pickup",
  );

  // Per-mode form state. We keep one slot per mode so switching tabs
  // preserves what the user typed.
  const [tableLabel, setTableLabel] = useState("");
  const [pickupSchedule, setPickupSchedule] = useState<"asap" | "scheduled">(
    "asap",
  );
  const [pickupAt, setPickupAt] = useState("");
  const [pickupName, setPickupName] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryName, setDeliveryName] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliverySchedule, setDeliverySchedule] = useState<"asap" | "scheduled">(
    "asap",
  );
  const [deliveryAt, setDeliveryAt] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");

  const canSubmit = useMemo(() => {
    if (isPlacingOrder) return false;
    if (mode === "dine_in") return tableLabel.trim().length > 0;
    if (mode === "pickup") {
      return pickupSchedule === "asap" || pickupAt.length > 0;
    }
    // delivery
    return (
      deliveryAddress.trim().length > 0 &&
      deliveryName.trim().length > 0 &&
      deliveryPhone.trim().length > 0 &&
      (deliverySchedule === "asap" || deliveryAt.length > 0)
    );
  }, [
    deliveryAddress,
    deliveryAt,
    deliveryName,
    deliveryPhone,
    deliverySchedule,
    isPlacingOrder,
    mode,
    pickupAt,
    pickupSchedule,
    tableLabel,
  ]);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    if (mode === "dine_in") {
      await placeOrder({
        mode: "dine_in",
        fields: { tableLabel: tableLabel.trim() },
      });
      return;
    }
    if (mode === "pickup") {
      await placeOrder({
        mode: "pickup",
        fields: {
          scheduleType: pickupSchedule,
          pickupAt: pickupSchedule === "scheduled" ? pickupAt : null,
          recipientName: pickupName.trim() || null,
          recipientPhone: pickupPhone.trim() || null,
          note: pickupNote.trim() || null,
        },
      });
      return;
    }
    await placeOrder({
      mode: "delivery",
      fields: {
        address: deliveryAddress.trim(),
        recipientName: deliveryName.trim(),
        recipientPhone: deliveryPhone.trim(),
        scheduledFor: deliverySchedule === "scheduled" ? deliveryAt : null,
        note: deliveryNote.trim() || null,
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* sr-only title satisfies Radix Dialog a11y; the visible UI carries
          its own headings (Back button + per-mode field labels). */}
      <DrawerTitle className="sr-only">Checkout</DrawerTitle>
      <DrawerDescription className="sr-only">
        Pick a mode and provide the details to place the order.
      </DrawerDescription>
      <div className="flex items-center gap-2 px-4 pb-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setStep("cart")}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        {pickerOptions.length > 1 ? (
          <div
            role="radiogroup"
            aria-label="Order method"
            className="flex gap-2"
          >
            {pickerOptions.map((option) => {
              const Icon = MODE_ICONS[option];
              const isActive = option === mode;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setMode(option)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:border-foreground/30",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {MODE_LABELS[option]}
                </button>
              );
            })}
          </div>
        ) : null}

        {mode === "dine_in" ? (
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="dine-in-table">Table</FieldLabel>
                <Input
                  id="dine-in-table"
                  value={tableLabel}
                  onChange={(event) => setTableLabel(event.target.value)}
                  placeholder="Table 5"
                  autoComplete="off"
                />
                <FieldDescription>
                  Where should the order go? Pre-filled when you scan a table
                  QR.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>
        ) : null}

        {mode === "pickup" ? (
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel>When</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <ScheduleToggle
                    label="As soon as possible"
                    selected={pickupSchedule === "asap"}
                    onClick={() => setPickupSchedule("asap")}
                  />
                  <ScheduleToggle
                    label="Schedule"
                    selected={pickupSchedule === "scheduled"}
                    onClick={() => setPickupSchedule("scheduled")}
                  />
                </div>
              </Field>
              {pickupSchedule === "scheduled" ? (
                <Field>
                  <FieldLabel htmlFor="pickup-at">Pickup time</FieldLabel>
                  <Input
                    id="pickup-at"
                    type="datetime-local"
                    value={pickupAt}
                    onChange={(event) => setPickupAt(event.target.value)}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="pickup-name">Name (optional)</FieldLabel>
                <Input
                  id="pickup-name"
                  value={pickupName}
                  onChange={(event) => setPickupName(event.target.value)}
                  placeholder="Who's picking up?"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pickup-phone">Phone (optional)</FieldLabel>
                <Input
                  id="pickup-phone"
                  inputMode="tel"
                  value={pickupPhone}
                  onChange={(event) => setPickupPhone(event.target.value)}
                  placeholder="+998…"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pickup-note">Note (optional)</FieldLabel>
                <Textarea
                  id="pickup-note"
                  value={pickupNote}
                  onChange={(event) => setPickupNote(event.target.value)}
                  placeholder="Anything we should know?"
                  className="min-h-[72px] resize-none"
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        ) : null}

        {mode === "delivery" ? (
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="delivery-address">Address</FieldLabel>
                <Textarea
                  id="delivery-address"
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  placeholder="Street, building, apartment…"
                  className="min-h-[88px] resize-none"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="delivery-name">Recipient name</FieldLabel>
                <Input
                  id="delivery-name"
                  value={deliveryName}
                  onChange={(event) => setDeliveryName(event.target.value)}
                  placeholder="Who's receiving the order?"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="delivery-phone">Phone</FieldLabel>
                <Input
                  id="delivery-phone"
                  inputMode="tel"
                  value={deliveryPhone}
                  onChange={(event) => setDeliveryPhone(event.target.value)}
                  placeholder="+998…"
                />
              </Field>
              <Field>
                <FieldLabel>When</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <ScheduleToggle
                    label="As soon as possible"
                    selected={deliverySchedule === "asap"}
                    onClick={() => setDeliverySchedule("asap")}
                  />
                  <ScheduleToggle
                    label="Schedule"
                    selected={deliverySchedule === "scheduled"}
                    onClick={() => setDeliverySchedule("scheduled")}
                  />
                </div>
              </Field>
              {deliverySchedule === "scheduled" ? (
                <Field>
                  <FieldLabel htmlFor="delivery-at">Delivery time</FieldLabel>
                  <Input
                    id="delivery-at"
                    type="datetime-local"
                    value={deliveryAt}
                    onChange={(event) => setDeliveryAt(event.target.value)}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="delivery-note">Note (optional)</FieldLabel>
                <Textarea
                  id="delivery-note"
                  value={deliveryNote}
                  onChange={(event) => setDeliveryNote(event.target.value)}
                  placeholder="Doorbell, building entrance, etc."
                  className="min-h-[72px] resize-none"
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        ) : null}

        <TipControl
          subtotalCents={summary.subtotalCents}
          tipCents={tipCents}
          setTipCents={setTipCents}
          currencySettings={currencySettings}
        />

        <PricingBreakdown
          subtotalCents={summary.subtotalCents}
          taxes={taxes}
          tipCents={tipCents}
          currencySettings={currencySettings}
        />
      </div>

      <div className="border-t border-border/60 px-4 pb-6 pt-4">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {isPlacingOrder ? "Placing…" : "Place order"}
        </Button>
      </div>
    </div>
  );
}

// Inline tip picker. Four percentage chips for quick choices; "Custom"
// expands a number input in the catalog's currency major unit (e.g., dollars
// for USD, the customer's intuitive unit). Source of truth is `tipCents`;
// percentage chips compute cents from current subtotal so the value stays
// correct if the customer re-adds items before submitting.
const TIP_PRESET_PERCENTAGES = [0, 0.1, 0.15, 0.2] as const;

function TipControl({
  subtotalCents,
  tipCents,
  setTipCents,
  currencySettings,
}: {
  subtotalCents: number;
  tipCents: number;
  setTipCents: (next: number) => void;
  currencySettings: CurrencySettings;
}) {
  const [mode, setModeState] = useState<"preset" | "custom">("preset");
  // Preset percentage that the tip matches, if any. Computed defensively each
  // render so a re-add that changes subtotal doesn't strand the chip
  // highlight on a stale value.
  const matchingPreset = useMemo(() => {
    for (const pct of TIP_PRESET_PERCENTAGES) {
      if (Math.round(subtotalCents * pct) === tipCents) return pct;
    }
    return null;
  }, [subtotalCents, tipCents]);

  // Custom field state: held as the major-unit decimal string so the input
  // accepts partial typing. Cents conversion happens on each change.
  // Catalogs with showDecimals=false (e.g., whole-unit UZS) skip cents.
  const decimals = currencySettings.showDecimals ? 2 : 0;
  const factor = 10 ** decimals;
  const [customStr, setCustomStr] = useState<string>(
    tipCents > 0 && matchingPreset === null
      ? (tipCents / factor).toFixed(decimals)
      : "",
  );

  const handlePreset = (pct: number) => {
    setModeState("preset");
    setTipCents(Math.round(subtotalCents * pct));
  };

  const handleCustomChange = (value: string) => {
    setCustomStr(value);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setTipCents(0);
      return;
    }
    setTipCents(Math.round(parsed * factor));
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Tip</p>
      <div className="grid grid-cols-5 gap-2">
        {TIP_PRESET_PERCENTAGES.map((pct) => {
          const isActive = mode === "preset" && matchingPreset === pct;
          const label = pct === 0 ? "No tip" : `${Math.round(pct * 100)}%`;
          return (
            <button
              key={pct}
              type="button"
              onClick={() => handlePreset(pct)}
              className={cn(
                "rounded-full border px-2 py-2 text-xs font-medium transition",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:border-foreground/30",
              )}
              aria-pressed={isActive}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setModeState("custom")}
          className={cn(
            "rounded-full border px-2 py-2 text-xs font-medium transition",
            mode === "custom"
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-foreground hover:border-foreground/30",
          )}
          aria-pressed={mode === "custom"}
        >
          Custom
        </button>
      </div>
      {mode === "custom" ? (
        <Input
          type="number"
          min="0"
          step={decimals === 0 ? "1" : `0.${"0".repeat(decimals - 1)}1`}
          inputMode="decimal"
          value={customStr}
          onChange={(event) => handleCustomChange(event.target.value)}
          placeholder="Enter tip amount"
        />
      ) : null}
    </div>
  );
}

function ScheduleToggle({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm transition",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground hover:border-foreground/30",
      )}
      aria-pressed={selected}
    >
      {label}
    </button>
  );
}
