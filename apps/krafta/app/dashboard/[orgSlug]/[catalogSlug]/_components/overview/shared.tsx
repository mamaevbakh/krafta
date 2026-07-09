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

const RTF_SUPPORTED =
  typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl;
const RTF_CACHE = new Map<string, Intl.RelativeTimeFormat>();

/** Lazily build (and cache) a RelativeTimeFormat for the active UI locale. */
function getRtf(locale: string): Intl.RelativeTimeFormat | null {
  if (!RTF_SUPPORTED) return null;
  let rtf = RTF_CACHE.get(locale);
  if (!rtf) {
    try {
      rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    } catch {
      rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    }
    RTF_CACHE.set(locale, rtf);
  }
  return rtf;
}

/** "5 min ago" style relative time; falls back to the ISO string. */
export function formatRelative(iso: string, locale = "en"): string {
  const ts = Date.parse(iso);
  const rtf = getRtf(locale);
  if (Number.isNaN(ts) || !rtf) return iso;
  const seconds = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}
