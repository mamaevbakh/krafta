"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  CheckoutFields,
  Currency,
  Order,
  OrderMode,
  PricingBreakdown,
} from "@/lib/commerce-client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCart } from "./cart-provider";
import { ChevronLeftIcon, SpinnerIcon } from "./icons";
import { Price } from "./price";
import { PricingSummary } from "./pricing-summary";

const MODE_LABEL: Record<OrderMode, string> = {
  dine_in: "Dine-in",
  pickup: "Pickup",
  delivery: "Delivery",
};

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-foreground";

const TIP_PRESETS = [0, 0.05, 0.1] as const;

/**
 * Checkout: pick a fulfilment mode (only those the catalog enables), fill the
 * mode-specific fields, optionally tip, and place a Cash/COD order. All pricing
 * (taxes, fees, delivery, tip, total) is fetched from the engine via
 * `getCartPricing` — never computed here.
 */
export function CheckoutForm({
  currency,
  onBack,
  onPlaced,
}: {
  currency: Currency;
  onBack: () => void;
  onPlaced: (order: Order) => void;
}) {
  const cart = useCart();
  const modes = cart.orderModes;

  const [mode, setMode] = useState<OrderMode>(modes[0] ?? "pickup");

  // One field bag, reused across modes (switching tabs keeps what was typed).
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [table, setTable] = useState("");
  const [address, setAddress] = useState("");
  const [apartment, setApartment] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [note, setNote] = useState("");
  const [tipCents, setTipCents] = useState(0);

  const [pricing, setPricing] = useState<PricingBreakdown | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const coords = useMemo(() => {
    const la = Number(lat);
    const ln = Number(lng);
    if (lat.trim() && lng.trim() && Number.isFinite(la) && Number.isFinite(ln)) {
      return { lat: la, lng: ln };
    }
    return null;
  }, [lat, lng]);

  // Refresh the server pricing preview whenever an input that affects it
  // changes (mode / tip / delivery coords). Debounced so typing coords doesn't
  // spam the engine.
  const getPricing = cart.getPricing;
  useEffect(() => {
    let cancelled = false;
    setPricingLoading(true);
    const handle = setTimeout(() => {
      getPricing({
        mode,
        tipCents,
        deliveryCoords: mode === "delivery" && coords ? coords : undefined,
      })
        .then((next) => {
          if (!cancelled) setPricing(next);
        })
        .catch(() => {
          /* keep the last good preview */
        })
        .finally(() => {
          if (!cancelled) setPricingLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // cart.subtotalCents is a dep so a price_changed re-sync (which replaces the
    // server cart) re-fetches the corrected pricing preview the customer reviews.
  }, [getPricing, mode, tipCents, coords, cart.subtotalCents]);

  const canPlace = useMemo(() => {
    if (mode === "dine_in") return table.trim().length > 0;
    if (mode === "delivery") {
      return (
        name.trim().length > 0 &&
        phone.trim().length > 0 &&
        address.trim().length > 0
      );
    }
    return true; // pickup — all fields optional
  }, [mode, table, name, phone, address]);

  const handlePlace = async () => {
    setFormError(null);
    setPlacing(true);
    try {
      // <input type="datetime-local"> yields a tz-less local wall-clock string
      // ("2026-06-30T14:30"); convert to a real UTC instant so the engine's
      // timestamptz column stores the time the customer actually picked.
      const scheduledForIso = scheduledFor
        ? new Date(scheduledFor).toISOString()
        : undefined;
      const fields: CheckoutFields =
        mode === "dine_in"
          ? { table: table.trim() }
          : mode === "pickup"
            ? {
                name: name.trim() || undefined,
                phone: phone.trim() || undefined,
                scheduledFor: scheduledForIso,
                note: note.trim() || undefined,
              }
            : {
                name: name.trim(),
                phone: phone.trim(),
                address: [address.trim(), apartment.trim()]
                  .filter(Boolean)
                  .join(", "),
                apartment: apartment.trim() || undefined,
                coords: coords ?? undefined,
                scheduledFor: scheduledForIso,
                note: note.trim() || undefined,
              };
      const result = await cart.placeOrder({ mode, fields, tipCents });
      if (result.ok) {
        onPlaced(result.order);
      } else {
        setFormError(result.message);
      }
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header with back */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to cart"
          className="flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-accent"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <h2 className="text-lg font-semibold tracking-tight">Checkout</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Mode picker — only enabled modes */}
        {modes.length > 1 ? (
          <div role="radiogroup" aria-label="Fulfilment" className="flex gap-2">
            {modes.map((m) => {
              const active = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-accent",
                  )}
                >
                  {MODE_LABEL[m]}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Per-mode fields */}
        {mode === "dine_in" ? (
          <Field label="Table" htmlFor="co-table" required>
            <input
              id="co-table"
              className={inputClass}
              value={table}
              onChange={(e) => setTable(e.target.value)}
              placeholder="e.g. 12"
              autoComplete="off"
            />
          </Field>
        ) : null}

        {mode !== "dine_in" ? (
          <>
            {mode === "delivery" ? (
              <>
                <Field label="Address" htmlFor="co-address" required>
                  <input
                    id="co-address"
                    className={inputClass}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, building"
                    autoComplete="street-address"
                  />
                </Field>
                <Field label="Apartment / floor" htmlFor="co-apt">
                  <input
                    id="co-apt"
                    className={inputClass}
                    value={apartment}
                    onChange={(e) => setApartment(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                {/* Map pin seam: a full map picker is a follow-up. Coordinates
                    are optional here — when present they let the engine price
                    delivery and enforce the zone. */}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Latitude" htmlFor="co-lat">
                    <input
                      id="co-lat"
                      className={inputClass}
                      inputMode="decimal"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      placeholder="Optional"
                    />
                  </Field>
                  <Field label="Longitude" htmlFor="co-lng">
                    <input
                      id="co-lng"
                      className={inputClass}
                      inputMode="decimal"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      placeholder="Optional"
                    />
                  </Field>
                </div>
              </>
            ) : null}

            <Field
              label="Name"
              htmlFor="co-name"
              required={mode === "delivery"}
            >
              <input
                id="co-name"
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={mode === "delivery" ? "Recipient name" : "Optional"}
                autoComplete="name"
              />
            </Field>

            <Field
              label="Phone"
              htmlFor="co-phone"
              required={mode === "delivery"}
            >
              <input
                id="co-phone"
                className={inputClass}
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={mode === "delivery" ? "For the courier" : "Optional"}
              />
            </Field>

            <Field label="Schedule for later" htmlFor="co-when">
              <input
                id="co-when"
                type="datetime-local"
                className={inputClass}
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </Field>

            <Field label="Note" htmlFor="co-note">
              <textarea
                id="co-note"
                rows={2}
                className={cn(inputClass, "resize-none")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything we should know?"
              />
            </Field>
          </>
        ) : null}

        {/* Tip */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Tip</p>
          <div className="flex flex-wrap gap-2">
            {TIP_PRESETS.map((pct) => {
              const value = Math.round(cart.subtotalCents * pct);
              // Guard against a 0 subtotal making every preset (all == 0) read
              // as active, and against a stale highlight after the subtotal moves.
              const active =
                pct === 0
                  ? tipCents === 0
                  : cart.subtotalCents > 0 && tipCents === value;
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setTipCents(value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-accent",
                  )}
                >
                  {pct === 0 ? "No tip" : `${Math.round(pct * 100)}%`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Server pricing */}
        {pricing ? (
          <PricingSummary
            pricing={pricing}
            className={cn(pricingLoading && "opacity-60 transition-opacity")}
          />
        ) : null}

        {formError ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
            {formError}
          </p>
        ) : null}
      </div>

      {/* Sticky place button */}
      <div className="border-t border-border p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <Button
          type="button"
          size="lg"
          className="w-full justify-between"
          disabled={!canPlace || placing}
          onClick={handlePlace}
        >
          {placing ? (
            <span className="flex items-center gap-2">
              <SpinnerIcon className="size-4" />
              Placing…
            </span>
          ) : (
            <span>Place order</span>
          )}
          {pricing ? (
            <Price
              cents={pricing.totalCents}
              currency={currency}
              className="font-semibold"
            />
          ) : null}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1.5 text-sm font-medium text-foreground"
      >
        {label}
        {required ? null : (
          <span className="text-xs font-normal text-muted-foreground">
            (optional)
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
