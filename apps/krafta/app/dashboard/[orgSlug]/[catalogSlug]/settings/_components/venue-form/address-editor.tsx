"use client";

import * as React from "react";

import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { COUNTRY_CODES, getCountryName } from "@/lib/locale/countries";
import { useT } from "@/lib/locales/dashboard/context";

export type VenueAddress = {
  country: string;
  city: string;
  street: string;
  postal: string;
  notes: string;
};

export function emptyAddress(): VenueAddress {
  return { country: "", city: "", street: "", postal: "", notes: "" };
}

export function normalizeAddress(raw: unknown): VenueAddress {
  const out = emptyAddress();
  if (!raw || typeof raw !== "object") return out;
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(out) as (keyof VenueAddress)[]) {
    const value = record[key];
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

type AddressEditorProps = {
  value: VenueAddress;
  onChange: (next: VenueAddress) => void;
  disabled?: boolean;
};

export function AddressEditor({
  value,
  onChange,
  disabled,
}: AddressEditorProps) {
  const t = useT();
  const countryOptions = React.useMemo<ComboboxOption[]>(
    () =>
      COUNTRY_CODES.map((code) => ({
        value: code,
        label: getCountryName(code),
        hint: code,
      })),
    [],
  );

  const set = <K extends keyof VenueAddress>(key: K, next: VenueAddress[K]) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <FieldGroup className="gap-6">
      <Field>
        <FieldLabel>{t("settings.venue.country_label")}</FieldLabel>
        <Combobox
          value={value.country}
          onChange={(code) => set("country", code)}
          options={countryOptions}
          placeholder={t("settings.venue.country_placeholder")}
          searchPlaceholder={t("settings.venue.country_search")}
          emptyMessage={t("settings.venue.country_empty")}
          disabled={disabled}
        />
      </Field>

      <Field>
        <FieldLabel>{t("settings.venue.city_label")}</FieldLabel>
        <Input
          value={value.city}
          onChange={(event) => set("city", event.target.value)}
          disabled={disabled}
          placeholder={t("settings.venue.city_placeholder")}
        />
      </Field>

      <Field>
        <FieldLabel>{t("settings.venue.street_label")}</FieldLabel>
        <Input
          value={value.street}
          onChange={(event) => set("street", event.target.value)}
          disabled={disabled}
          placeholder={t("settings.venue.street_placeholder")}
        />
      </Field>

      <Field>
        <FieldLabel>{t("settings.venue.postal_label")}</FieldLabel>
        <Input
          value={value.postal}
          onChange={(event) => set("postal", event.target.value)}
          disabled={disabled}
          placeholder={t("settings.venue.postal_placeholder")}
        />
        <FieldDescription>{t("settings.venue.postal_hint")}</FieldDescription>
      </Field>

      <Field>
        <FieldLabel>{t("settings.venue.notes_label")}</FieldLabel>
        <Textarea
          value={value.notes}
          onChange={(event) => set("notes", event.target.value)}
          disabled={disabled}
          placeholder={t("settings.venue.notes_placeholder")}
          className="min-h-20 resize-none"
        />
      </Field>
    </FieldGroup>
  );
}
