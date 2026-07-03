"use client";

import { Package, Truck, Utensils, type LucideIcon } from "lucide-react";

import type { OverviewOrder } from "./types";

/** Same mode → icon mapping the Orders table uses, kept in sync deliberately. */
export const MODE_ICON: Record<NonNullable<OverviewOrder["mode"]>, LucideIcon> =
  {
    dine_in: Utensils,
    pickup: Package,
    delivery: Truck,
    digital: Package,
  };

const RTF =
  typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl
    ? new Intl.RelativeTimeFormat("en", { numeric: "auto" })
    : null;

/** "5 min ago" style relative time; falls back to the ISO string. */
export function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts) || !RTF) return iso;
  const seconds = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return RTF.format(seconds, "second");
  if (abs < 3600) return RTF.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(seconds / 3600), "hour");
  return RTF.format(Math.round(seconds / 86400), "day");
}
