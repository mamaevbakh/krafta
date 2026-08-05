"use client";

import { useT } from "@/lib/locales/context";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";

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
  /**
   * The session is still open, so a failed intent is retryable here rather than
   * final. True on recovery links sent out with `subscription.payment_failed`.
   */
  isRecoverable = false,
}: {
  publicToken: string;
  initial: StatusResponse | null;
  isRecoverable?: boolean;
}) {
  const t = useT();
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
    if (s === "succeeded") return t("checkout.status.paid");
    if (s === "failed") return t("checkout.status.failed");
    if (s === "processing") return t("checkout.status.processing");
    if (s === "requires_action") return t("checkout.status.awaitingConfirmation");
    if (s === "open") return t("checkout.status.open");
    // A status we have no name for used to be shown to the customer as the raw
    // database value with its underscores swapped out ("requires payment
    // method"). Better to say nothing specific than to leak our schema at them.
    return t("checkout.status.unknown");
  }, [data, t]);

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

  const intentStatus = (data?.paymentIntent?.status ?? "").toLowerCase();

  // Pre-action there is nothing to report. The realtime + polling effects above
  // keep running regardless, so progress appears the moment a payment starts —
  // no premature spinner / raw "requires payment method…" competing with the
  // card form. `requires_payment_method` is the INITIAL status of a fresh link
  // (and persists through card + OTP entry until apply flips it to processing).
  const preActionStatuses = ["", "open", "requires_action", "requires_payment_method"];
  if (!error && preActionStatuses.includes(intentStatus)) {
    return null;
  }

  return (
    <div className="mt-8 border-t pt-6 text-sm">
      {error ? (
        <p className="text-muted-foreground">
          {t("checkout.statusChecking")}
        </p>
      ) : intentStatus === "succeeded" ? (
        <p className="font-medium">{t("checkout.statusConfirmed")}</p>
      ) : intentStatus === "failed" || intentStatus === "canceled" || intentStatus === "cancelled" ? (
        // A recovery link (see createRecoveryCheckoutSession) puts a customer on
        // this page precisely BECAUSE the last charge failed, with a live card
        // form above. A bare "Payment failed." there reads as a dead end next to
        // the form we want them to use, so say what to do instead.
        isRecoverable ? (
          <p className="text-muted-foreground">{t("checkout.retryHint")}</p>
        ) : (
          <p className="font-medium text-destructive">
            {intentStatus === "failed" ? t("checkout.statusFailed") : t("checkout.statusCanceled")}
          </p>
        )
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="size-4" />
          <span>{statusLabel}…</span>
        </div>
      )}
    </div>
  );
}
