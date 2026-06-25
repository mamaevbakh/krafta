"use client";

import * as React from "react";
import { Check, MapPin, Plus, ChevronLeft } from "lucide-react";

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";

type Step = "mode" | "table" | "address" | "contact" | "schedule" | "review";

// Delivery is intentionally broken into several short steps.
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
 * Guided checkout rendered inline in the assistant, composed from shadcn
 * primitives. mode → per-mode steps (delivery is split into address → contact
 * → time) → review → cash/COD placeOrder. Delivery uses a saved-address
 * selector with a create-new map.
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

  // Delivery address: saved-address selector + create-new map.
  const [addresses, setAddresses] = React.useState<CustomerAddress[]>([]);
  const [addressesLoaded, setAddressesLoaded] = React.useState(false);
  const [selectedAddressId, setSelectedAddressId] = React.useState<string>("");
  const [showNewAddress, setShowNewAddress] = React.useState(false);
  const [pickedAddress, setPickedAddress] = React.useState<PickedAddress | null>(
    null,
  );
  const [addrResolving, setAddrResolving] = React.useState(false);

  const steps: Step[] = React.useMemo(() => {
    if (mode === null) return ["mode"];
    return [...(needsPicker ? (["mode"] as Step[]) : []), ...modeSteps(mode), "review"];
  }, [mode, needsPicker]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  React.useEffect(() => {
    if (mode !== "delivery" || step !== "address" || addressesLoaded) return;
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
        if (!cancelled) {
          setAddressesLoaded(true);
          setShowNewAddress(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step, addressesLoaded]);

  const selectedSaved =
    addresses.find((a) => a.id === selectedAddressId) ?? null;
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
    switch (step) {
      case "table":
        return fields.tableLabel.trim().length > 0;
      case "address":
        return (
          !!deliveryAddr &&
          deliveryAddr.latitude != null &&
          deliveryAddr.longitude != null &&
          !addrResolving
        );
      case "contact":
        if (mode === "delivery")
          return fields.name.trim().length > 0 && phoneValid(fields.phone);
        return true;
      case "schedule":
        return scheduleOk;
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
      <Card className="mt-2 w-full max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-3">
          <div className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold">{t("placed.title")}</p>
            <p className="text-sm text-muted-foreground">{t(subtitleKey)}</p>
            <p className="text-sm text-muted-foreground">{t(payKey)}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              cart?.resetForNewCart();
              onClose();
            }}
          >
            {t("placed.order_more")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const title =
    step === "mode"
      ? t("checkout.mode.title")
      : step === "review"
        ? t("checkout.summary.heading")
        : step === "table"
          ? t("checkout.mode.dine_in")
          : step === "address"
            ? t("address.title")
            : step === "contact"
              ? t("checkout.section.contact")
              : t(
                  mode === "delivery"
                    ? "checkout.schedule.delivery_when"
                    : "checkout.schedule.pickup_when",
                );

  const placePrice = formatPriceCents(
    computePricing({
      subtotalCents,
      taxes: cart?.taxes ?? [],
      tipCents: cart?.tipCents ?? 0,
    }).totalCents,
    currency,
  );

  return (
    <div className="mt-2 w-full max-w-md space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {step === "mode" ? (
            <CardDescription>{t("checkout.mode.subtitle")}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode */}
          {step === "mode" ? (
            <RadioGroup
              value={mode ?? ""}
              onValueChange={(v) => setMode(v as CartFulfillmentMode)}
            >
              {modes.map((m) => (
                <div key={m} className="flex items-center gap-3">
                  <RadioGroupItem value={m} id={`mode-${m}`} />
                  <Label htmlFor={`mode-${m}`}>{t(MODE_KEY[m])}</Label>
                </div>
              ))}
            </RadioGroup>
          ) : null}

          {/* Dine-in table */}
          {step === "table" ? (
            <div className="grid gap-2">
              <Label htmlFor="co-table">{t("checkout.table.label")}</Label>
              <Input
                id="co-table"
                value={fields.tableLabel}
                disabled={!!lockedTable}
                onChange={(e) => setField("tableLabel", e.target.value)}
                placeholder={t("checkout.table.placeholder")}
              />
            </div>
          ) : null}

          {/* Delivery — address selector / create new */}
          {step === "address" ? (
            <div className="space-y-3">
              {!showNewAddress && addresses.length > 0 ? (
                <>
                  <RadioGroup
                    value={selectedAddressId}
                    onValueChange={(id) => {
                      setSelectedAddressId(id);
                      setPickedAddress(null);
                      const a = addresses.find((x) => x.id === id);
                      setField("apt", a?.apartment ?? "");
                    }}
                  >
                    {addresses.map((a) => (
                      <Label
                        key={a.id}
                        htmlFor={`addr-${a.id}`}
                        className="flex items-center gap-3 rounded-md border p-3"
                      >
                        <RadioGroupItem value={a.id} id={`addr-${a.id}`} />
                        <MapPin className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-normal">
                          {a.freeform}
                        </span>
                        {a.isDefault ? (
                          <Badge variant="outline">{t("address.default")}</Badge>
                        ) : null}
                      </Label>
                    ))}
                  </RadioGroup>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowNewAddress(true);
                      setPickedAddress(null);
                    }}
                  >
                    <Plus /> {t("address.add")}
                  </Button>
                </>
              ) : (
                <div className="space-y-2">
                  {addresses.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => {
                        setShowNewAddress(false);
                        setPickedAddress(null);
                      }}
                    >
                      <ChevronLeft /> {t("address.title")}
                    </Button>
                  ) : null}
                  <div className="h-60 w-full overflow-hidden rounded-md border">
                    <AddressMapPicker
                      onChange={setPickedAddress}
                      onResolvingChange={setAddrResolving}
                      searchPlaceholder={t("address.search")}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {addrResolving
                      ? t("address.resolving")
                      : (pickedAddress?.freeform ?? t("address.map_hint"))}
                  </p>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="co-apt">{t("address.field.apartment")}</Label>
                <Input
                  id="co-apt"
                  value={fields.apt}
                  onChange={(e) => setField("apt", e.target.value)}
                  placeholder={t("address.field.apartment")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="co-note">{t("checkout.note.label")}</Label>
                <Textarea
                  id="co-note"
                  value={fields.note}
                  onChange={(e) => setField("note", e.target.value)}
                  placeholder={t("checkout.note.placeholder")}
                />
              </div>
            </div>
          ) : null}

          {/* Contact */}
          {step === "contact" ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="co-name">{t("checkout.your_name")}</Label>
                <Input
                  id="co-name"
                  value={fields.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder={t("checkout.recipient.placeholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="co-phone">{t("checkout.phone.label")}</Label>
                <Input
                  id="co-phone"
                  inputMode="tel"
                  value={fields.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder={t("checkout.phone.placeholder")}
                />
              </div>
            </div>
          ) : null}

          {/* Schedule */}
          {step === "schedule" ? (
            <div className="space-y-3">
              <RadioGroup
                value={fields.scheduleType}
                onValueChange={(v) =>
                  setField("scheduleType", v as "asap" | "scheduled")
                }
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="asap" id="when-asap" />
                  <Label htmlFor="when-asap">
                    {t("checkout.schedule.asap")}
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="scheduled" id="when-scheduled" />
                  <Label htmlFor="when-scheduled">
                    {t("checkout.schedule.scheduled")}
                  </Label>
                </div>
              </RadioGroup>
              {fields.scheduleType === "scheduled" ? (
                <Input
                  type="datetime-local"
                  value={fields.scheduledFor}
                  onChange={(e) => setField("scheduledFor", e.target.value)}
                />
              ) : null}
            </div>
          ) : null}

          {/* Review */}
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
              <Separator />
              <PricingBreakdown
                subtotalCents={subtotalCents}
                taxes={cart?.taxes ?? []}
                tipCents={cart?.tipCents ?? 0}
                currencySettings={currency}
                compact
              />
              <div className="space-y-2">
                <Label>{t("checkout.tip.label")}</Label>
                <div className="flex flex-wrap gap-2">
                  {tipPresets.map((cents, i) => (
                    <Button
                      key={i}
                      type="button"
                      size="sm"
                      variant={
                        (cart?.tipCents ?? 0) === cents ? "default" : "outline"
                      }
                      onClick={() => cart?.setTipCents(cents)}
                    >
                      {i === 0 ? (
                        t("checkout.tip.none")
                      ) : (
                        <span className="font-mono tabular-nums">
                          {i === 1 ? "5%" : "10%"}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
              {orderError ? (
                <p className="text-sm text-destructive">{orderError}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Actions below the card */}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!canContinue || placing}
          onClick={advance}
        >
          {isLast
            ? placing
              ? t("checkout.placing")
              : `${t("checkout.place_order")} · ${placePrice}`
            : t("cart.continue")}
        </Button>
        <Button variant="outline" onClick={back}>
          {stepIndex === 0 ? t("checkout.edit_cart") : t("checkout.back")}
        </Button>
      </div>
    </div>
  );
}
