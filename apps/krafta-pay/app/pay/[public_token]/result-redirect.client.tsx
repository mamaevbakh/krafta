"use client";

import { useT } from "@/lib/locales/context";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { formatMinorAmount } from "@/lib/format";

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
  const t = useT();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const didStartCountdown = useRef(false);

  // Null when the merchant gave us nowhere to send the customer — which is the
  // normal case for a link created from the dashboard, where there is no
  // merchant site behind the payment. Previously this fell back to
  // `/pay/{token}`, so a customer who had just paid was pushed back onto the
  // checkout page they had already completed.
  const primaryTarget = useMemo(() => {
    if (mode === "success") {
      return merchantSuccessUrl ?? merchantReturnUrl ?? null;
    }
    return merchantCancelUrl ?? merchantReturnUrl ?? merchantSuccessUrl ?? null;
  }, [merchantCancelUrl, merchantReturnUrl, merchantSuccessUrl, mode]);

  const statusTarget = useMemo(() => {
    const intentStatus = status?.paymentIntent?.status?.toLowerCase();
    if (intentStatus === "succeeded") {
      return merchantSuccessUrl ?? merchantReturnUrl ?? null;
    }
    if (intentStatus === "failed" || intentStatus === "canceled" || intentStatus === "cancelled") {
      return merchantCancelUrl ?? merchantReturnUrl ?? merchantSuccessUrl ?? null;
    }
    return primaryTarget;
  }, [
    merchantCancelUrl,
    merchantReturnUrl,
    merchantSuccessUrl,
    primaryTarget,
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
      if (isTerminal(status?.paymentIntent?.status) && !retryPending) return;
      void fetchStatus();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [publicToken, retryPending, status?.paymentIntent?.status]);

  useEffect(() => {
    if (didStartCountdown.current) return;
    // Nowhere to go — this page is the end of the flow, not a waypoint.
    if (!statusTarget) return;

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
  }, [mode, status?.paymentIntent?.status, statusTarget]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (statusTarget) topNavigate(statusTarget);
      return;
    }

    const t = window.setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, statusTarget]);

  const intentStatus = status?.paymentIntent?.status?.toLowerCase() ?? "unknown";
  const isSucceeded = intentStatus === "succeeded";
  const isFailed =
    intentStatus === "failed" || intentStatus === "canceled" || intentStatus === "cancelled";
  const waitingForWebhook =
    mode === "success" ? !isSucceeded && !isFailed : !isTerminal(intentStatus);
  const canManualRetry = mode === "success" && isFailed;

  useEffect(() => {
    if (!retryPending) return;
    if (!isTerminal(status?.paymentIntent?.status)) return;
    setRetryPending(false);
  }, [retryPending, status?.paymentIntent?.status]);

  const title =
    mode === "success"
      ? isSucceeded
        ? t("checkout.result.confirmed")
        : isFailed
          ? t("checkout.result.failed")
          : t("checkout.result.confirmingTitle")
      : isFailed
        ? t("checkout.result.notCompleted")
        : t("checkout.result.checking");

  const helperText =
    mode === "success"
      ? isSucceeded
        ? statusTarget
          ? t("checkout.result.confirmedBody")
          : t("checkout.result.confirmedBodyFinal")
        : isFailed
          ? t("checkout.result.retryBody")
          : t("checkout.result.confirmingBody")
      : isFailed
        ? t("checkout.result.notCompletedBody")
        : t("checkout.result.checkingBody");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <header>
        <BrandWordmark text="Krafta•Pay" className="text-lg" />
      </header>

      <main className="mt-12 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{helperText}</p>

        {/* When this page is where the customer ends up, it has to answer
            "what did I just pay for?" on its own — there is no merchant
            receipt page behind it. */}
        {isSucceeded && status?.paymentIntent ? (
          <div className="mt-6 rounded-lg border p-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                {status.paymentIntent.description || t("checkout.result.paid")}
              </span>
              <span className="font-medium tabular-nums">
                {formatMinorAmount(
                  status.paymentIntent.amountMinor,
                  status.paymentIntent.currency,
                )}
              </span>
            </div>
          </div>
        ) : null}

        {waitingForWebhook ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            <span>{t("checkout.result.withProvider")}</span>
          </div>
        ) : null}

        {error ? (
          <p className="mt-6 text-sm text-muted-foreground">
            We hit a snag checking the status — retrying automatically.
          </p>
        ) : null}

        {retryNote ? (
          <p className="mt-4 text-sm text-muted-foreground">{retryNote}</p>
        ) : null}

        {countdown !== null ? (
          <p className="mt-6 text-sm">
            Continuing in{" "}
            <span className="font-medium tabular-nums">{countdown}</span>s…
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-2">
          {canManualRetry ? (
            <Button
              type="button"
              className="h-10"
              disabled={retryPending}
              onClick={async () => {
                setRetryPending(true);
                setRetryNote(null);
                setError(null);
                try {
                  const res = await fetch(
                    `/api/checkout_sessions/${encodeURIComponent(publicToken)}/retry_charge`,
                    { method: "POST" },
                  );
                  const json = (await res.json().catch(() => null)) as
                    | { error?: string; status?: string; paymentIntentStatus?: string }
                    | null;
                  if (!res.ok) {
                    throw new Error(json?.error ?? `http_${res.status}`);
                  }

                  const nextIntentStatus = json?.paymentIntentStatus ?? "processing";
                  setRetryNote(
                    nextIntentStatus === "succeeded"
                      ? t("checkout.result.retrySucceeded")
                      : nextIntentStatus === "failed"
                        ? t("checkout.result.retryFailed")
                        : t("checkout.result.retryStarted"),
                  );

                  setStatus((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      paymentIntent: prev.paymentIntent
                        ? {
                            ...prev.paymentIntent,
                            status: nextIntentStatus,
                            updatedAt: new Date().toISOString(),
                          }
                        : prev.paymentIntent,
                    };
                  });
                } catch (e) {
                  setRetryPending(false);
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              {retryPending ? t("checkout.result.retrying") : t("checkout.result.retry")}
            </Button>
          ) : null}

          {/* Only offer "continue" when there is somewhere to continue TO. */}
          {statusTarget ? (
            <Button
              type="button"
              variant={canManualRetry ? "outline" : "default"}
              className="h-10"
              onClick={() => topNavigate(statusTarget)}
            >
              {t("checkout.result.continue")}
            </Button>
          ) : null}

          {/* Back to checkout is for someone who still needs to pay.

              Hiding it only on confirmed success was not enough. The dangerous
              case is the gap in between: the customer paid, the provider sent
              them back here, and their callback to us has not landed yet. For
              those seconds the status still reads "not paid", so this link
              appeared under the "checking with the provider" spinner and
              invited a second charge for an order that was already paid.

              So it is hidden for anyone who came back from a successful
              payment, until we positively know it failed. A customer who
              genuinely still owes money either arrived via the failure route,
              or has a confirmed failure and the retry button above. */}
          {mode !== "success" || isFailed ? (
            <a
              href={`/pay/${encodeURIComponent(publicToken)}`}
              className="inline-flex h-10 items-center px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("checkout.result.back")}
            </a>
          ) : null}
        </div>
      </main>

      <footer className="mt-12 flex items-center gap-1 text-xs text-muted-foreground">
        <span>Powered by</span>
        <BrandWordmark text="Krafta•Pay" className="text-xs" />
      </footer>
    </div>
  );
}
