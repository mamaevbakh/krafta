"use client";

import * as React from "react";

import { Switch } from "@/components/ui/switch";

export type VenueMode = "dine_in" | "pickup" | "delivery";

const MODE_DEFINITIONS: { id: VenueMode; label: string; hint: string }[] = [
  { id: "dine_in", label: "Dine-in", hint: "QR scan at table" },
  { id: "pickup", label: "Pickup", hint: "Customer comes to you" },
  { id: "delivery", label: "Delivery", hint: "You bring it to them" },
];

type ModesEditorProps = {
  value: VenueMode[];
  onChange: (modes: VenueMode[]) => void;
  disabled?: boolean;
};

export function ModesEditor({ value, onChange, disabled }: ModesEditorProps) {
  const enabledSet = React.useMemo(() => new Set(value), [value]);
  const onlyOneEnabled = enabledSet.size === 1;

  const toggle = (mode: VenueMode, checked: boolean) => {
    const next = new Set(enabledSet);
    if (checked) {
      next.add(mode);
    } else {
      next.delete(mode);
    }
    // Preserve canonical order so the array on the server is stable.
    const ordered = MODE_DEFINITIONS.map((m) => m.id).filter((id) =>
      next.has(id),
    );
    onChange(ordered);
  };

  return (
    <div className="flex flex-col divide-y divide-border rounded-md border">
      {MODE_DEFINITIONS.map((mode) => {
        const checked = enabledSet.has(mode.id);
        const isLastEnabled = checked && onlyOneEnabled;
        return (
          <label
            key={mode.id}
            className="flex cursor-pointer items-start gap-4 px-4 py-3"
          >
            <Switch
              checked={checked}
              onCheckedChange={(next) => toggle(mode.id, next)}
              disabled={disabled || isLastEnabled}
              aria-label={mode.label}
            />
            <div className="flex-1">
              <div className="text-sm font-medium">{mode.label}</div>
              <div className="text-xs text-muted-foreground">{mode.hint}</div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
