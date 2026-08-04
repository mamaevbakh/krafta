"use client";

import { useT } from "@/lib/locales/context";

import { useState } from "react";

import { AtmosCardForm } from "./atmos-card-form.client";
import { ProviderRow } from "./provider-row";

type Provider = {
  id: string;
  name: string;
};

type SelectProviderResponse =
  | { attemptId: string; mode?: "redirect" | "inline"; redirectUrl?: string }
  | { error: string };

/**
 * A provider error message if there is one, else null — the caller supplies a
 * translated fallback. Returning an English "Unknown error" from here would
 * hard-code one language into a customer-facing surface.
 */
function getErrorMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as any).message === "string"
  ) {
    return (error as any).message;
  }
  return null;
}

export function ProviderPicker({
  publicToken,
  providers,
  amountMinor,
  currency,
}: {
  publicToken: string;
  providers: Provider[];
  amountMinor: number;
  currency: string;
}) {
  const t = useT();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inlineActive, setInlineActive] = useState(false);

  async function startProvider(
    providerId: string,
    viewType?: "WEB_VIEW" | "IFRAME" | "REDIRECT",
  ) {
    setIsStarting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/checkout_sessions/${encodeURIComponent(publicToken)}/select_provider`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, viewType }),
        },
      );

      const json = (await res.json().catch(() => ({}))) as SelectProviderResponse;
      if (!res.ok || (json as any).error) {
        throw new Error((json as any).error ?? `http_${res.status}`);
      }

      // Inline providers (Atmos) collect the card here on pay.krafta.uz instead
      // of redirecting to a provider-hosted page.
      if ((json as any).mode === "inline") {
        setInlineActive(true);
        return;
      }

      const redirectUrl = (json as any).redirectUrl as string | undefined;
      if (!redirectUrl) throw new Error("missing_redirect_url");
      window.location.assign(redirectUrl);
    } catch (e) {
      setError(getErrorMessage(e) ?? t("checkout.unknownError"));
    } finally {
      setIsStarting(false);
    }
  }

  if (inlineActive) {
    return (
      <div className="mt-3">
        <AtmosCardForm
          publicToken={publicToken}
          amountMinor={amountMinor}
          currency={currency}
        />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {providers.map((p) => (
        <ProviderRow
          key={p.id}
          providerId={p.id}
          name={p.name}
          description={
            p.id === "atmos" ? t("checkout.inlineCard") : t("checkout.redirectCard")
          }
          hint={isStarting ? t("checkout.starting") : t("checkout.continue")}
          variant="brand"
          disabled={isStarting}
          onSelect={() => startProvider(p.id, "REDIRECT")}
        />
      ))}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Could not start checkout: {error}
        </div>
      ) : null}
    </div>
  );
}
