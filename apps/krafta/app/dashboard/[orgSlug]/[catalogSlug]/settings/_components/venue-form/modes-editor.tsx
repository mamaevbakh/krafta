"use client";

import * as React from "react";

import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/locales/dashboard/context";

export type VenueMode = "dine_in" | "pickup" | "delivery";

// Canonical order for the array persisted to the server.
const MODE_IDS: VenueMode[] = ["dine_in", "pickup", "delivery"];

type ModesEditorProps = {
  value: VenueMode[];
  onChange: (modes: VenueMode[]) => void;
  disabled?: boolean;
};

export function ModesEditor({ value, onChange, disabled }: ModesEditorProps) {
  const t = useT();
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
    const ordered = MODE_IDS.filter((id) => next.has(id));
    onChange(ordered);
  };

  return (
    <div className="flex flex-col divide-y divide-border rounded-md border">
      {MODE_IDS.map((id) => {
        const checked = enabledSet.has(id);
        const isLastEnabled = checked && onlyOneEnabled;
        const label = t(`settings.venue.mode.${id}_label`);
        return (
          <label
            key={id}
            className="flex cursor-pointer items-start gap-4 px-4 py-3"
          >
            <Switch
              checked={checked}
              onCheckedChange={(next) => toggle(id, next)}
              disabled={disabled || isLastEnabled}
              aria-label={label}
            />
            <div className="flex-1">
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">
                {t(`settings.venue.mode.${id}_hint`)}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
