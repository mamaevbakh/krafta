"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Loader2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import type { CurrencySettings } from "@/lib/catalogs/settings/currency";
import {
  type DeliverySettings,
  defaultDeliverySettings,
} from "@/lib/catalogs/settings/delivery";
import { formatPriceInputValue, parsePriceInput } from "@/lib/catalogs/pricing";
import { cn } from "@/lib/utils";
import { updateDeliverySettings } from "./actions";

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

// The map is browser-only (ymaps3 touches `window`); load it client-side.
const AddressMapPicker = dynamic(
  () =>
    import("@/components/catalogs/cart/address-map-picker").then(
      (m) => m.AddressMapPicker,
    ),
  { ssr: false, loading: () => <MapSkeleton /> },
);

// Radius quick-picks (metres). The slider still allows anything in between.
const RADIUS_PRESETS = [1000, 2000, 3000, 5000, 10000] as const;
const RADIUS_MIN = 500;
const RADIUS_MAX = 20000;
const RADIUS_STEP = 250;

function formatKm(radiusM: number): string {
  const km = radiusM / 1000;
  return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;
}

type DeliveryFormProps = {
  catalogId: string;
  catalogSlug: string;
  initial: DeliverySettings;
  currencySettings: CurrencySettings;
  /** Whether the venue has the delivery order mode switched on. When off, the
   *  zone is configurable but won't actually surface to customers — we say so. */
  deliveryModeEnabled: boolean;
};

