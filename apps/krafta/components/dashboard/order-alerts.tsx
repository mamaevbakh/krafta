"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { pinRealtimeAuth } from "@/lib/supabase/realtime";
import { useChimeMute } from "@/lib/hooks/use-chime-mute";

const NEW_ORDER_SOUND_SRC = "/sounds/notif.mp3";
const TOAST_DURATION_MS = 10_000;

const MODE_LABEL: Record<string, string> = {
  dine_in: "dine-in",
  pickup: "pickup",
  delivery: "delivery",
  digital: "",
};

type OrderAlertsProps = {
  catalogId: string;
  ordersHref: string;
};

/**
 * Dashboard-wide new-order alert. Mounted once in the catalog layout, so it
 * rings + toasts on EVERY dashboard page (not just Orders / Overview). This is
 * the interim surface before real push notifications:
 *   - plays the chime (respecting the per-catalog mute)
 *   - shows a 10-second sonner toast with a "View" action
 *   - refreshes the current route (debounced) so live data stays fresh
 *
 * The reliable "a customer placed an order" signal is a fulfillment INSERT
 * (orders are created as drafts/carts first, then transition to open with a
 * fulfillment) — same signal the Orders page has always used.
 */
export function OrderAlerts({ catalogId, ordersHref }: OrderAlertsProps) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { muted } = useChimeMute(catalogId);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return; // coalesce a burst into one refresh
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 2000);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Pin the merchant JWT or realtime evaluates as anon and sees nothing.
      await pinRealtimeAuth(supabase);
      if (cancelled) return;

      channelRef = supabase
        .channel(`order-alerts:${catalogId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "commerce",
            table: "orders",
            filter: `catalog_id=eq.${catalogId}`,
          },
          () => scheduleRefresh(),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "commerce", table: "fulfillments" },
          (payload) => {
            const type = (payload.new as { type?: string } | null)?.type ?? "";
            const modeWord = MODE_LABEL[type] ?? "";
            const title = modeWord ? `New ${modeWord} order` : "New order";

            if (!mutedRef.current) {
              const audio = audioRef.current;
              if (audio) {
                audio.currentTime = 0;
                void audio.play().catch(() => {});
              }
            }

            toast(title, {
              description: "A customer just placed an order.",
              duration: TOAST_DURATION_MS,
              action: {
                label: "View",
                onClick: () => router.push(ordersHref),
              },
            });

            scheduleRefresh();
          },
        )
        .subscribe();
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (channelRef) void supabase.removeChannel(channelRef);
    };
  }, [catalogId, ordersHref, router, scheduleRefresh]);

  return (
    <audio ref={audioRef} src={NEW_ORDER_SOUND_SRC} preload="auto" aria-hidden />
  );
}
