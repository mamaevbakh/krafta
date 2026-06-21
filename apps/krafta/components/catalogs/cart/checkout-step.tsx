"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  Package,
  Plus,
  Truck,
  Utensils,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup, FieldSet } from "@/components/ui/field";
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
import {
  type DeliverySettings,
  defaultDeliverySettings,
  isWithinDeliveryZone,
} from "@/lib/catalogs/settings/delivery";
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
  DeliveryAddressFlow,
  DeliveryAddressSummary,
  orderAddressString,
  type SelectedDeliveryAddress,
} from "./delivery-address-flow";

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

// Per-field validation chip, modifier-flow style: a calm neutral chip, an amber
// "needs attention" state for the one field the customer is being guided to,
// and green once satisfied. `optional` is a static muted chip.
type FieldPillState = "neutral" | "attention" | "satisfied" | "optional";

type CartCheckoutStepProps = {
  currencySettings?: CurrencySettings;
  deliverySettings?: DeliverySettings;
};

export function CartCheckoutStep({
  currencySettings = defaultCurrencySettings,
  deliverySettings = defaultDeliverySettings,
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
  // The address screens take over the whole drawer body (full-bleed map), but
  // checkout stays mounted — so the customer's name/phone/note survive the trip.
  const [addressView, setAddressView] = useState<"form" | "flow">("form");
  const [deliveryName, setDeliveryName] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliverySchedule, setDeliverySchedule] = useState<"asap" | "scheduled">(
    "asap",
  );
  const [deliveryAt, setDeliveryAt] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  // Flips true on a tap while the form is incomplete, so the first unsatisfied
  // field surfaces its inline error and the form scrolls to it.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Out-of-zone: the delivery pin falls outside the cafe's delivery radius.
  // Blocks placement (with an inline «Вне зоны доставки») rather than letting
  // the customer place an order the merchant can't fulfil.
  const outOfZone = useMemo(
    () =>
      mode === "delivery" &&
      deliverySettings.enabled &&
      deliveryAddress?.latitude != null &&
      deliveryAddress?.longitude != null &&
      !isWithinDeliveryZone(
        deliverySettings,
        deliveryAddress.latitude,
        deliveryAddress.longitude,
      ),
    [mode, deliverySettings, deliveryAddress],
  );

  // Below-minimum: the cart subtotal is under the merchant's delivery minimum.
  // Like out-of-zone, this blocks placement with a clear inline reason.
  const belowMinOrder = useMemo(
    () =>
      mode === "delivery" &&
      deliverySettings.minOrderCents > 0 &&
      summary.subtotalCents < deliverySettings.minOrderCents,
    [mode, deliverySettings, summary.subtotalCents],
  );

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
      !outOfZone &&
      !belowMinOrder &&
      (deliveryAddress?.freeform.trim().length ?? 0) > 0 &&
      deliveryName.trim().length > 0 &&
      isValidUzPhone(deliveryPhone) &&
      (deliverySchedule === "asap" || isCompleteSchedule(deliveryAt))
    );
  }, [
    belowMinOrder,
    deliveryAddress,
    deliveryAt,
    deliveryName,
    deliveryPhone,
    deliverySchedule,
    isPlacingOrder,
    mode,
    outOfZone,
    pickupAt,
    pickupPhone,
    pickupSchedule,
    tableLabel,
  ]);

  // ── Per-field validation, modifier-flow style ──────────────────────────────
  // Each required field carries its own neutral→amber→green chip. Exactly one
  // field is "attention" (amber) at a time — the first unsatisfied one — and it
  // advances as the customer completes each field.
  const timeOk = (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);

  const fieldSatisfied = (id: string): boolean => {
    switch (id) {
      case "dine-in-table":
        return tableLabel.trim().length > 0;
      case "delivery-address":
        return (deliveryAddress?.freeform.trim().length ?? 0) > 0 && !outOfZone;
      case "delivery-name":
        return deliveryName.trim().length > 0;
      case "delivery-phone":
        return isValidUzPhone(deliveryPhone);
      case "delivery-at":
        return timeOk(deliveryAt);
      case "pickup-at":
        return timeOk(pickupAt);
      default:
        return true;
    }
  };

  // Ordered required fields for the active mode (matches the visual order).
  const requiredFieldIds: string[] =
    mode === "dine_in"
      ? ["dine-in-table"]
      : mode === "pickup"
        ? pickupSchedule === "scheduled"
          ? ["pickup-at"]
          : []
        : [
            "delivery-address",
            "delivery-name",
            "delivery-phone",
            ...(deliverySchedule === "scheduled" ? ["delivery-at"] : []),
          ];

  const firstUnsatisfiedId =
    requiredFieldIds.find((id) => !fieldSatisfied(id)) ?? null;
  const requiredRemaining = requiredFieldIds.filter(
    (id) => !fieldSatisfied(id),
  ).length;

  // Chip state: optional fields show a static muted chip; required ones go
  // satisfied (green) / attention (amber — only the current guided target) /
  // neutral.
  const pillState = (id: string, required: boolean): FieldPillState => {
    if (!required) return "optional";
    if (fieldSatisfied(id)) return "satisfied";
    return submitAttempted && firstUnsatisfiedId === id
      ? "attention"
      : "neutral";
  };

  const fieldMessage = (id: string): string => {
    switch (id) {
      case "dine-in-table":
        return t("checkout.missing.table");
      case "delivery-address":
        return outOfZone
          ? t("checkout.out_of_zone")
          : t("checkout.missing.address");
      case "delivery-name":
        return t("checkout.missing.name");
      case "delivery-phone":
      case "pickup-phone":
        return t("checkout.missing.phone");
      case "delivery-at":
      case "pickup-at":
        return t("checkout.missing.time");
      default:
        return "";
    }
  };

  // Scroll the first unsatisfied field to the middle of the viewport and focus
  // it, so a gated tap takes the customer straight to what's missing instead of
  // leaving them to hunt for an error pinned at the bottom. Mirrors the item
  // sheet's `enterGuidedMode`. preventScroll keeps the focus jump from fighting
  // the smooth scroll above.
  const revealField = (fieldId: string) => {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el instanceof HTMLElement) el.focus({ preventScroll: true });
  };

  // Once a guided field is satisfied, the first-unsatisfied pointer has already
  // moved on — scroll the next one into view (the modifier-flow advance).
  // Called from each required field's completion event (blur for text inputs,
  // value-complete for phone / time / address).
  const advanceAfter = (id: string) => {
    if (!submitAttempted) return;
    if (!firstUnsatisfiedId || firstUnsatisfiedId === id) return;
    revealField(firstUnsatisfiedId);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setSubmitAttempted(true);
      if (firstUnsatisfiedId) revealField(firstUnsatisfiedId);
      return;
    }
    // The chosen address's freeform string is what a delivery order snapshots —
    // it's already " · "-joined, so it stays scannable on receipts / dashboard.
    // placeOrder toasts on failure (cart-provider), so the footer never echoes
    // an error — it stays just the total and the CTA.
    void (mode === "dine_in"
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
                address: deliveryAddress
                  ? orderAddressString(deliveryAddress, t)
                  : "",
                latitude: deliveryAddress?.latitude ?? null,
                longitude: deliveryAddress?.longitude ?? null,
                district: deliveryAddress?.district ?? null,
                street: deliveryAddress?.street ?? null,
                building: deliveryAddress?.building ?? null,
                recipientName: deliveryName.trim(),
                recipientPhone: deliveryPhone.trim(),
                scheduledFor:
                  deliverySchedule === "scheduled" ? deliveryAt : null,
                note: deliveryNote.trim() || null,
              },
            }));
  };

  // Bottom-line total, mirrored into the sticky footer below so the price is
  // ALWAYS visible — the full PricingBreakdown lives at the end of the
  // scrolling area and slides off-screen on long (delivery / schedule) forms.
  // The configured flat delivery fee (customer pays). Mirrors the server's
  // charge in placeOrder so the displayed total matches what is billed.
  const deliveryFeeCents =
    mode === "delivery"
      ? Math.max(0, Math.round(deliverySettings.feeCents))
      : 0;
  const footerTotalCents = computePricing({
    subtotalCents: summary.subtotalCents,
    taxes,
    tipCents,
    deliveryFeeCents,
  }).totalCents;

  if (addressView === "flow") {
    return (
      <DeliveryAddressFlow
        value={deliveryAddress}
        onChange={setDeliveryAddress}
        onClose={() => setAddressView("form")}
      />
    );
  }

  // Amber "needs attention" styling for the current guided field, replacing the
  // old red. Never aria-invalid (that paints destructive) — we set the warning
  // border via className and surface the message in amber below.
  const amberInput = (state: FieldPillState) =>
    state === "attention"
      ? "border-warning focus-visible:border-warning focus-visible:ring-warning/25"
      : undefined;
  const amberGroup = (state: FieldPillState) =>
    state === "attention"
      ? "border-warning has-[[data-slot=input-group-control]:focus-visible]:border-warning has-[[data-slot=input-group-control]:focus-visible]:ring-warning/25"
      : undefined;
  const amberHint = (id: string, state: FieldPillState) =>
    state === "attention" ? (
      <p id={`${id}-msg`} className="text-xs text-warning">
        {fieldMessage(id)}
      </p>
    ) : null;
  const describe = (id: string, state: FieldPillState) =>
    state === "attention" ? `${id}-msg` : undefined;

  // Chip labels + per-field chip states for this render.
  const requiredChip = t("checkout.chip.required");
  const optionalChip = t("checkout.chip.optional");
  const tableState = pillState("dine-in-table", true);
  const pickupAtState = pillState("pickup-at", true);
  const addressState = pillState("delivery-address", true);
  const nameState = pillState("delivery-name", true);
  const phoneState = pillState("delivery-phone", true);
  const deliveryAtState = pillState("delivery-at", true);

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
              <FieldRow
                htmlFor="dine-in-table"
                label={t("checkout.table.label")}
                pill={tableState}
                pillLabel={requiredChip}
              >
                <Input
                  id="dine-in-table"
                  value={tableLabel}
                  onChange={(event) => setTableLabel(event.target.value)}
                  onBlur={() => advanceAfter("dine-in-table")}
                  placeholder={t("checkout.table.placeholder")}
                  autoComplete="off"
                  className={amberInput(tableState)}
                  aria-describedby={describe("dine-in-table", tableState)}
                />
                {amberHint("dine-in-table", tableState)}
              </FieldRow>
            </FieldGroup>
          </FieldSet>
        ) : null}

        {mode === "pickup" ? (
          <FieldSet>
            <FieldGroup>
              <FieldRow label={t("checkout.schedule.pickup_when")}>
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
              </FieldRow>
              {pickupSchedule === "scheduled" ? (
                <FieldRow
                  htmlFor="pickup-at"
                  label={t("checkout.schedule.scheduled")}
                  pill={pickupAtState}
                  pillLabel={requiredChip}
                >
                  <ScheduledTimePicker
                    id="pickup-at"
                    value={pickupAt}
                    onChange={(v) => {
                      setPickupAt(v);
                      if (timeOk(v)) advanceAfter("pickup-at");
                    }}
                    datePlaceholder={t("checkout.schedule.pick_date")}
                    locale={activeLocale}
                  />
                  {amberHint("pickup-at", pickupAtState)}
                </FieldRow>
              ) : null}
              <FieldRow
                htmlFor="pickup-name"
                label={t("checkout.your_name")}
                pill="optional"
                pillLabel={optionalChip}
              >
                <Input
                  id="pickup-name"
                  value={pickupName}
                  onChange={(event) => setPickupName(event.target.value)}
                  placeholder={t("checkout.recipient.placeholder")}
                />
              </FieldRow>
              <FieldRow
                htmlFor="pickup-phone"
                label={t("checkout.phone.label")}
                pill="optional"
                pillLabel={optionalChip}
              >
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
              </FieldRow>
              <FieldRow
                htmlFor="pickup-note"
                label={t("checkout.note.label")}
                pill="optional"
                pillLabel={optionalChip}
              >
                <Textarea
                  id="pickup-note"
                  value={pickupNote}
                  onChange={(event) => setPickupNote(event.target.value)}
                  placeholder={t("checkout.note.placeholder")}
                  className="min-h-[72px] resize-none"
                />
              </FieldRow>
            </FieldGroup>
          </FieldSet>
        ) : null}

        {mode === "delivery" ? (
          <FieldSet>
            <FieldGroup>
              {/* Address book: pick a saved address or add one via the Yandex
                  map / manual form. Replaces the old district/street/building
                  trio — fewer taps, reusable, and routable (coords saved). */}
              <FieldRow
                label={t("address.title")}
                pill={addressState}
                pillLabel={requiredChip}
              >
                <DeliveryAddressSummary
                  value={deliveryAddress}
                  onChange={(a) => {
                    setDeliveryAddress(a);
                    advanceAfter("delivery-address");
                  }}
                  onOpen={() => setAddressView("flow")}
                  id="delivery-address"
                  attention={addressState === "attention"}
                />
                {amberHint("delivery-address", addressState)}
              </FieldRow>
              <FieldRow
                htmlFor="delivery-name"
                label={t("checkout.recipient.label")}
                pill={nameState}
                pillLabel={requiredChip}
              >
                <Input
                  id="delivery-name"
                  value={deliveryName}
                  onChange={(event) => setDeliveryName(event.target.value)}
                  onBlur={() => advanceAfter("delivery-name")}
                  placeholder={t("checkout.recipient.placeholder")}
                  className={amberInput(nameState)}
                  aria-describedby={describe("delivery-name", nameState)}
                />
                {amberHint("delivery-name", nameState)}
              </FieldRow>
              <FieldRow
                htmlFor="delivery-phone"
                label={t("checkout.phone.label")}
                pill={phoneState}
                pillLabel={requiredChip}
              >
                <InputGroup className={amberGroup(phoneState)}>
                  <InputGroupAddon>
                    <InputGroupText className="font-mono">+998</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="delivery-phone"
                    inputMode="tel"
                    autoComplete="tel-national"
                    className="font-mono tabular-nums"
                    value={formatUzNational(deliveryPhone)}
                    onChange={(event) => {
                      const d = event.target.value.replace(/\D/g, "").slice(0, 9);
                      setDeliveryPhone(d);
                      if (d.length === 9) advanceAfter("delivery-phone");
                    }}
                    placeholder={t("checkout.phone.placeholder")}
                    aria-describedby={describe("delivery-phone", phoneState)}
                  />
                </InputGroup>
                {amberHint("delivery-phone", phoneState)}
              </FieldRow>
              <FieldRow label={t("checkout.schedule.delivery_when")}>
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
              </FieldRow>
              {deliverySchedule === "scheduled" ? (
                <FieldRow
                  htmlFor="delivery-at"
                  label={t("checkout.schedule.scheduled")}
                  pill={deliveryAtState}
                  pillLabel={requiredChip}
                >
                  <ScheduledTimePicker
                    id="delivery-at"
                    value={deliveryAt}
                    onChange={(v) => {
                      setDeliveryAt(v);
                      if (timeOk(v)) advanceAfter("delivery-at");
                    }}
                    datePlaceholder={t("checkout.schedule.pick_date")}
                    locale={activeLocale}
                  />
                  {amberHint("delivery-at", deliveryAtState)}
                </FieldRow>
              ) : null}
              <FieldRow
                htmlFor="delivery-note"
                label={t("checkout.note.label")}
                pill="optional"
                pillLabel={optionalChip}
              >
                <Textarea
                  id="delivery-note"
                  value={deliveryNote}
                  onChange={(event) => setDeliveryNote(event.target.value)}
                  placeholder={t("checkout.note.placeholder")}
                  className="min-h-[72px] resize-none"
                />
              </FieldRow>
            </FieldGroup>
          </FieldSet>
        ) : null}

        {/* key={mode}: remount on mode switch so `defaultOpen` re-applies —
            tip opens for delivery, stays collapsed for pickup. tipCents lives
            in the parent, so a tip already set survives the remount. */}
        <TipControl
          key={mode}
          subtotalCents={summary.subtotalCents}
          tipCents={tipCents}
          setTipCents={setTipCents}
          currencySettings={currencySettings}
          defaultOpen={mode === "delivery"}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            {t("checkout.summary.heading")}
          </p>
          <PricingBreakdown
            subtotalCents={summary.subtotalCents}
            taxes={taxes}
            tipCents={tipCents}
            deliveryFeeCents={deliveryFeeCents}
            currencySettings={currencySettings}
            showTotal={false}
            deliveryActive={mode === "delivery"}
          />
          {/* Below-minimum is the one block with no field to anchor to, so it
              lives in the summary (next to the totals it's about) rather than
              the footer, which stays just the total + CTA. */}
          {belowMinOrder ? (
            <p className="text-xs text-muted-foreground">
              {t("checkout.below_min_order", {
                amount: formatPriceCents(
                  deliverySettings.minOrderCents,
                  currencySettings,
                ),
              })}
            </p>
          ) : null}
        </div>
      </div>

      {/* Sticky footer with safe-area padding so the CTA never hugs the
          home-indicator on iOS PWAs. bg-background/80 + backdrop-blur
          gives the same "fixed bottom row" lift the cart list step uses,
          so the two steps feel continuous. Inner max-w-md mirrors the
          scroll content so the CTA reads at the same width on wider
          drawers (tablet, webviews). */}
      <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-md px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
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
            disabled={isPlacingOrder}
            onClick={handleSubmit}
          >
            {isPlacingOrder ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("checkout.placing")}
              </>
            ) : requiredRemaining > 0 ? (
              requiredRemaining === 1
                ? t("add_to_cart.gated_required_one")
                : t("add_to_cart.gated_required_many", {
                    count: requiredRemaining,
                  })
            ) : (
              t("checkout.place_order")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Chip + label row that replaces the bare field label. The chip mirrors the
// item-sheet modifier groups: neutral / amber (attention) / green (satisfied)
// for required fields, a static muted "Optional" for the rest. Module-level
// (stable identity) so the inputs it wraps keep focus across renders.
function FieldRow({
  htmlFor,
  label,
  pill,
  pillLabel,
  children,
}: {
  htmlFor?: string;
  label: string;
  pill?: FieldPillState;
  pillLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium leading-none text-foreground"
        >
          {label}
        </label>
        {pill ? <RequiredPill state={pill} label={pillLabel ?? ""} /> : null}
      </div>
      {children}
    </div>
  );
}

// Pill classes mirror components/catalogs/items/modifier-picker.tsx so the cart
// and the item sheet speak the same validation language.
function RequiredPill({
  state,
  label,
}: {
  state: FieldPillState;
  label: string;
}) {
  if (state === "satisfied") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-success-muted px-2 py-0.5 text-[11px] font-medium text-success">
        <Check className="size-3" aria-hidden />
        {label}
      </span>
    );
  }
  if (state === "attention") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-warning bg-warning-muted px-2 py-0.5 text-[11px] font-medium text-warning">
        <AlertTriangle className="size-3" aria-hidden />
        {label}
      </span>
    );
  }
  // neutral + optional share the muted look (optional is simply always muted).
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

