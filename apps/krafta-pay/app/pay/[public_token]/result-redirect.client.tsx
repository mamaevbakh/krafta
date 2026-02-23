"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type ResultMode = "success" | "failure";

function isTerminal(status?: string | null) {
  const s = (status ?? "").toLowerCase();
  return s === "succeeded" || s === "failed" || s === "canceled" || s === "cancelled";
}

function topNavigate(url: string) {
  try {
    if (window.top && window.top !== window) {
      window.top.location.assign(url);
      return;
    }
  } catch {
    // Cross-frame access shouldn't happen here (same-origin), but fallback anyway.
  }
  window.location.assign(url);
}

export function PayResultRedirect({
  publicToken,
  mode,
  merchantSuccessUrl,
  merchantCancelUrl,
  merchantReturnUrl,
}: {
  publicToken: string;
  mode: ResultMode;
  merchantSuccessUrl: string | null;
  merchantCancelUrl: string | null;
  merchantReturnUrl: string | null;
}) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const didStartCountdown = useRef(false);

  const primaryTarget = useMemo(() => {
    if (mode === "success") {
      return merchantSuccessUrl ?? merchantReturnUrl ?? `/pay/${publicToken}`;
    }
    return merchantCancelUrl ?? merchantReturnUrl ?? merchantSuccessUrl ?? `/pay/${publicToken}`;
  }, [merchantCancelUrl, merchantReturnUrl, merchantSuccessUrl, mode, publicToken]);

  const statusTarget = useMemo(() => {
    const intentStatus = status?.paymentIntent?.status?.toLowerCase();
    if (intentStatus === "succeeded") {
      return merchantSuccessUrl ?? merchantReturnUrl ?? `/pay/${publicToken}`;
    }
    if (intentStatus === "failed" || intentStatus === "canceled" || intentStatus === "cancelled") {
      return merchantCancelUrl ?? merchantReturnUrl ?? merchantSuccessUrl ?? `/pay/${publicToken}`;
    }
    return primaryTarget;
  }, [
    merchantCancelUrl,
    merchantReturnUrl,
    merchantSuccessUrl,
    primaryTarget,
    publicToken,
    status?.paymentIntent?.status,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch(
          `/api/checkout_sessions/${encodeURIComponent(publicToken)}/status`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => null)) as StatusResponse | null;
        if (!res.ok || !json) {
          throw new Error((json as any)?.error ?? `http_${res.status}`);
        }
        if (!cancelled) {
          setStatus(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    void fetchStatus();
    const interval = window.setInterval(() => {
      if (isTerminal(status?.paymentIntent?.status)) return;
      void fetchStatus();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [publicToken, status?.paymentIntent?.status]);

  useEffect(() => {
    if (didStartCountdown.current) return;

    const intentStatus = status?.paymentIntent?.status?.toLowerCase();
    const shouldStartForSuccess = mode === "success" && intentStatus === "succeeded";
    const shouldStartForFailure =
      mode === "failure" &&
      (intentStatus === "failed" ||
        intentStatus === "canceled" ||
        intentStatus === "cancelled");

    if (!shouldStartForSuccess && !shouldStartForFailure) return;

    didStartCountdown.current = true;
    setCountdown(4);
  }, [mode, status?.paymentIntent?.status]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      topNavigate(statusTarget);
      return;
    }

    const t = window.setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, statusTarget]);

  const intentStatus = status?.paymentIntent?.status?.toLowerCase() ?? "unknown";
  const waitingForWebhook =
    mode === "success" ? intentStatus !== "succeeded" : !isTerminal(intentStatus);
  const isSucceeded = intentStatus === "succeeded";
  const isFailed =
    intentStatus === "failed" || intentStatus === "canceled" || intentStatus === "cancelled";

  const title =
    mode === "success"
      ? isSucceeded
        ? "Subscription payment confirmed"
        : "Finalizing your subscription"
      : isFailed
        ? "Payment was not completed"
        : "Checking payment status";

  const helperText =
    mode === "success"
      ? isSucceeded
        ? "Your card was attached and your subscription payment is confirmed. We will return you automatically."
        : "Your card was attached successfully. Krafta Pay is now confirming the subscription charge."
      : isFailed
        ? "The payment was not completed. You can return and try again."
        : "We are still checking the result with the payment provider.";

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-sm">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Krafta Pay
        </div>
        <h1 className="mt-3 text-2xl font-semibold">{title}</h1>

        <div className="mt-4 rounded-xl border p-4">
          <div className="text-sm text-muted-foreground">Current status</div>
          <div className="mt-1 text-lg font-medium capitalize">
            {intentStatus.replace(/_/g, " ")}
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">{helperText}</p>

        {waitingForWebhook ? (
          <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            This can take a few seconds while we process provider callbacks and webhooks.
          </div>
        ) : null}

        {countdown !== null ? (
          <p className="mt-4 text-sm">
            Continuing in <span className="font-semibold">{countdown}</span>s...
          </p>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
            onClick={() => topNavigate(statusTarget)}
          >
            Continue now
          </button>
          <a
            href={`/pay/${encodeURIComponent(publicToken)}`}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Back to checkout
          </a>
        </div>
      </div>
    </div>
  );
}