export function DeliveryForm({
  catalogId,
  catalogSlug,
  initial,
  currencySettings,
  deliveryModeEnabled,
}: DeliveryFormProps) {
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [radiusM, setRadiusM] = React.useState(initial.radiusM);
  const [origin, setOrigin] = React.useState<{
    lat: number;
    lng: number;
    label: string | null;
  } | null>(
    initial.originLat != null && initial.originLng != null
      ? { lat: initial.originLat, lng: initial.originLng, label: null }
      : null,
  );
  const [feeDraft, setFeeDraft] = React.useState(() =>
    formatPriceInputValue(initial.feeCents, currencySettings),
  );
  const [minOrderDraft, setMinOrderDraft] = React.useState(() =>
    formatPriceInputValue(initial.minOrderCents, currencySettings),
  );
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [statusKind, setStatusKind] = React.useState<"ok" | "error">("ok");
  const [isPending, startTransition] = React.useTransition();

  // The map reverse-geocodes its centre on every settle; that centre IS the
  // delivery origin. We keep the most recent label for the confirmation line.
  const handleOriginChange = React.useCallback(
    (a: {
      latitude: number;
      longitude: number;
      freeform: string;
    }) => {
      setOrigin({ lat: a.latitude, lng: a.longitude, label: a.freeform });
    },
    [],
  );

  const handleSave = React.useCallback(() => {
    setStatusMessage(null);
    const feeCents = parsePriceInput(feeDraft, currencySettings) ?? 0;
    const minOrderCents = parsePriceInput(minOrderDraft, currencySettings) ?? 0;

    startTransition(async () => {
      const result = await updateDeliverySettings({
        catalogId,
        catalogSlug,
        enabled,
        originLat: origin?.lat ?? null,
        originLng: origin?.lng ?? null,
        radiusM,
        feeCents,
        minOrderCents,
      });

      if (!result.ok) {
        setStatusKind("error");
        setStatusMessage(result.error ?? "Unable to save delivery settings.");
        return;
      }

      // Echo the normalized values back so the UI reflects the server's guard
      // (e.g. `enabled` collapsing to false without an origin).
      setEnabled(result.settings.enabled);
      setRadiusM(result.settings.radiusM);
      setFeeDraft(
        formatPriceInputValue(result.settings.feeCents, currencySettings),
      );
      setMinOrderDraft(
        formatPriceInputValue(result.settings.minOrderCents, currencySettings),
      );
      setStatusKind("ok");
      setStatusMessage("Delivery zone saved.");
    });
  }, [
    catalogId,
    catalogSlug,
    currencySettings,
    enabled,
    feeDraft,
    minOrderDraft,
    origin,
    radiusM,
  ]);

  const canEnable = origin != null;

  return (
    <div className="space-y-8">
      <FieldSet>
        <FieldLegend>Delivery zone</FieldLegend>
        <FieldDescription>
          Set your cafe location and how far you deliver. Orders pinned outside
          this radius are blocked at checkout.
        </FieldDescription>

        {!deliveryModeEnabled ? (
          <div className="mt-4 rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
            Delivery isn&apos;t in your enabled order modes yet — turn it on
            under <span className="font-medium text-foreground">Venue</span> for
            customers to see this zone.
          </div>
        ) : null}

        <FieldGroup className="mt-6 gap-6">
          {/* The map: drag so the pin sits on your cafe. The ring previews the
              delivery radius live as you adjust the slider. */}
          <Field>
            <FieldLabel>Cafe location &amp; radius</FieldLabel>
            <div className="relative h-[400px] w-full overflow-hidden rounded-xl border sm:h-[460px]">
              <AddressMapPicker
                initial={
                  origin ? { latitude: origin.lat, longitude: origin.lng } : null
                }
                radiusM={radiusM}
                onChange={handleOriginChange}
                searchPlaceholder="Find your cafe address"
                className="h-full w-full"
              />
            </div>
            <FieldDescription>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" />
                {origin?.label ? (
                  <span className="text-foreground">{origin.label}</span>
                ) : (
                  "Drag the map so the pin sits on your cafe."
                )}
              </span>
            </FieldDescription>
          </Field>

          {/* Radius control. */}
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel>Delivery radius</FieldLabel>
              <span className="text-sm font-medium tabular-nums">
                {formatKm(radiusM)}
              </span>
            </div>
            <input
              type="range"
              min={RADIUS_MIN}
              max={RADIUS_MAX}
              step={RADIUS_STEP}
              value={radiusM}
              onChange={(e) => setRadiusM(Number(e.target.value))}
              className="w-full accent-foreground"
              aria-label="Delivery radius in metres"
            />
            <div className="mt-1 flex flex-wrap gap-2">
              {RADIUS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRadiusM(preset)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition",
                    radiusM === preset
                      ? "border-foreground/30 bg-foreground/5 text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/30",
                  )}
                >
                  {formatKm(preset)}
                </button>
              ))}
            </div>
          </Field>

          {/* Fee + minimum order, currency-aware. */}
          <div className="grid gap-6 sm:grid-cols-2">
            <Field>
              <FieldLabel>Delivery fee</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="decimal"
                  value={feeDraft}
                  onChange={(e) => setFeeDraft(e.target.value)}
                  placeholder="0"
                  aria-label="Delivery fee"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {currencySettings.label}
                </span>
              </div>
              <FieldDescription>
                Flat fee added to every delivery order. 0 = free delivery.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Minimum order</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="decimal"
                  value={minOrderDraft}
                  onChange={(e) => setMinOrderDraft(e.target.value)}
                  placeholder="0"
                  aria-label="Minimum order for delivery"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {currencySettings.label}
                </span>
              </div>
              <FieldDescription>
                Smallest subtotal you accept for delivery. 0 = no minimum.
              </FieldDescription>
            </Field>
          </div>

          {/* Master enable. */}
          <Field>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5 pr-4">
                <FieldLabel>Enforce this zone</FieldLabel>
                <FieldDescription>
                  {canEnable
                    ? "Block checkout for addresses outside the radius."
                    : "Set your cafe location on the map first."}
                </FieldDescription>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={!canEnable}
                aria-label="Enforce delivery zone"
              />
            </div>
          </Field>
        </FieldGroup>
      </FieldSet>

      {statusMessage ? (
        <p
          className={cn(
            "text-sm",
            statusKind === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {statusMessage}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? (
            <>
              <Spinner className="size-4" />
              Saving
            </>
          ) : (
            "Save delivery zone"
          )}
        </Button>
      </div>
    </div>
  );
}

export type { DeliverySettings };
export { defaultDeliverySettings };
