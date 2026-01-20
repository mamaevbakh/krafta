"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StatusResponse = {
  checkoutSession: {
    id: string;
    publicToken: string;
    status: string;
    selectedProviderId: string | null;
    selectedAttemptId: string | null;
    successUrl: string | null;
    cancelUrl: string | null;
    returnUrl: string | null;
    updatedAt: string;
  };
  paymentIntent: {
    status: string;
    amountMinor: number;
    currency: string;
    description: string | null;
    updatedAt: string;
  } | null;
  selectedAttempt: {
    status: string;
    providerId: string;
    updatedAt: string;
  } | null;
};

function isTerminalIntentStatus(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  return s === "succeeded" || s === "failed" || s === "canceled" || s === "cancelled";
}

export function CheckoutStatusWatcher({
  publicToken,
  initial,
}: {
  publicToken: string;
  initial: StatusResponse | null;
}) {
  const [data, setData] = useState<StatusResponse | null>(initial);
  const [error, setError] = useState<string | null>(null);

  const latestStatusRef = useRef<string | null>(initial?.paymentIntent?.status ?? null);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(
        `/api/checkout_sessions/${encodeURIComponent(publicToken)}/status`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => null)) as StatusResponse | null;
      if (!res.ok || !json) {
        throw new Error((json as any)?.error ?? `http_${res.status}`);
      }
      latestStatusRef.current = json.paymentIntent?.status ?? null;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [publicToken]);

  const statusLabel = useMemo(() => {
    const s = (data?.paymentIntent?.status ?? data?.checkoutSession.status ?? "unknown").toLowerCase();
    if (s === "succeeded") return "Paid";
    if (s === "failed") return "Failed";
    if (s === "processing") return "Processing";
    if (s === "requires_action") return "Awaiting confirmation";
    if (s === "open") return "Open";
    return s.replace(/_/g, " ") || "Unknown";
  }, [data]);

  useEffect(() => {
    // Load latest status once on mount.
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`checkout:${publicToken}`)
      .on(
        "broadcast",
        { event: "checkout_updated" },
        () => {
          void fetchStatus();
        }
      );

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [publicToken, fetchStatus]);

  useEffect(() => {
    // Fallback polling until terminal.
    const interval = setInterval(() => {
      if (isTerminalIntentStatus(latestStatusRef.current)) return;
      void fetchStatus();
    }, 4000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  const isTerminal = isTerminalIntentStatus(data?.paymentIntent?.status ?? null);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">Status</div>
          <div className="text-lg font-semibold">{statusLabel}</div>
        </div>

        {isTerminal ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {data?.paymentIntent?.status?.toLowerCase() === "succeeded" ? "Confirmed" : "Done"}
          </span>
        ) : (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            Live
          </span>
        )}
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!isTerminal ? (
        <div className="mt-2 text-xs text-muted-foreground">
          This page updates instantly when the payment is confirmed.
        </div>
      ) : null}
    </div>
  );
}
