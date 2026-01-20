"use client";

import { useMemo, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";

type Provider = {
  id: string;
  name: string;
};

type SelectProviderResponse =
  | { attemptId: string; redirectUrl: string }
  | { error: string };

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof (error as any).message === "string") {
    return (error as any).message;
  }
  return "Unknown error";
}

export function ProviderPicker({
  publicToken,
  providers,
}: {
  publicToken: string;
  providers: Provider[];
}) {
  const uzumProvider = useMemo(
    () => providers.find((p) => p.id === "uzum"),
    [providers]
  );

  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uzumIframeUrl, setUzumIframeUrl] = useState<string | null>(null);

  async function startProvider(providerId: string, viewType?: "WEB_VIEW" | "IFRAME" | "REDIRECT") {
    setIsStarting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/checkout_sessions/${encodeURIComponent(publicToken)}/select_provider`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, viewType }),
        }
      );

      const json = (await res.json().catch(() => ({}))) as SelectProviderResponse;
      if (!res.ok || (json as any).error) {
        throw new Error((json as any).error ?? `http_${res.status}`);
      }

      const redirectUrl = (json as any).redirectUrl as string | undefined;
      if (!redirectUrl) throw new Error("missing_redirect_url");

      if (providerId === "uzum" && viewType === "IFRAME") {
        setUzumIframeUrl(redirectUrl);
        return;
      }

      window.location.assign(redirectUrl);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {providers.map((p) => {
        const isUzum = p.id === "uzum";
        const showUzumIframe = isUzum && !!uzumIframeUrl;

        return (
          <div key={p.id} className="rounded-md border">
            <button
              type="button"
              className="w-full rounded-md px-4 py-3 text-left hover:bg-muted disabled:opacity-60"
              disabled={isStarting}
              onClick={() =>
                startProvider(p.id, isUzum ? "IFRAME" : "REDIRECT")
              }
            >
              <div className="flex items-center justify-between">
                <span>{p.name}</span>
              </div>
            </button>

            {showUzumIframe ? (
              <div className="border-t p-3">
                <div className="mb-2 flex items-center justify-end">
                  <a
                    href={uzumIframeUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open in new tab"
                    title="Open in new tab"
                    className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted"
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                </div>

                <iframe
                  src={uzumIframeUrl}
                  className="h-180 w-full rounded-md border bg-white"
                  allow="payment *; clipboard-read *; clipboard-write *"
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!uzumProvider ? (
        <div className="mt-3 text-xs text-muted-foreground">
          Uzum isnt configured for this merchant/environment.
        </div>
      ) : null}
    </div>
  );
}
