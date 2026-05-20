"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { CURRENCY_CODES, getCurrencyName } from "@/lib/locale/currencies";
import { LANGUAGE_CODES, getLanguageName } from "@/lib/locale/languages";
import { getTimezoneLabel, getTimezones } from "@/lib/locale/timezones";

import {
  AddressEditor,
  emptyAddress,
  normalizeAddress,
  type VenueAddress,
} from "./venue-form/address-editor";
import {
  HoursEditor,
  hoursHaveError,
  normalizeBusinessHours,
  type BusinessHours,
} from "./venue-form/hours-editor";
import { ModesEditor, type VenueMode } from "./venue-form/modes-editor";
import { updateVenueSettings } from "./actions";

type VenueFormProps = {
  catalogId: string;
  catalogSlug: string;
  venue: {
    name: string;
    status: "active" | "paused" | "archived";
    modes_enabled: string[];
    business_hours: unknown;
    currency: string;
    timezone: string;
    language_code: string;
    address: unknown;
  };
};

const ALLOWED_MODES: VenueMode[] = ["dine_in", "pickup", "delivery"];

function normalizeModes(raw: string[]): VenueMode[] {
  const set = new Set(raw.filter((m): m is VenueMode =>
    ALLOWED_MODES.includes(m as VenueMode),
  ));
  // Preserve canonical order so the UI is stable regardless of DB order.
  return ALLOWED_MODES.filter((m) => set.has(m));
}

export function VenueForm({ catalogId, catalogSlug, venue }: VenueFormProps) {
  const [name, setName] = React.useState(venue.name);
  // Status dropdown is hidden in v1 — only active ↔ paused via the Switch.
  // Existing 'archived' rows stay archived until exposed in a future ticket.
  const [acceptingOrders, setAcceptingOrders] = React.useState(
    venue.status === "active",
  );
  const [modes, setModes] = React.useState<VenueMode[]>(() =>
    normalizeModes(venue.modes_enabled),
  );
  const [hours, setHours] = React.useState<BusinessHours>(() =>
    normalizeBusinessHours(venue.business_hours),
  );
  const [currency, setCurrency] = React.useState(venue.currency);
  const [timezone, setTimezone] = React.useState(venue.timezone);
  const [languageCode, setLanguageCode] = React.useState(venue.language_code);
  const [address, setAddress] = React.useState<VenueAddress>(() => {
    const normalized = normalizeAddress(venue.address);
    return Object.values(normalized).some((value) => value !== "")
      ? normalized
      : emptyAddress();
  });

  const [isPending, startTransition] = React.useTransition();

  const currencyOptions = React.useMemo<ComboboxOption[]>(
    () =>
      CURRENCY_CODES.map((code) => ({
        value: code,
        label: `${code} — ${getCurrencyName(code)}`,
        hint: code,
      })),
    [],
  );

  const languageOptions = React.useMemo<ComboboxOption[]>(
    () =>
      LANGUAGE_CODES.map((code) => ({
        value: code,
        label: getLanguageName(code),
        hint: code,
      })),
    [],
  );

  const timezoneOptions = React.useMemo<ComboboxOption[]>(() => {
    const zones = getTimezones();
    return zones.map((zone) => ({
      value: zone,
      label: getTimezoneLabel(zone),
      hint: zone,
    }));
  }, []);

  const trimmedName = name.trim();
  const hoursError = hoursHaveError(hours);
  const canSave =
    !isPending &&
    trimmedName.length > 0 &&
    modes.length > 0 &&
    !hoursError &&
    /^[A-Z]{3}$/.test(currency);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;

    const status: "active" | "paused" = acceptingOrders ? "active" : "paused";
    const submission = {
      catalogId,
      catalogSlug,
      name: trimmedName,
      status,
      modesEnabled: modes,
      businessHours: hours,
      currency,
      timezone,
      languageCode,
      address: {
        country: address.country,
        city: address.city.trim(),
        street: address.street.trim(),
        postal: address.postal.trim(),
        notes: address.notes.trim(),
      },
    };

    startTransition(async () => {
      const result = await updateVenueSettings(submission);
      if (!result.ok) {
        toast.error(result.error ?? "Unable to save venue settings.");
        return;
      }
      toast.success("Venue settings saved.");
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <FieldSet>
        <FieldLegend>Identity</FieldLegend>
        <FieldDescription>
          The name customers see for this venue.
        </FieldDescription>
        <FieldGroup className="mt-6 gap-6">
          <Field>
            <FieldLabel>Venue name</FieldLabel>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Khiva Branch"
              disabled={isPending}
            />
          </Field>

          <Field orientation="horizontal">
            <FieldLabel className="flex flex-col items-start gap-1">
              <span>Accept orders</span>
              <span className="text-muted-foreground text-xs font-normal">
                When off, the storefront shows the venue as paused.
              </span>
            </FieldLabel>
            <Switch
              checked={acceptingOrders}
              onCheckedChange={setAcceptingOrders}
              disabled={isPending}
              aria-label="Accept orders"
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Order modes</FieldLegend>
        <FieldDescription>
          At least one mode must stay enabled.
        </FieldDescription>
        <FieldGroup className="mt-6">
          <ModesEditor value={modes} onChange={setModes} disabled={isPending} />
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Hours</FieldLegend>
        <FieldDescription>
          Single window per day. Overnight hours come with bar mode.
        </FieldDescription>
        <FieldGroup className="mt-6">
          <HoursEditor value={hours} onChange={setHours} disabled={isPending} />
          {hoursError ? (
            <p className="text-destructive text-sm">
              Closing time must be after opening time.
            </p>
          ) : null}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Locale</FieldLegend>
        <FieldDescription>
          Currency, timezone, and default language for receipts and the menu.
        </FieldDescription>
        <FieldGroup className="mt-6 gap-6">
          <Field>
            <FieldLabel>Currency</FieldLabel>
            <Combobox
              value={currency}
              onChange={setCurrency}
              options={currencyOptions}
              placeholder="Select currency"
              searchPlaceholder="Search currencies…"
              emptyMessage="No currency found."
              disabled={isPending}
            />
          </Field>

          <Field>
            <FieldLabel>Timezone</FieldLabel>
            <Combobox
              value={timezone}
              onChange={setTimezone}
              options={timezoneOptions}
              placeholder="Select timezone"
              searchPlaceholder="Search timezones…"
              emptyMessage="No timezone found."
              disabled={isPending}
            />
          </Field>

          <Field>
            <FieldLabel>Language</FieldLabel>
            <Combobox
              value={languageCode}
              onChange={setLanguageCode}
              options={languageOptions}
              placeholder="Select language"
              searchPlaceholder="Search languages…"
              emptyMessage="No language found."
              disabled={isPending}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Address</FieldLegend>
        <FieldDescription>
          Used on receipts and pickup directions.
        </FieldDescription>
        <div className="mt-6">
          <AddressEditor
            value={address}
            onChange={setAddress}
            disabled={isPending}
          />
        </div>
      </FieldSet>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={!canSave}>
          {isPending ? (
            <>
              <Spinner className="size-4" />
              Saving
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}
