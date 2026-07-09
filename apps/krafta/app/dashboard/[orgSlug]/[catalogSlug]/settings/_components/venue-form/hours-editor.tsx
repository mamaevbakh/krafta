"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/locales/dashboard/context";
import { cn } from "@/lib/utils";

export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type HoursWindow = { open: string; close: string };

// Single window per day in v1 (multi-window deferred). Empty array means closed.
export type BusinessHours = Record<DayKey, HoursWindow[]>;

export const DAY_ORDER: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "22:00";

export function emptyBusinessHours(): BusinessHours {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
}

// Pull a known shape out of jsonb. Tolerates missing days, malformed entries,
// and legacy multi-window data (we keep the first window only in v1).
export function normalizeBusinessHours(raw: unknown): BusinessHours {
  const out = emptyBusinessHours();
  if (!raw || typeof raw !== "object") return out;
  const record = raw as Record<string, unknown>;
  for (const day of DAY_ORDER) {
    const dayValue = record[day];
    if (!Array.isArray(dayValue) || dayValue.length === 0) continue;
    const first = dayValue[0];
    if (
      first &&
      typeof first === "object" &&
      typeof (first as { open?: unknown }).open === "string" &&
      typeof (first as { close?: unknown }).close === "string"
    ) {
      out[day] = [
        {
          open: (first as { open: string }).open,
          close: (first as { close: string }).close,
        },
      ];
    }
  }
  return out;
}

type HoursEditorProps = {
  value: BusinessHours;
  onChange: (next: BusinessHours) => void;
  disabled?: boolean;
};

export function HoursEditor({ value, onChange, disabled }: HoursEditorProps) {
  const t = useT();
  const setDay = (day: DayKey, windows: HoursWindow[]) => {
    onChange({ ...value, [day]: windows });
  };

  return (
    <div className="flex flex-col divide-y divide-border rounded-md border">
      {DAY_ORDER.map((day) => {
        const windows = value[day];
        const closed = windows.length === 0;
        const window = windows[0] ?? { open: DEFAULT_OPEN, close: DEFAULT_CLOSE };
        const invalid = !closed && window.open >= window.close;
        const dayLabel = t(`settings.venue.day.${day}`);

        return (
          <div
            key={day}
            className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[7rem_1fr_auto]"
          >
            <div className="text-sm font-medium">{dayLabel}</div>

            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={window.open}
                disabled={disabled || closed}
                onChange={(event) =>
                  setDay(day, [{ ...window, open: event.target.value }])
                }
                className={cn(
                  "w-32",
                  invalid && "border-destructive",
                )}
                aria-label={t("settings.venue.day_opens_at", { day: dayLabel })}
                aria-invalid={invalid || undefined}
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="time"
                value={window.close}
                disabled={disabled || closed}
                onChange={(event) =>
                  setDay(day, [{ ...window, close: event.target.value }])
                }
                className={cn(
                  "w-32",
                  invalid && "border-destructive",
                )}
                aria-label={t("settings.venue.day_closes_at", { day: dayLabel })}
                aria-invalid={invalid || undefined}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground sm:justify-self-end">
              <Checkbox
                checked={closed}
                disabled={disabled}
                onCheckedChange={(next) => {
                  if (next === true) {
                    setDay(day, []);
                  } else {
                    setDay(day, [
                      { open: DEFAULT_OPEN, close: DEFAULT_CLOSE },
                    ]);
                  }
                }}
                aria-label={t("settings.venue.day_closed", { day: dayLabel })}
              />
              {t("settings.venue.closed")}
            </label>
          </div>
        );
      })}
    </div>
  );
}

export function hoursHaveError(hours: BusinessHours): boolean {
  return DAY_ORDER.some((day) => {
    const windows = hours[day];
    if (windows.length === 0) return false;
    const w = windows[0];
    if (!w) return false;
    return !w.open || !w.close || w.open >= w.close;
  });
}
