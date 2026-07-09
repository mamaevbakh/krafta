"use client";

/**
 * scheduled-time-picker.tsx — replaces the raw <Input type="datetime-local">
 * in CheckoutStep's pickup + delivery scheduled branches.
 *
 * Composition: shadcn Calendar in a Popover (date) + a compact
 * <Input type="time"> (HH:mm). Combined output is the same ISO-local
 * shape datetime-local emits, so the server contract
 * (`pickupAt`, `scheduledFor`) is unchanged.
 *
 *   value/onChange wire shape: "YYYY-MM-DDTHH:mm" or ""
 *
 * Constraints (kept light — server-side validation still authoritative):
 *   - earliest selectable date is today; latest is +14 days (covers a
 *     reasonable scheduled-order window without overwhelming the
 *     calendar grid).
 *   - if the chosen date is today, the time input is bounded to
 *     ≥ now + 15 min so the kitchen has a fighting chance.
 */

import { useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useStorefrontLocale } from "@/lib/catalogs/storefront-locale-context";
import { getStorefrontMessage } from "@/lib/locales/messages";
import { cn } from "@/lib/utils";

type ScheduledTimePickerProps = {
  /** Combined ISO-local string ("YYYY-MM-DDTHH:mm") or "" if unset. */
  value: string;
  onChange: (next: string) => void;
  /** id for the visible date trigger button — pairs with htmlFor on FieldLabel. */
  id?: string;
  /** Localized placeholder when no date is picked yet. */
  datePlaceholder: string;
  /** Locale-aware short date format. Defaults to en-GB-style. */
  locale?: string;
  /** Minimum minutes from now (for today). */
  minOffsetMin?: number;
};

const MAX_DAYS_AHEAD = 14;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

function parseValue(value: string): { date: Date | null; time: string } {
  if (!value) return { date: null, time: "" };
  const [datePart, timePart] = value.split("T");
  if (!datePart) return { date: null, time: "" };
  // Build date in local tz (NOT new Date(datePart) — that parses as UTC).
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return { date: null, time: timePart ?? "" };
  return { date: new Date(y, m - 1, d), time: timePart ?? "" };
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function ScheduledTimePicker({
  value,
  onChange,
  id,
  datePlaceholder,
  locale,
  minOffsetMin = 15,
}: ScheduledTimePickerProps) {
  const { activeLocale, defaultLocale } = useStorefrontLocale();
  const [open, setOpen] = useState(false);
  const { date, time } = useMemo(() => parseValue(value), [value]);

  // Earliest selectable: midnight today. Latest: +MAX_DAYS_AHEAD.
  const { min, max } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ceiling = new Date(today);
    ceiling.setDate(ceiling.getDate() + MAX_DAYS_AHEAD);
    return { min: today, max: ceiling };
  }, []);

  // For the time input: when the picked date is today, the floor is
  // "now + minOffsetMin"; otherwise any time is valid.
  const timeMin = useMemo(() => {
    if (!date) return undefined;
    const now = new Date();
    if (!isSameDay(date, now)) return "00:00";
    const floor = new Date(now.getTime() + minOffsetMin * 60_000);
    return `${pad2(floor.getHours())}:${pad2(floor.getMinutes())}`;
  }, [date, minOffsetMin]);

  const dateLabel = useMemo(() => {
    if (!date) return datePlaceholder;
    try {
      return new Intl.DateTimeFormat(locale ?? "en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(date);
    } catch {
      return dateOnly(date);
    }
  }, [date, datePlaceholder, locale]);

  const handleDate = (next: Date | undefined) => {
    if (!next) return;
    const datePart = dateOnly(next);
    // Preserve time if the customer set it first; otherwise leave empty
    // so the time input renders empty and they pick.
    onChange(time ? `${datePart}T${time}` : `${datePart}T`);
    setOpen(false);
  };

  const handleTime = (rawTime: string) => {
    if (!date) return;
    const datePart = dateOnly(date);
    onChange(`${datePart}T${rawTime}`);
  };

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={id}
            variant="outline"
            className={cn(
              "flex-1 justify-start text-left font-normal",
              !date && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date ?? undefined}
            onSelect={handleDate}
            disabled={{ before: min, after: max }}
            // Show today as the navigated month on open so the customer
            // doesn't have to page back from January every time.
            defaultMonth={date ?? min}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        // Time input is meaningless without a date — disable until they
        // pick one. Once they do, the floor (timeMin) keeps "today" times
        // sensible.
        disabled={!date}
        min={timeMin}
        value={time}
        onChange={(event) => handleTime(event.target.value)}
        className="w-32 shrink-0 font-mono tabular-nums"
        aria-label={getStorefrontMessage("checkout.schedule.time_aria", {
          activeLocale,
          defaultLocale,
        })}
      />
    </div>
  );
}
