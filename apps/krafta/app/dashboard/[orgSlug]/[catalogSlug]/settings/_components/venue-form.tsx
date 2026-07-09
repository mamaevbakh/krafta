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
import { useT } from "@/lib/locales/dashboard/context";

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
  const t = useT();
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
        toast.error(result.error ?? t("settings.venue.save_error"));
        return;
      }
      toast.success(t("settings.venue.saved"));
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <FieldSet>
        <FieldLegend>{t("settings.venue.identity_legend")}</FieldLegend>
        <FieldDescription>
          {t("settings.venue.identity_description")}
        </FieldDescription>
        <FieldGroup className="mt-6 gap-6">
          <Field>
            <FieldLabel>{t("settings.venue.name_label")}</FieldLabel>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("settings.venue.name_placeholder")}
              disabled={isPending}
            />
          </Field>

          <Field orientation="horizontal">
            <FieldLabel className="flex flex-col items-start gap-1">
              <span>{t("settings.venue.accept_orders_label")}</span>
              <span className="text-muted-foreground text-xs font-normal">
                {t("settings.venue.accept_orders_hint")}
              </span>
            </FieldLabel>
            <Switch
              checked={acceptingOrders}
              onCheckedChange={setAcceptingOrders}
              disabled={isPending}
              aria-label={t("settings.venue.accept_orders_label")}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t("settings.venue.modes_legend")}</FieldLegend>
        <FieldDescription>
          {t("settings.venue.modes_description")}
        </FieldDescription>
        <FieldGroup className="mt-6">
          <ModesEditor value={modes} onChange={setModes} disabled={isPending} />
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t("settings.venue.hours_legend")}</FieldLegend>
        <FieldDescription>
          {t("settings.venue.hours_description")}
        </FieldDescription>
        <FieldGroup className="mt-6">
          <HoursEditor value={hours} onChange={setHours} disabled={isPending} />
          {hoursError ? (
            <p className="text-destructive text-sm">
              {t("settings.venue.hours_error")}
            </p>
          ) : null}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t("settings.venue.locale_legend")}</FieldLegend>
        <FieldDescription>
          {t("settings.venue.locale_description")}
        </FieldDescription>
        <FieldGroup className="mt-6 gap-6">
          <Field>
            <FieldLabel>{t("settings.venue.currency_label")}</FieldLabel>
            <Combobox
              value={currency}
              onChange={setCurrency}
              options={currencyOptions}
              placeholder={t("settings.venue.currency_placeholder")}
              searchPlaceholder={t("settings.venue.currency_search")}
              emptyMessage={t("settings.venue.currency_empty")}
              disabled={isPending}
            />
          </Field>

          <Field>
            <FieldLabel>{t("settings.venue.timezone_label")}</FieldLabel>
            <Combobox
              value={timezone}
              onChange={setTimezone}
              options={timezoneOptions}
              placeholder={t("settings.venue.timezone_placeholder")}
              searchPlaceholder={t("settings.venue.timezone_search")}
              emptyMessage={t("settings.venue.timezone_empty")}
              disabled={isPending}
            />
          </Field>

          <Field>
            <FieldLabel>{t("settings.venue.language_label")}</FieldLabel>
            <Combobox
              value={languageCode}
              onChange={setLanguageCode}
              options={languageOptions}
              placeholder={t("settings.venue.language_placeholder")}
              searchPlaceholder={t("settings.venue.language_search")}
              emptyMessage={t("settings.venue.language_empty")}
              disabled={isPending}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t("settings.venue.address_legend")}</FieldLegend>
        <FieldDescription>
          {t("settings.venue.address_description")}
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
              {t("common.saving")}
            </>
          ) : (
            t("common.save_changes")
          )}
        </Button>
      </div>
    </form>
  );
}
