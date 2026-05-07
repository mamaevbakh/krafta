"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  useCart,
  type CartFulfillmentMode,
} from "./cart-provider";

const MODE_LABELS: Record<CartFulfillmentMode, string> = {
  dine_in: "Dine-in",
  pickup: "Pickup",
  delivery: "Delivery",
};

const MODE_DESCRIPTIONS: Record<CartFulfillmentMode, string> = {
  dine_in: "Order to your table.",
  pickup: "Pick up from the counter.",
  delivery: "Bring it to me.",
};

export function CartCheckoutStep() {
  const { modes, isPlacingOrder, placeOrder, setStep } = useCart();

  const initialMode = modes[0] ?? "dine_in";
  const [mode, setMode] = useState<CartFulfillmentMode>(initialMode);

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
        <FieldSet>
          <FieldLabel className="text-base font-semibold">
            How would you like it?
          </FieldLabel>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {modes.map((option) => {
              const isActive = option === mode;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMode(option)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:border-foreground/30",
                  )}
                  aria-pressed={isActive}
                >
                  <div>
                    <div className="text-sm font-medium">
                      {MODE_LABELS[option]}
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 text-xs",
                        isActive
                          ? "text-background/75"
                          : "text-muted-foreground",
                      )}
                    >
                      {MODE_DESCRIPTIONS[option]}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </FieldSet>

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
