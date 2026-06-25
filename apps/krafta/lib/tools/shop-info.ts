import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { normalizeDeliverySettings } from "@/lib/catalogs/settings/delivery";
import { normalizeCurrencySettings } from "@/lib/catalogs/settings/currency";

type DayWindow = { open?: string; close?: string };

/**
 * Compute open-now from per-day business hours in the venue's timezone.
 * Returns null when hours aren't set (so the assistant says "hours aren't set"
 * rather than guessing). Limitation: no overnight windows (close<open is
 * invalid in the editor), and a paused venue reads as closed.
 */
function computeOpenNow(
  businessHours: unknown,
  timezone: string | null,
  status: string,
): boolean | null {
  if (status !== "active") return false;
  if (!businessHours || typeof businessHours !== "object") return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const weekday = parts
      .find((p) => p.type === "weekday")
      ?.value?.toLowerCase();
    let hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    if (hour === "24") hour = "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    const now = `${hour}:${minute}`;
    const windows = (businessHours as Record<string, DayWindow[]>)[
      weekday ?? ""
    ];
    if (!Array.isArray(windows) || windows.length === 0) return false;
    return windows.some(
      (w) => w?.open && w?.close && w.open <= now && now < w.close,
    );
  } catch {
    return null;
  }
}

function adminClient() {
  const url =
    process.env.KRAFTA_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KRAFTA_SUPABASE_SECRET_KEY ??
    process.env.KRAFTA_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Shop-info configuration is missing.");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

/**
 * getShopInfo — structured logistics for the assistant: hours/open-now, order
 * modes (delivery/pickup/dine-in), delivery fee/minimum/radius, address,
 * currency, and the Telegram mini-app link. Scope bound server-side.
 */
export function createShopInfoTool(scope: {
  catalogId: string;
  catalogSlug?: string | null;
}) {
  return tool({
    description:
      "Get this shop's practical info: whether it's open now, opening hours, " +
      "which order types it offers (delivery / pickup / dine-in), delivery fee, " +
      "minimum order and radius, the address, and the currency. Use this for any " +
      "question about hours, being open, location, or delivery.",
    inputSchema: z.object({}),
    execute: async () => {
      const supabase = adminClient();

      const [{ data: venue }, { data: catalog }] = await Promise.all([
        supabase
          .from("venues")
          .select(
            "name, status, modes_enabled, business_hours, timezone, address",
          )
          .eq("catalog_id", scope.catalogId)
          .maybeSingle(),
        supabase
          .from("catalogs")
          .select("settings_delivery, settings_currency")
          .eq("id", scope.catalogId)
          .maybeSingle(),
      ]);

      const modes = (venue?.modes_enabled ?? []) as string[];
      const delivery = normalizeDeliverySettings(
        (catalog?.settings_delivery ?? {}) as Record<string, unknown>,
      );
      const currency = normalizeCurrencySettings(
        (catalog?.settings_currency ?? {}) as Record<string, unknown>,
      );
      const status = venue?.status ?? "active";
      const address = (venue?.address ?? {}) as Record<string, string>;
      const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");

      return {
        name: venue?.name ?? null,
        status,
        acceptingOrders: status === "active",
        openNow: computeOpenNow(
          venue?.business_hours,
          venue?.timezone ?? null,
          status,
        ),
        hours: venue?.business_hours ?? null,
        timezone: venue?.timezone ?? null,
        orderModes: modes,
        delivery: {
          available: modes.includes("delivery"),
          feeCents: delivery.feeCents,
          minOrderCents: delivery.minOrderCents,
          radiusM: delivery.radiusM,
          zoneGated: delivery.enabled,
        },
        pickup: modes.includes("pickup"),
        dineIn: modes.includes("dine_in"),
        address: {
          country: address.country ?? "",
          city: address.city ?? "",
          street: address.street ?? "",
          postal: address.postal ?? "",
          notes: address.notes ?? "",
        },
        currency: { code: currency.defaultCurrency, label: currency.label },
        telegramMiniApp:
          venue && botUsername && scope.catalogSlug
            ? `https://t.me/${botUsername}?startapp=${scope.catalogSlug}`
            : null,
      };
    },
  });
}
