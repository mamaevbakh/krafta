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
import { useT } from "@/lib/locales/dashboard/context";
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
  const t = useT();
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
        setStatusMessage(result.error ?? t("settings.delivery.save_error"));
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
      setStatusMessage(t("settings.delivery.saved"));
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
    t,
  ]);

  const canEnable = origin != null;

  return (
    <div className="space-y-8">
      <FieldSet>
        <FieldLegend>{t("settings.delivery.zone_legend")}</FieldLegend>
        <FieldDescription>
          {t("settings.delivery.zone_description")}
        </FieldDescription>

        {!deliveryModeEnabled ? (
          <div className="mt-4 rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
            {t("settings.delivery.mode_off_notice")}
          </div>
        ) : null}

        <FieldGroup className="mt-6 gap-6">
          {/* The map: drag so the pin sits on your cafe. The ring previews the
              delivery radius live as you adjust the slider. */}
          <Field>
            <FieldLabel>{t("settings.delivery.location_label")}</FieldLabel>
            <div className="relative h-[400px] w-full overflow-hidden rounded-xl border sm:h-[460px]">
              <AddressMapPicker
                initial={
                  origin ? { latitude: origin.lat, longitude: origin.lng } : null
                }
                radiusM={radiusM}
                onChange={handleOriginChange}
                searchPlaceholder={t("settings.delivery.map_search_placeholder")}
                className="h-full w-full"
              />
            </div>
            <FieldDescription>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" />
                {origin?.label ? (
                  <span className="text-foreground">{origin.label}</span>
                ) : (
                  t("settings.delivery.drag_hint")
                )}
              </span>
            </FieldDescription>
          </Field>

          {/* Radius control. */}
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel>{t("settings.delivery.radius_label")}</FieldLabel>
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
              aria-label={t("settings.delivery.radius_aria")}
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
              <FieldLabel>{t("settings.delivery.fee_label")}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="decimal"
                  value={feeDraft}
                  onChange={(e) => setFeeDraft(e.target.value)}
                  placeholder="0"
                  aria-label={t("settings.delivery.fee_label")}
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {currencySettings.label}
                </span>
              </div>
              <FieldDescription>
                {t("settings.delivery.fee_hint")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>{t("settings.delivery.min_order_label")}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="decimal"
                  value={minOrderDraft}
                  onChange={(e) => setMinOrderDraft(e.target.value)}
                  placeholder="0"
                  aria-label={t("settings.delivery.min_order_aria")}
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {currencySettings.label}
                </span>
              </div>
              <FieldDescription>
                {t("settings.delivery.min_order_hint")}
              </FieldDescription>
            </Field>
          </div>

          {/* Master enable. */}
          <Field>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5 pr-4">
                <FieldLabel>{t("settings.delivery.enforce_label")}</FieldLabel>
                <FieldDescription>
                  {canEnable
                    ? t("settings.delivery.enforce_hint_ready")
                    : t("settings.delivery.enforce_hint_need_location")}
                </FieldDescription>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={!canEnable}
                aria-label={t("settings.delivery.enforce_aria")}
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
              {t("common.saving")}
            </>
          ) : (
            t("settings.delivery.save_cta")
          )}
        </Button>
      </div>
    </div>
  );
}

export type { DeliverySettings };
export { defaultDeliverySettings };