// Inline tip picker. Low-friction presets (No tip / 5% / 10%) + a "Custom"
// number input in the catalog's currency major unit. Collapsed behind an
// "Add a tip" row by default — open for delivery (where a tip is more
// expected) so it never pressures a pickup customer. Source of truth is
// `tipCents`; percentage chips compute cents from current subtotal so the
// value stays correct if the customer re-adds items before submitting.
const TIP_PRESET_PERCENTAGES = [0, 0.05, 0.1] as const;

function TipControl({
  subtotalCents,
  tipCents,
  setTipCents,
  currencySettings,
  defaultOpen = false,
}: {
  subtotalCents: number;
  tipCents: number;
  setTipCents: (next: number) => void;
  currencySettings: CurrencySettings;
  defaultOpen?: boolean;
}) {
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const t = (
    key: StorefrontMessageKey,
    vars?: Record<string, string | number>,
  ) => getStorefrontMessage(key, { activeLocale, defaultLocale, vars });
  // Collapsed by default for pickup (a tip prompt there feels pushy); open
  // for delivery, or whenever a tip has already been set.
  const [open, setOpen] = useState(defaultOpen || tipCents > 0);
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="size-4" aria-hidden />
        {t("checkout.tip.add")}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        {t("checkout.tip.label")}
      </p>
      <div className="grid grid-cols-4 gap-2">
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
