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
        <FieldLabel>Country</FieldLabel>
        <Combobox
          value={value.country}
          onChange={(code) => set("country", code)}
          options={countryOptions}
          placeholder="Select country"
          searchPlaceholder="Search countries…"
          emptyMessage="No country found."
          disabled={disabled}
        />
      </Field>

      <Field>
        <FieldLabel>City</FieldLabel>
        <Input
          value={value.city}
          onChange={(event) => set("city", event.target.value)}
          disabled={disabled}
          placeholder="Tashkent"
        />
      </Field>

      <Field>
        <FieldLabel>Street</FieldLabel>
        <Input
          value={value.street}
          onChange={(event) => set("street", event.target.value)}
          disabled={disabled}
          placeholder="Amir Temur Avenue 1"
        />
      </Field>

      <Field>
        <FieldLabel>Postal code</FieldLabel>
        <Input
          value={value.postal}
          onChange={(event) => set("postal", event.target.value)}
          disabled={disabled}
          placeholder="100000"
        />
        <FieldDescription>Optional.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Notes</FieldLabel>
        <Textarea
          value={value.notes}
          onChange={(event) => set("notes", event.target.value)}
          disabled={disabled}
          placeholder="Floor, unit, landmark…"
          className="min-h-20 resize-none"
        />
      </Field>
    </FieldGroup>
  );
}
