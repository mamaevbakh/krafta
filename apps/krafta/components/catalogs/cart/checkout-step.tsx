"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Package, Truck, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { formatUzNational, isValidUzPhone } from "@/lib/cart/phone";

import { ScheduledTimePicker } from "./scheduled-time-picker";
import {
  type CurrencySettings,
  defaultCurrencySettings,
} from "@/lib/catalogs/settings/currency";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import {
  getStorefrontMessage,
  type StorefrontMessageKey,
} from "@/lib/locales/messages";
import { cn } from "@/lib/utils";

import {
  useCart,
  type CartFulfillmentMode,
} from "./cart-provider";
import { PricingBreakdown } from "./pricing-breakdown";
import { computePricing } from "@/lib/cart/pricing";
import { formatPriceCents } from "@/lib/catalogs/pricing";
import {
  DeliveryAddressField,
  type SelectedDeliveryAddress,
} from "./delivery-address-field";

// Mode labels now resolved via the i18n catalog at render time (S1).
// The const stays as a type-safe key map so we keep ordering/iteration.
const MODE_MESSAGE_KEYS: Record<CartFulfillmentMode, StorefrontMessageKey> = {
  dine_in: "checkout.mode.dine_in",
  pickup: "checkout.mode.pickup",
  delivery: "checkout.mode.delivery",
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
    dineInLock,
    initialModeHint,
  } = useCart();
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (
    key: StorefrontMessageKey,
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });

  // Picker shows pickup/delivery in popularity order. dine_in is excluded
  // here on purpose — it's QR-only (intent inferred from the scan, no
  // need to ask). If the venue happens to enable only dine_in, fall back
  // to it so the form still renders.
  const pickerOptions = useMemo<CartFulfillmentMode[]>(() => {
    const ordered = PICKER_MODE_ORDER.filter((m) => modes.includes(m));
    if (ordered.length > 0) return ordered;
    return modes;
  }, [modes]);

  const [mode, setMode] = useState<CartFulfillmentMode>(() => {
    // Honor the QR-driven dine-in lock on first render so the customer
    // sees the table form immediately, no flicker of pickup/delivery.
    if (dineInLock) return "dine_in";
    // Soft hint from ?mode=pickup or ?mode=delivery — pre-select that
    // tab in the picker (KRA-79/84). Customer can still switch.
    if (initialModeHint && pickerOptions.includes(initialModeHint)) {
      return initialModeHint;
    }
    return pickerOptions[0] ?? "pickup";
  });

  // If the lock or mode hint arrives after first render (e.g., the URL
  // hydrated late because useSearchParams returned null on the SSR
  // pass), snap the selected mode to match. Same effect for
  // `lock → cleared`: we drop back to the first picker option.
  useEffect(() => {
    if (dineInLock) {
      setMode("dine_in");
      return;
    }
    if (initialModeHint && pickerOptions.includes(initialModeHint)) {
      setMode(initialModeHint);
      return;
    }
    if (mode === "dine_in" && !modes.includes("dine_in")) {
      setMode(pickerOptions[0] ?? "pickup");
    }
    // mode is intentionally NOT a dep: this is a "respond to lock
    // toggling" effect, not a "every time mode changes" effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dineInLock, initialModeHint, modes, pickerOptions]);

  // Per-mode form state. We keep one slot per mode so switching tabs
  // preserves what the user typed.
  const [tableLabel, setTableLabel] = useState(
    () => dineInLock?.tableLabel ?? "",
  );

  // Keep tableLabel in sync with a late-arriving lock so the customer
  // doesn't have to retype the table number after a QR-driven refresh.
  useEffect(() => {
    if (dineInLock?.tableLabel) setTableLabel(dineInLock.tableLabel);
  }, [dineInLock]);
  const [pickupSchedule, setPickupSchedule] = useState<"asap" | "scheduled">(
    "asap",
  );
  const [pickupAt, setPickupAt] = useState("");
  const [pickupName, setPickupName] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  // Delivery address comes from the customer's address book (saved address or
  // a new one added via the Yandex map / manual form). The selected address's
  // `freeform` is the string the order snapshots (still " · "-joined so it
  // reads cleanly on a kitchen receipt).
  const [deliveryAddress, setDeliveryAddress] =
    useState<SelectedDeliveryAddress | null>(null);
  const [deliveryName, setDeliveryName] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliverySchedule, setDeliverySchedule] = useState<"asap" | "scheduled">(
    "asap",
  );
  const [deliveryAt, setDeliveryAt] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  // Persistent inline submit error (vs the ephemeral toast that's easy to miss
  // over a full-screen modal). Cleared on each new submit attempt.
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (isPlacingOrder) return false;
    if (mode === "dine_in") return tableLabel.trim().length > 0;
    // ScheduledTimePicker emits "YYYY-MM-DDTHH:mm" when complete; a
    // half-set value (date but no time) reads "YYYY-MM-DDT", so the
    // strict check below catches the missing-time case.
    const isCompleteSchedule = (s: string) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);
    if (mode === "pickup") {
      // Pickup phone is optional, but if typed, must validate. Lets the
      // customer leave it blank while still catching typos.
      const phoneOk =
        pickupPhone.trim().length === 0 || isValidUzPhone(pickupPhone);
      const scheduleOk =
        pickupSchedule === "asap" || isCompleteSchedule(pickupAt);
      return scheduleOk && phoneOk;
    }
    // delivery — phone is required (courier callback); a delivery address must
    // be chosen from the address book (saved or freshly added).
    return (
      (deliveryAddress?.freeform.trim().length ?? 0) > 0 &&
      deliveryName.trim().length > 0 &&
      isValidUzPhone(deliveryPhone) &&
      (deliverySchedule === "asap" || isCompleteSchedule(deliveryAt))
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
    pickupPhone,
    pickupSchedule,
    tableLabel,
  ]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);

    // The chosen address's freeform string is what a delivery order snapshots —
    // it's already " · "-joined, so it stays scannable on receipts / dashboard.
    const result =
      mode === "dine_in"
        ? await placeOrder({
            mode: "dine_in",
            fields: { tableLabel: tableLabel.trim() },
          })
        : mode === "pickup"
          ? await placeOrder({
              mode: "pickup",
              fields: {
                scheduleType: pickupSchedule,
                pickupAt: pickupSchedule === "scheduled" ? pickupAt : null,
                recipientName: pickupName.trim() || null,
                recipientPhone: pickupPhone.trim() || null,
                note: pickupNote.trim() || null,
              },
            })
          : await placeOrder({
              mode: "delivery",
              fields: {
                address: deliveryAddress?.freeform.trim() ?? "",
                recipientName: deliveryName.trim(),
                recipientPhone: deliveryPhone.trim(),
                scheduledFor:
                  deliverySchedule === "scheduled" ? deliveryAt : null,
                note: deliveryNote.trim() || null,
              },
            });

    if (!result.ok) setSubmitError(result.error);
  };

  // Bottom-line total, mirrored into the sticky footer below so the price is
  // ALWAYS visible — the full PricingBreakdown lives at the end of the
  // scrolling area and slides off-screen on long (delivery / schedule) forms.
  const footerTotalCents = computePricing({
    subtotalCents: summary.subtotalCents,
    taxes,
    tipCents,
  }).totalCents;

  return (
    // flex-1 + min-h-0: drawer-content is a flex column with a 24px
    // handle as its first child. The default `min-height: auto` on flex
    // items prevents flex-1 from shrinking below the natural content
    // height, so the column overflows by the handle's 24px. min-h-0
    // lets flex-1 cap at the drawer's available height. Without this
    // fix, the Place order button was clipped ~8px off-screen on mobile.
    <div className="flex min-h-0 flex-1 flex-col">
      {/* sr-only title satisfies Radix Dialog a11y; the visible UI carries
          its own headings (Back button + per-mode field labels). */}
      <DialogTitle className="sr-only">{t("checkout.title")}</DialogTitle>
      <DialogDescription className="sr-only">
        {t("checkout.title")}
      </DialogDescription>
      <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 pb-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setStep("cart")}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> {t("checkout.back")}
        </Button>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        {/* When the customer arrived via a table QR, hide the
            pickup/delivery picker entirely — their intent is locked. The
            mode pill in the cart-list header still shows "Dine-in · Table
            N" for context. */}
        {!dineInLock && pickerOptions.length > 1 ? (
          <div
            role="radiogroup"
            aria-label={t("checkout.title")}
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
                  {t(MODE_MESSAGE_KEYS[option])}
                </button>
              );
            })}
          </div>
        ) : null}

        {mode === "dine_in" ? (
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="dine-in-table">
                  {t("checkout.table.label")}
                </FieldLabel>
                <Input
                  id="dine-in-table"
                  value={tableLabel}
                  onChange={(event) => setTableLabel(event.target.value)}
                  placeholder={t("checkout.table.placeholder")}
                  autoComplete="off"
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        ) : null}

        {mode === "pickup" ? (
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel>{t("checkout.schedule.when")}</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <ScheduleToggle
                    label={t("checkout.schedule.asap")}
                    selected={pickupSchedule === "asap"}
                    onClick={() => setPickupSchedule("asap")}
                  />
                  <ScheduleToggle
                    label={t("checkout.schedule.scheduled")}
                    selected={pickupSchedule === "scheduled"}
                    onClick={() => setPickupSchedule("scheduled")}
                  />
                </div>
              </Field>
              {pickupSchedule === "scheduled" ? (
                <Field>
                  <FieldLabel htmlFor="pickup-at">
                    {t("checkout.schedule.scheduled")}
                  </FieldLabel>
                  <ScheduledTimePicker
                    id="pickup-at"
                    value={pickupAt}
                    onChange={setPickupAt}
                    datePlaceholder={t("checkout.schedule.pick_date")}
                    locale={activeLocale}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="pickup-name">
                  {t("checkout.recipient.label")}
                </FieldLabel>
                <Input
                  id="pickup-name"
                  value={pickupName}
                  onChange={(event) => setPickupName(event.target.value)}
                  placeholder={t("checkout.recipient.placeholder")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pickup-phone">
                  {t("checkout.phone.label")}
                </FieldLabel>
                {/* +998 stays pinned as a non-editable addon — Uzbek
                    market only for v1, and a locked prefix removes the
                    "which format do I type" cognitive load. The
                    customer types just the 9-digit local part. Server
                    re-normalizes via lib/cart/phone.ts so the DB stores
                    canonical E.164 ("+998901234567"). */}
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupText className="font-mono">+998</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="pickup-phone"
                    inputMode="tel"
                    autoComplete="tel-national"
                    className="font-mono tabular-nums"
                    value={formatUzNational(pickupPhone)}
                    onChange={(event) =>
                      setPickupPhone(event.target.value.replace(/\D/g, "").slice(0, 9))
                    }
                    placeholder={t("checkout.phone.placeholder")}
                  />
                </InputGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="pickup-note">
                  {t("checkout.note.label")}
                </FieldLabel>
                <Textarea
                  id="pickup-note"
                  value={pickupNote}
                  onChange={(event) => setPickupNote(event.target.value)}
                  placeholder={t("checkout.note.placeholder")}
                  className="min-h-[72px] resize-none"
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        ) : null}

        {mode === "delivery" ? (
          <FieldSet>
            <FieldGroup>
              {/* Address book: pick a saved address or add one via the Yandex
                  map / manual form. Replaces the old district/street/building
                  trio — fewer taps, reusable, and routable (coords saved). */}
              <Field>
                <FieldLabel>{t("checkout.mode.delivery")}</FieldLabel>
                <DeliveryAddressField
                  value={deliveryAddress}
                  onChange={setDeliveryAddress}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="delivery-name">
                  {t("checkout.recipient.label")}
                </FieldLabel>
                <Input
                  id="delivery-name"
                  value={deliveryName}
                  onChange={(event) => setDeliveryName(event.target.value)}
                  placeholder={t("checkout.recipient.placeholder")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="delivery-phone">
                  {t("checkout.phone.label")}
                </FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupText className="font-mono">+998</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="delivery-phone"
                    inputMode="tel"
                    autoComplete="tel-national"
                    className="font-mono tabular-nums"
                    value={formatUzNational(deliveryPhone)}
                    onChange={(event) =>
                      setDeliveryPhone(event.target.value.replace(/\D/g, "").slice(0, 9))
                    }
                    placeholder={t("checkout.phone.placeholder")}
                  />
                </InputGroup>
              </Field>
              <Field>
                <FieldLabel>{t("checkout.schedule.when")}</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <ScheduleToggle
                    label={t("checkout.schedule.asap")}
                    selected={deliverySchedule === "asap"}
                    onClick={() => setDeliverySchedule("asap")}
                  />
                  <ScheduleToggle
                    label={t("checkout.schedule.scheduled")}
                    selected={deliverySchedule === "scheduled"}
                    onClick={() => setDeliverySchedule("scheduled")}
                  />
                </div>
              </Field>
              {deliverySchedule === "scheduled" ? (
                <Field>
                  <FieldLabel htmlFor="delivery-at">
                    {t("checkout.schedule.scheduled")}
                  </FieldLabel>
                  <ScheduledTimePicker
                    id="delivery-at"
                    value={deliveryAt}
                    onChange={setDeliveryAt}
                    datePlaceholder={t("checkout.schedule.pick_date")}
                    locale={activeLocale}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="delivery-note">
                  {t("checkout.note.label")}
                </FieldLabel>
                <Textarea
                  id="delivery-note"
                  value={deliveryNote}
                  onChange={(event) => setDeliveryNote(event.target.value)}
                  placeholder={t("checkout.note.placeholder")}
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
          showTotal={false}
        />
      </div>

      {/* Sticky footer with safe-area padding so the CTA never hugs the
          home-indicator on iOS PWAs. bg-background/80 + backdrop-blur
          gives the same "fixed bottom row" lift the cart list step uses,
          so the two steps feel continuous. Inner max-w-md mirrors the
          scroll content so the CTA reads at the same width on wider
          drawers (tablet, webviews). */}
      <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-md px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {submitError ? (
            <p className="mb-2 text-xs text-destructive">{submitError}</p>
          ) : null}
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">{t("cart.total")}</span>
            <span className="font-mono text-lg font-semibold tabular-nums">
              {formatPriceCents(footerTotalCents, currencySettings)}
            </span>
          </div>
          <Button
            type="button"
            size="xl"
            className="w-full active:scale-[0.98]"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isPlacingOrder ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("checkout.placing")}
              </>
            ) : (
              t("checkout.place_order")
            )}
          </Button>
        </div>
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
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (
    key: StorefrontMessageKey,
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });
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
      <p className="text-sm font-medium text-foreground">
        {t("checkout.tip.label")}
      </p>
      <div className="grid grid-cols-5 gap-2">
        {TIP_PRESET_PERCENTAGES.map((pct) => {
          const isActive = mode === "preset" && matchingPreset === pct;
          const label =
            pct === 0
              ? t("checkout.tip.none")
              : t("checkout.tip.preset", { percent: Math.round(pct * 100) });
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
          {t("checkout.tip.custom")}
        </button>
      </div>
      {tipCents > 0 ? (
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          +{formatPriceCents(tipCents, currencySettings)}
        </p>
      ) : null}
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
        "rounded-full border px-3 py-2 text-sm transition",
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
